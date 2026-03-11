# Uptime Monitor v2: Execution-Ready Roadmap (Server-Agent)

Этот документ фиксирует реализационный план `uptime-monitor v2` для перехода от монолитного воркера к модели `Control Plane + Remote Agents`, с явными требованиями по безопасности, протоколу, миграции и эксплуатации.

---

## 1) Scope v2

### In-Scope
- Один монитор выполняется ровно одним исполнителем: `builtin worker` или удалённый `agent`.
- Удалённый агент получает задания через `SSE + REST bootstrap`.
- Результаты доставляются батчами, с идемпотентностью и ретраями.
- Сервер отслеживает liveness агента через heartbeat и переводит в `OFFLINE`.
- В UI есть управление агентами и назначение агента монитору.
- Уведомления и логи всегда содержат `agentName`.

### Out of Scope (v2+)
- Many-to-many `Monitor ↔ Agent`.
- Quorum/consensus стратегии.
- Постоянное on-disk хранилище очереди результатов у агента.
- Автоматический autoscaling агентов.

---

## 2) Целевые архитектурные решения (фиксируются для v2)

| Вопрос | Решение v2 |
|---|---|
| Назначение | `1 monitor -> 1 executor` (`agentId` nullable, `null` = builtin worker) |
| Канал доставки | `SSE` как primary, `GET /jobs` как bootstrap/re-sync |
| Auth агента | Bearer token (`Agent.tokenHash`), в БД хранится только hash |
| Auth monitor payload | `AES-256-GCM`, `authPayloadEncrypted` + `keyVersion` |
| Offline | На основе `lastSeen + offlineAfterSec` (пер-агентно) |
| Совместимость | builtin worker включён по умолчанию (`ENABLE_BUILTIN_WORKER=true`) |

---

## 3) Security baseline (обязательно для v2)

### 3.1 Токены агентов
- Генерируем токен длиной не менее 32 байт (base64url).
- В БД храним только `tokenHash` (`sha256` или `argon2id`).
- Токен показывается только в момент создания/ротации (one-time reveal).
- Поддержать `POST /api/agents/:id/rotate-token`.
- Поддержать статус токена: `active/revoked` через `revokedAt`.

### 3.2 Шифрование auth payload
- Формат: `authPayloadEncrypted`, `authPayloadIv`, `authPayloadTag`, `keyVersion`.
- Алгоритм: `AES-256-GCM`.
- Агент получает `ENCRYPTION_KEY_<version>` через ENV.
- Сервер отдает `keyVersion`; агент выбирает нужный ключ.
- Ротация ключей: минимум 2 активные версии на период миграции.

### 3.3 API hardening
- Rate limits:
  - `/api/agent/results`: 60 req/min на агента.
  - `/api/agent/heartbeat`: 120 req/min на агента.
- Body size limit для `/results`: 1 MB.
- Валидация схем входа через `zod`.
- Логи без утечки секретов (token, auth payload).

---

## 4) Data model и миграции

## 4.1 Prisma schema (v2)

```prisma
model Agent {
  id                   String      @id @default(uuid())
  name                 String
  tokenHash            String      @unique
  keyVersion           Int         @default(1)
  status               AgentStatus @default(ONLINE)
  heartbeatIntervalSec Int         @default(30)
  offlineAfterSec      Int         @default(90)
  lastSeen             DateTime    @default(now())
  revokedAt            DateTime?
  createdAt            DateTime    @default(now())
  updatedAt            DateTime    @updatedAt

  monitors             Monitor[]
  results              CheckResult[]

  @@index([status, lastSeen])
}

enum AgentStatus {
  ONLINE
  OFFLINE
}
```

Изменения существующих моделей:
- `Monitor.agentId String?` + relation на `Agent`.
- `CheckResult.agentId String?` + relation на `Agent`.
- `CheckResult.resultIdempotencyKey String? @unique` (для дедупликации).
- Индексы:
  - `Monitor(agentId, active)`
  - `CheckResult(monitorId, createdAt desc)`
  - `CheckResult(agentId, createdAt desc)`

### 4.2 Миграционный план
1. Миграция схемы без переключения трафика.
2. Backfill: всем существующим мониторам `agentId = null`.
3. Деплой сервера с поддержкой новых nullable полей.
4. Включение UI функционала назначения агентов.
5. Постепенное назначение мониторов на агентов.

