# 🔍 Technical Audit: Uptime Monitor

> **Last Updated:** 2026-03-03
> **Focus:** Architecture, Code Quality, Security, Performance
> **Product Roadmap:** see [ROADMAP.md](./ROADMAP.md)

## 📊 Technical Scorecard

| Category | Score | Summary |
|----------|:-----:|---------| 
| **Architecture** | 9/10 | Modular, scheduler-based worker, persistent state, SSE streaming |
| **Code Quality** | 8.5/10 | Strict TypeScript, centralized types, dead code & duplication found |
| **Security** | 8/10 | JWT Auth, RBAC, Rate limiting, AES-256-GCM — test endpoints in prod |
| **Performance** | 8.5/10 | Scheduler (no busy-polling), Retention policy — DB over-fetching found |
| **Testing** | 7/10 | Vitest + Playwright E2E — shared types not fully aligned with actual API |
| **DevOps** | 8.5/10 | Docker, SSH key deploy, Nginx proxy, seed.js fix |

**Total Score: 8.3/10**

---

## 🛠 Tech Stack

- **Backend:** Node.js (v20+), Fastify, Prisma ORM, SQLite
- **Frontend:** React 18, Vite, TypeScript, Recharts, Lucide React
- **Testing:** Vitest (unit), Playwright (E2E)
- **Tools:** Docker, Docker Compose, Nginx, Pino

## ✅ Key Technical Achievements

### 1. Scheduler-Based Worker
Abandoned busy-polling (infinite loop) in favor of a robust scheduler:
- Individual `setTimeout` per monitor based on its interval
- `syncSchedule()` runs every 30s to pick up DB changes
- Drastically reduced CPU usage and DB load

### 2. Data Retention Policy
Implemented `RetentionService` to prevent DB explosion:
- Configurable `retentionDays` (default 30)
- Hourly cleanup job removes old `CheckResult` records
- Also cleans `AuditLog` older than 90 days

### 3. Shared Validation
Extracted validation logic to `server/src/lib/validation.ts`:
- Reusable across API and Worker
- Fully unit-tested (20+ test cases)

### 4. Monitor History
Frontend supports historical data visualization:
- `GET /api/monitors/:id/stats` with time filters and pagination
- Parallel DB queries (`Promise.all`) for stats, count, and avg
- Recharts-based area chart for response times

### 5. Production Deployment Pipeline
Secure SSH key-based deployment (`deploy.sh`):
- No hardcoded credentials in codebase
- Nginx reverse proxy routes `/api/` to server container
- `seed.js` (plain JS) replaces `seed.ts` — `tsx` unavailable in production image
- `.env` preserved across deploys

### 6. Reliable DNS Resolution & Network Resilience
- `node:20-slim` Docker image (glibc) to resolve `EAI_AGAIN` DNS errors
- `axios-retry` in the check worker for transient network blips
- Both `EAI_AGAIN` and `ECONNRESET` handled

### 7. Notification History & UI Enhancements
- Granular notification history tracking per monitor via API
- Enhanced Frontend with "Recent Notifications" on Monitor details

### 8. Real-Time Dashboard (SSE)
- Replaced 10-second polling with Server-Sent Events
- JWT auth via query parameters for SSE stream support

### 9. Advanced Authentication Support
- `CSRF_FORM_LOGIN` with CookieJar per check to avoid session leakage
- Multi-step flow: GET → extract CSRF token → POST with cookies

### 10. Graceful Error & Auth Handling
- Global `<ErrorBoundary>` for React crash recovery
- "Session Expired" modal via `auth:expired` custom event

### 11. Security Features
- AES-256-GCM encryption for secrets in DB (`lib/crypto.ts`)
- Whitelist-based field filtering on notification settings
- Masked token display in frontend (`maskSecret`)
- RBAC with Admin/Viewer roles
- API key read-only enforcement

---

## ⚠️ Technical Debt & Recommendations

### 🔴 Critical

#### 1. Test Endpoints Shipped to Production
**Files:** `server/src/routes/monitors.ts` (lines 29–52)
- Routes `/api/monitors/test-login` and `/api/monitors/test-protected` with hardcoded credentials (`admin`/`secret`) ship to production.
- These are accessible without authentication: `test-login` has no `preHandler`.
- **Impact:** Information disclosure, attack surface expansion.
- **Fix:** Remove entirely, or guard behind `NODE_ENV !== 'production'` check. These belong in E2E test fixtures, not production routes.

