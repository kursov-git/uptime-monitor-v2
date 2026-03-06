# Uptime Monitor v2 Issue Seed

Использование:
1. Создать milestone: `v2-M1`, `v2-M2`, `v2-M3`, `v2-M4`.
2. Заводить issue из `Task` template.
3. Копировать заголовок и acceptance criteria ниже.

## M1

### T001: DB migration for Agent and agent relations
- Labels: `type:task`, `area:server`, `priority:p0`
- Milestone: `v2-M1`
- AC:
  - [ ] Добавлены поля `Monitor.agentId`, `CheckResult.agentId`, модель `Agent`.
  - [ ] Добавлены индексы и миграция применима на staging.
  - [ ] Backward compatibility сохранена.

### T002: Add server feature flags for agent plane
- Labels: `type:task`, `area:server`, `area:infra`, `priority:p1`
- Milestone: `v2-M1`
- AC:
  - [ ] Реализованы `ENABLE_AGENT_API`, `AGENT_SSE_ENABLED`, `ENABLE_BUILTIN_WORKER`.
  - [ ] Значения по умолчанию документированы.

### T003: Implement agent token hash verification and revoke check
- Labels: `type:task`, `area:server`, `area:security`, `priority:p0`
- Milestone: `v2-M1`
- AC:
  - [ ] В БД хранятся только hash токенов.
  - [ ] Revoked token получает `403`.
  - [ ] Проверки покрыты unit/integration тестами.

### T004: Implement GET /api/agent/jobs with contract validation
- Labels: `type:task`, `area:server`, `priority:p0`
- Milestone: `v2-M1`
- AC:
  - [ ] Эндпоинт отдает только задания текущего агента.
  - [ ] Схема валидируется.
  - [ ] Есть интеграционные тесты контракта.

### T005: Implement POST /api/agent/heartbeat
- Labels: `type:task`, `area:server`, `priority:p0`
- Milestone: `v2-M1`
- AC:
  - [ ] `lastSeen` обновляется корректно.
  - [ ] Возвращаются server commands и heartbeat interval.
  - [ ] Тесты добавлены.

### T006: Implement offline transition monitor service
- Labels: `type:task`, `area:server`, `area:infra`, `priority:p0`
- Milestone: `v2-M1`
- AC:
  - [ ] Агент переходит `ONLINE -> OFFLINE` по `offlineAfterSec`.
  - [ ] Есть audit event/status change log.

## M2

### T007: Extract checker package and move performCheck
- Labels: `type:task`, `area:checker`, `priority:p0`
- Milestone: `v2-M2`
- AC:
  - [ ] Создан `packages/checker`.
  - [ ] `performCheck` вынесен и переиспользуем.

### T008: Integrate checker package into builtin worker
- Labels: `type:task`, `area:server`, `area:checker`, `priority:p1`
- Milestone: `v2-M2`
- AC:
  - [ ] Server worker использует `@uptime-monitor/checker`.
  - [ ] Регрессий в существующих тестах нет.

### T009: Bootstrap apps/agent project skeleton
- Labels: `type:task`, `area:agent`, `priority:p1`
- Milestone: `v2-M2`
- AC:
  - [ ] Есть приложение агента с ENV config.
  - [ ] Логи и graceful shutdown реализованы.

### T010: Implement agent scheduler loop
- Labels: `type:task`, `area:agent`, `priority:p1`
- Milestone: `v2-M2`
- AC:
  - [ ] Проверки планируются по interval.
  - [ ] Обновление jobs корректно пересоздает schedule.

### T011: Implement POST /api/agent/results with idempotency dedupe
- Labels: `type:task`, `area:server`, `priority:p0`
- Milestone: `v2-M2`
- AC:
  - [ ] Поддержан `idempotencyKey`.
  - [ ] Дубликаты не создают второй result.
  - [ ] Возвращаются `acceptedCount/duplicateCount`.

### T012: Implement agent in-memory buffer and flush policy
- Labels: `type:task`, `area:agent`, `priority:p1`
- Milestone: `v2-M2`
- AC:
  - [ ] При сетевой ошибке результаты буферизуются.
  - [ ] При reconnect отправляются батчами.
  - [ ] На overflow drop oldest + метрика.

### T013: Implement agent SSE stream with Last-Event-ID and RESYNC
- Labels: `type:task`, `area:server`, `area:agent`, `priority:p0`
- Milestone: `v2-M2`
- AC:
  - [ ] SSE события `monitor.upsert/delete` доставляются.
  - [ ] Реконнект использует `Last-Event-ID`.
  - [ ] При gap сервер командует `RESYNC_JOBS`.

## M3

### T014: Build Agents UI page
- Labels: `type:task`, `area:ui`, `priority:p1`
- Milestone: `v2-M3`
- AC:
  - [ ] Таблица агентов со статусом и `lastSeen`.
  - [ ] Базовые действия доступны из UI.

### T015: Implement UI create/rotate/revoke token flows
- Labels: `type:task`, `area:ui`, `area:security`, `priority:p2`
- Milestone: `v2-M3`
- AC:
  - [ ] One-time token reveal поддержан.
  - [ ] Rotate/revoke операции работают.

### T016: Add executor selector to monitor form
- Labels: `type:task`, `area:ui`, `priority:p1`
- Milestone: `v2-M3`
- AC:
  - [ ] Можно выбрать `Builtin Worker` или `Agent`.
  - [ ] Сохранение назначения корректно работает.

### T017: Show agentName in results/incidents/notifications
- Labels: `type:task`, `area:ui`, `area:server`, `priority:p2`
- Milestone: `v2-M3`
- AC:
  - [ ] `agentName` отображается в UI и уведомлениях.

### T018: Add API rate limits and payload size limits
- Labels: `type:task`, `area:server`, `area:security`, `priority:p1`
- Milestone: `v2-M3`
- AC:
  - [ ] Для `/results` и `/heartbeat` включены лимиты.
  - [ ] Превышение лимитов корректно логируется.

### T019: Add metrics and alerts for agent plane
- Labels: `type:task`, `area:infra`, `area:server`, `priority:p1`
- Milestone: `v2-M3`
- AC:
  - [ ] Экспортируются ключевые метрики v2.
  - [ ] Настроены алерты по OFFLINE/dropped results.

### T020: Add audit events for agent lifecycle
- Labels: `type:task`, `area:server`, `area:security`, `priority:p2`
- Milestone: `v2-M3`
- AC:
  - [ ] События create/rotate/revoke/offline-online фиксируются.

## M4

### T021: Load test /api/agent/results on staging
- Labels: `type:task`, `area:infra`, `priority:p2`
- Milestone: `v2-M4`
- AC:
  - [ ] Подтверждены целевые latency/error thresholds.

### T022: Execute canary rollout plan (10% -> 50% -> 100%)
- Labels: `type:task`, `area:infra`, `priority:p2`
- Milestone: `v2-M4`
- AC:
  - [ ] Каждый этап зафиксирован в rollout журнале.
  - [ ] Регрессий по ключевым метрикам нет.

### T023: Validate rollback drill and runbook
- Labels: `type:task`, `area:infra`, `priority:p2`
- Milestone: `v2-M4`
- AC:
  - [ ] Rollback отработан на staging.
  - [ ] Runbook обновлен.

### T024: 24h canary stability signoff
- Labels: `type:task`, `area:infra`, `priority:p2`
- Milestone: `v2-M4`
- AC:
  - [ ] 24h без критических инцидентов.
  - [ ] Финальный signoff задокументирован.