### 4.3 Rollback
- Если обнаружена деградация:
  - отключаем агентский контур флагом `ENABLE_AGENT_API=false`,
  - сохраняем исполнение через builtin worker,
  - новые поля в БД остаются совместимыми (nullable, без hard dependencies).

---

## 5) Контракт Agent API (v2)

Все endpoint под префиксом `/api/agent/*`, auth: `Authorization: Bearer <token>`.

### 5.1 `GET /api/agent/jobs`
- Назначение: bootstrap и full re-sync заданий агента.
- Ответ:
  - `serverTime`
  - `heartbeatIntervalSec`
  - `jobs[]`:
    - `monitorId`
    - `url`, `method`, `intervalSeconds`, `timeoutMs`
    - `expectedStatus`, `expectedBody`
    - `authPayloadEncrypted`, `authPayloadIv`, `authPayloadTag`, `keyVersion`
    - `version` (monotonic per monitor)

### 5.2 `POST /api/agent/results`
- Принимает батч результатов:
  - `idempotencyKey` (обязателен, уникален глобально)
  - `monitorId`
  - `checkedAt` (ISO)
  - `isUp`, `responseTimeMs`, `statusCode`, `error`
  - `meta` (опционально)
- Ответ:
  - `acceptedCount`
  - `duplicateCount`
  - `failed[]` (с причинами)

### 5.3 `POST /api/agent/heartbeat`
- Тело:
  - `agentVersion`
  - `queueSize`
  - `inFlightChecks`
- Ответ:
  - `now`
  - `heartbeatIntervalSec`
  - `commands[]` (`NONE | RESYNC_JOBS | ROTATE_KEY`)

### 5.4 `GET /api/agent/stream` (SSE)
- События:
  - `monitor.upsert`
  - `monitor.delete`
  - `agent.command`
- Каждое событие имеет `eventId` (монотонный cursor).
- Агент при реконнекте шлёт `Last-Event-ID`.
- Если cursor устарел: сервер возвращает команду `RESYNC_JOBS`.

### 5.5 Ошибки API
- `401` invalid token.
- `403` revoked token.
- `413` payload too large.
- `429` rate limit.
- `5xx` retry with backoff+jitter.

---

## 6) Изменения в сервере (Control Plane)

### 6.1 Новые модули
- `server/src/routes/agent.ts`
- `server/src/services/agent-auth.ts`
- `server/src/services/agent-jobs.ts`
- `server/src/services/agent-heartbeat.ts`
- `server/src/services/agent-sse.ts`
- `server/src/services/agent-offline-monitor.ts`

### 6.2 Фоновые задачи
- Каждые 10 сек:
  - проверяем `now - lastSeen > offlineAfterSec`,
  - переводим `status=OFFLINE`,
  - создаём audit event.

### 6.3 Feature flags
- `ENABLE_AGENT_API=true`
- `ENABLE_BUILTIN_WORKER=true`
- `AGENT_SSE_ENABLED=true`
- `AGENT_RESULT_MAX_BATCH=500`

---

## 7) Shared Checker (package split)

### Цель
Вынести HTTP check engine в `packages/checker`, чтобы переиспользовать в серверном воркере и агенте.

### Задачи
- Создать `packages/checker`.
- Перенести `performCheck()` из `server/src/worker.ts`.
- Контракт функции:
  - input: нормализованный monitor config.
  - output: `{ isUp, responseTimeMs, statusCode, error }`.
- В `packages/shared` оставить только типы/DTO без тяжёлых HTTP зависимостей.

### Критерий готовности
- И сервер, и агент используют один и тот же `@uptime-monitor/checker`.

---

## 8) Agent app (apps/agent)

### 8.1 ENV
- `MAIN_SERVER_URL` (required)
- `AGENT_TOKEN` (required)
- `ENCRYPTION_KEY_1` (required, минимум одна версия)
- `AGENT_HTTP_TIMEOUT_MS` (default 10000)
- `AGENT_BUFFER_MAX` (default 1000)

### 8.2 Runtime behavior
1. Bootstrap: `GET /jobs`.
2. Подписка на SSE поток.
3. Планирование проверок per monitor.
4. Выполнение check через `@uptime-monitor/checker`.
5. Отправка результатов батчами.
6. Heartbeat loop.