---

### 🟠 High

#### 2. Flapping State Lost on Restart
**Files:** `server/src/services/flapping.ts` (line 17)
- `FlappingService.states` is a `static Map` in memory. On server restart (deploy, crash), all flapping state is lost.
- **Impact:** Duplicate DOWN notifications after every deploy; false "recovery" notifications.
- **Fix:** Persist flapping state in the DB (a `MonitorState` table or JSON column on `Monitor`). Hydrate on startup.

#### 3. Notification Settings Fetched on Every Check
**Files:** `server/src/services/flapping.ts` (lines 98–120)
- `getSettings()` performs 2 DB queries (`notificationSettings` + `monitorNotificationOverride`) on **every single check** for every monitor, even when the monitor is healthy.
- **Impact:** With 50 monitors at 10s intervals = 600 unnecessary DB queries/minute.
- **Fix:** Cache settings in memory with a 60s TTL, or only fetch on failure (when `!isUp`). `RetentionService` already fetches settings on its own schedule — a good pattern to follow.

#### 4. Auth Credentials Stored Unencrypted in Monitor Table
**Files:** `schema.prisma` (line 25), `worker.ts` (lines 163–178)
- `authPayload` contains plaintext passwords (`username:password` for BASIC, JSON with password for FORM_LOGIN) stored as a raw `String` field.
- Notification secrets are encrypted via `lib/crypto.ts`, but monitor auth payloads are not.
- **Impact:** Database compromise exposes all monitored service credentials.
- **Fix:** Apply `encrypt()`/`decrypt()` to `authPayload` during create/update and before use in worker.

---

### 🟡 Medium

#### 5. Unused `workerAxios` Instance
**Files:** `server/src/worker.ts` (lines 9–20)
- `workerAxios` is created and configured with retry logic but **never used**. Each `performCheck` creates a fresh `axios.create()` with a duplicate retry config (lines 144–160).
- **Impact:** Dead code, duplicated retry configuration.
- **Fix:** Remove the unused `workerAxios` or extract retry config into a shared factory.

#### 6. SSE Has No Heartbeat or Client Limits
**Files:** `server/src/services/sse.ts`
- No periodic keep-alive/heartbeat — proxies (Nginx) and browsers may silently drop idle SSE connections. Default Nginx `proxy_read_timeout` is 60s.
- No limit on connected clients — memory grows unboundedly.
- Dead client detection relies solely on `close` event from `client.raw`.
- **Impact:** Dashboard stops updating silently; potential resource exhaustion.
- **Fix:** Add a 30s heartbeat (`:heartbeat\n\n`), limit max clients, and add `proxy_read_timeout 3600s` guidance for Nginx.

#### 7. Shared Types Diverge from Actual API
**Files:** `packages/shared/src/index.ts`
- `Role` type includes `'USER'` which doesn't exist in the system (only `'ADMIN' | 'VIEWER'`).
- `Settings` interface includes `discordEnabled`/`discordWebhookUrl` which aren't implemented.
- `StatsResponse` interface doesn't match the actual `/:id/stats` response shape (API returns `{ results, total, limit, offset }` not `{ stats, history, pagination }`).
- **Impact:** Type safety illusion — consumers think they have correct types but they're wrong.
- **Fix:** Align shared types with actual API responses. Remove phantom fields.

#### 8. CSRF Token Extraction Hardcoded to Django
**Files:** `server/src/worker.ts` (line 195)
- Regex `/input[^>]+name=["']csrfmiddlewaretoken["']/` only matches Django's CSRF field name.
- **Impact:** Won't work with Spring (`_csrf`), Rails (`authenticity_token`), or Laravel (`_token`).
- **Fix:** Make the CSRF field name configurable via a `csrfFieldName` column on the Monitor model, defaulting to `csrfmiddlewaretoken`.

#### 9. `/api/auth/me` Returns 200 with Error Body Instead of Status Code
**Files:** `server/src/routes/auth.ts` (lines 66–68)
- When user is not found, returns `{ error: 'User not found' }` with HTTP 200 (no `reply.status(404)`).
- **Impact:** Frontend interprets it as a valid auth response.
- **Fix:** Return `reply.status(404).send({ error: 'User not found' })`.