### 8.3 Buffering policy
- При сетевой ошибке результат уходит в in-memory queue.
- Очередь ограничена `AGENT_BUFFER_MAX`.
- При переполнении:
  - drop oldest,
  - инкремент `droppedResultsCounter`,
  - лог/метрика.
- Flush по reconnect, batch size <= `AGENT_RESULT_MAX_BATCH`.

---

## 9) UI/UX изменения

- Вкладка `Agents`:
  - список, статус, `lastSeen`, queue size, версия агента.
  - create/rotate/revoke token.
  - heartbeat/offline настройки.
- В форме монитора:
  - `Executor`: `Builtin Worker` или конкретный `Agent`.
- В таблицах результатов/инцидентов/уведомлений:
  - обязательное отображение `agentName`.

---

## 10) Observability и SLO

### 10.1 Метрики (минимум)
- `agent_online_total`, `agent_offline_total`
- `agent_heartbeat_lag_seconds`
- `agent_result_ingest_qps`
- `agent_result_duplicates_total`
- `agent_result_dropped_total`
- `agent_buffer_size`
- `agent_sse_reconnect_total`

### 10.2 SLO (v2)
- 99% heartbeat обрабатываются < 500ms.
- 99% батчей `/results` обрабатываются < 1s (до 500 записей).
- Детекция OFFLINE не позже `offlineAfterSec + 15s`.

### 10.3 Логи и audit
- Каждый `agentId` коррелируется через `requestId`.
- Audit события:
  - agent created
  - token rotated/revoked
  - status changed online/offline

---

## 11) Test Matrix (обязательно к релизу)

### 11.1 Unit
- token hash/verify.
- decrypt auth payload by `keyVersion`.
- idempotency dedupe.
- offline transition logic.

### 11.2 Integration (server)
- `/jobs` выдаёт только назначенные монитору задания.
- `/results` правильно сохраняет `agentId`.
- дубль `idempotencyKey` не создаёт второй `CheckResult`.
- heartbeat обновляет `lastSeen`.
- revoke token блокирует доступ.

### 11.3 Integration (agent)
- bootstrap + SSE re-sync.
- reconnect после сетевого сбоя.
- buffering + flush.
- overflow policy (drop oldest + метрика).

### 11.4 E2E
- monitor на builtin worker продолжает работать.
- monitor на удалённом агенте отправляет результаты.
- агент уходит в OFFLINE при отключении.
- после восстановления статуса `ONLINE` проверки продолжаются.

### 11.5 Security tests
- секреты не пишутся в логи.
- invalid/revoked token отклоняется.
- malformed encrypted payload корректно обрабатывается без краша.

---

## 12) План релиза (milestones)

## M1: Foundation (1 неделя)
- DB migration + agent API skeleton + feature flags.
- Базовые unit/integration тесты.

## M2: Checker split + agent runtime (1-1.5 недели)
- `packages/checker`, `apps/agent`, bootstrap/results/heartbeat.
- SSE + reconnect + re-sync.

## M3: UI + hardening + observability (1 неделя)
- Agents UI, token rotation/revoke.
- rate limits, SLO метрики, audit events.

## M4: Rollout (3-5 дней)
- canary на 1 агент и 5-10% мониторов.
- затем 50%, затем 100%.
- freeze/rollback playbook готов до выхода на 100%.

---

## 13) Rollout checklist

- [ ] Миграции применены, rollback проверен на staging.
- [ ] Feature flags задокументированы.
- [ ] Нагрузочный тест `/api/agent/results` пройден.
- [ ] Алерты на OFFLINE и на рост dropped results настроены.
- [ ] Runbook инцидентов написан.
- [ ] Canary без регрессий минимум 24 часа.

---

## 14) Definition of Done (v2)

1. builtin worker работает без изменений для мониторов без `agentId`.
2. Удалённый агент полностью работоспособен с ENV: `MAIN_SERVER_URL`, `AGENT_TOKEN`, `ENCRYPTION_KEY_1`.
3. Потеря соединения не приводит к потере всех результатов (buffering + controlled drop policy).
4. OFFLINE детектируется автоматически и отображается в UI.
5. Все уведомления/логи/результаты содержат `agentName`.
6. Token rotation/revoke работают и покрыты тестами.
7. API контракт зафиксирован тестами, CI зелёный.
8. GitHub Actions CI использует минимальные permissions, concurrency cancel и timeout для джоб.
9. Canary rollout и rollback-playbook подтверждены на staging.