---

### 🟢 Minor (Nice to Have)

#### 10. No API Input Validation Schema (Fastify)
- Routes use manual validation instead of Fastify's built-in JSON Schema validation (`schema` option).
- Fastify generates compile-time validators with `ajv` which are significantly faster.
- **Fix:** Add `schema: { body: { ... } }` to route definitions, or add `@fastify/swagger` for auto-generated OpenAPI docs.

#### 11. `App.tsx` is Monolithic (287 lines)
- Contains all route definitions, all handlers (`handleCreate`, `handleUpdate`, `handleDelete`, `handleToggle`), and layout in one file.
- **Fix:** Extract dashboard logic into a `DashboardPage.tsx`, move handlers into a custom hook `useMonitors()`.

#### 12. React Component Re-rendering Optimization
- Static configurations (like `statusLabel` in `MonitorCard`) defined inside the render cycle.
- `fetchMonitors` is called after every create/update/delete/toggle without debouncing.
- **Fix:** Move static objects outside components. Debounce `fetchMonitors`, or let SSE handle real-time updates after mutations (remove manual refetch).

#### 13. Retention Cleanup Hardcoded for Audit Logs
**Files:** `server/src/services/retentionService.ts` (line 47)
- Audit log retention is hardcoded to 90 days, unlike check results which use configurable `retentionDays`.
- **Fix:** Make audit retention configurable, or at minimum document the 90-day hardcoded value.

#### 14. `sleep()` Utility Duplicated
**Files:** `server/src/services/telegram.ts` (line 8), `server/src/services/zulip.ts` (line 11)
- Identical `sleep()` function defined in both notifier files.
- **Fix:** Extract to `lib/utils.ts`.

#### 15. Missing `NotificationHistory` Retention
- `RetentionService` cleans `CheckResult` and `AuditLog`, but not `NotificationHistory`.
- Over time this table will grow unbounded.
- **Fix:** Add `NotificationHistory` cleanup to retention (e.g., 90 days).

---

## 📋 Technical Tasks Checklist

### Previously Completed
- [x] **Rate limiting** — protect API
- [x] **Persistent flapping state** — DB storage *(Note: only partially — in-memory `static Map`)*
- [x] **Scheduler worker** — replaced busy loop
- [x] **Unit tests** — Vitest setup + validation tests
- [x] **Retention policy** — auto-cleanup service
- [x] **Client-side routing** — `react-router-dom` implementation
- [x] **Refactor API Client** — Singleton axios instance
- [x] **E2E Tests** — Playwright setup
- [x] **Shared Types Package** — monorepo style sharing
- [x] **Encrypt secrets in DB** — AES-256-GCM for bot tokens / API keys
- [x] **Singleton PrismaClient** — extract to `lib/prisma.ts`
- [x] **Fix double getSettings()** — pass settings to `sendNotification()`
- [x] **Validate notification settings body** — whitelist-based field filtering
- [x] **Type `request.user`** — `@fastify/jwt` module augmentation
- [x] **Notification retry** — exponential backoff (3 attempts)
- [x] **API pagination limits** — `Math.min(limit, 1000)`
- [x] **DNS & Network Resilience** — `axios-retry`, `node:20-slim`
- [x] **UI Enhancements** — Per-monitor history filtering, Settings navigation

### New Tasks from This Audit
- [ ] **🔴 Remove test endpoints** from production routes
- [ ] **🟠 Persist flapping state** in DB (currently in-memory `static Map`)
- [ ] **🟠 Cache notification settings** to reduce DB load
- [ ] **🟠 Encrypt `authPayload`** in Monitor table (parity with notification secrets)
- [ ] **🟡 Remove unused `workerAxios`** and deduplicate retry config
- [ ] **🟡 Add SSE heartbeat** and client limits
- [ ] **🟡 Fix shared types** alignment with actual API
- [ ] **🟡 Make CSRF field name configurable**
- [ ] **🟡 Fix `/api/auth/me` status code** for missing user
- [ ] **🟢 Add Fastify JSON Schema validation**
- [ ] **🟢 Refactor `App.tsx`** into smaller components
- [ ] **🟢 Deduplicate `sleep()` utility**
- [ ] **🟢 Add `NotificationHistory` to retention cleanup**
