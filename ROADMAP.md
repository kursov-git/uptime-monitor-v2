# 🗺️ Product Roadmap: Uptime Monitor

> **Vision:** A reliable, self-hosted uptime monitoring solution for developers and small teams.
> **Technical Status:** see [CODE_REVIEW.md](./CODE_REVIEW.md)

## 🚀 Current Features (v1.2)

### Monitoring
- [x] **HTTP/HTTPS Checks** — monitor websites and APIs
- [x] **Advanced Authentication** — Basic, JSON Form, and CSRF Form Login
- [x] **Custom Intervals** — 10s to 24h checks
- [x] **Response Time Tracking** — ms precision
- [x] **Status Codes** — validates 2xx/3xx/4xx/5xx

### Dashboard
- [x] **Real-time Status** — instant visual feedback (UP/DOWN/PAUSED)
- [x] **History & Charts** — interactive response time graphs
- [x] **Detailed Logs** — paginated history of every check
- [x] **Quick Actions** — Pause/Resume/Edit/Delete monitors

### Management
- [x] **User Roles** — Admin (managed) vs Viewer (read-only)
- [x] **Audit Logs** — track who changed what
- [x] **Data Retention** — auto-cleanup of old logs (30 days default)

### Notifications
- [x] **Telegram Bot** — alert on UP/DOWN state changes
- [x] **Zulip** — configurable webhook notifications
- [x] **Flapping Protection** — suppresses rapid state oscillations
- [x] **Per-Monitor Overrides** — custom notification settings per monitor

### Deployment
- [x] **Docker Compose** — one-command build & start
- [x] **SSH Key Deployment** — `bash deploy.sh` (no hardcoded credentials)
- [x] **Nginx Reverse Proxy** — client routes API calls through nginx
- [x] **Split Server Runtime Roles** — API, worker, retention, and agent offline monitor can now run as separate processes via `SERVER_ROLE`
- [x] **Production Logging Modes** — pretty logs for dev, JSON logs for production
- [x] **Operations Runbook** — backup/restore, runtime health, split deployment and recovery steps documented

### Testing
- [x] **Unit Tests** — Vitest setup with validation logic testing
- [x] **E2E Tests** — Playwright tests for Authentication and Dashboard
- [x] **GitHub Actions CI** — server integration+build, client test+lint+build, and Chromium E2E on push/PR/manual run
- [x] **CI Hardening Baseline** — minimal token permissions, concurrency cancel, job timeouts
- [x] **P0 Technical Hardening** — worker/checker test split, stricter JWT handling, fail-closed secret encryption, stable agent SSE

---

## 📅 Upcoming Roadmap

## 🛠️ Technical Backlog Status

### P0: Hardening Baseline
- [x] Fix `worker`/`checker` test boundary
- [x] Remove generic JWT query-token auth from REST API
- [x] Make secret encryption fail-closed in production
- [x] Remove absolute timeout from agent SSE stream
- [x] Make CI a real quality gate

### P1: Runtime Separation
- [x] Split API and background jobs into separate runtime roles
- [x] Batch agent result ingestion and prepare SQLite/Postgres transition path
- [x] Add production logging mode without `pino-pretty`
- [x] Centralize environment validation

### P2: Scalability
- [ ] Prepare Postgres-first deployment path
- [ ] Add observability for worker lag, agent lag, and dropped results
- [ ] Version the server/agent protocol contract

### Q1 Goals: Resilience & Notifications
1.  **Email Notifications (SMTP)**
    -   Current: Telegram + Zulip
    -   Planned: Email (SMTP), Slack Webhook, Discord
    -   *Status: Pending*

2.  **Public Status Pages**
    -   Create read-only public pages for sharing uptime with customers
    -   Custom domain support (CNAME)
    -   *Status: Pending*

3.  **Maintenance Windows**
    -   Schedule downtime to suppress alerts during updates
    -   One-time or recurring windows
    -   *Status: Pending*

4.  **Шифрование секретов в БД**
    -   *Status: Completed (AES-256-GCM implemented)*

5.  **Надёжность доставки уведомлений**
    -   *Status: Completed (3 retries with exponential backoff implemented)*

### Q2 Goals: Enterprise Features
4.  **Team Management**
    -   Organizations / Teams
    -   Invite users via email
    -   Granular permissions

5.  **Advanced Checks & Configuration**
    -   TCP/Ping checks
    -   Keyword assertions (body must contain "Success")
    -   SSL Expiry monitoring
    -   [x] **Customizable Timeouts:** Allow users to define a custom timeout per monitor (currently hardcoded to 30s).
    -   [x] **Advanced Flapping Diagnostics:** Provide detailed breakdown in the UI why a monitor is considered "flapping" vs "down".

6.  **Real-Time & Instant Feedback**
    -   [x] Transition the dashboard from 10s polling to WebSockets/SSE for instant UI updates when a monitor changes state.

7.  **Incident Management**
    -   Create "Incidents" for downtime events
    -   Post-mortem notes
    -   Timeline of resolution

---

## 💡 Feature Requests / Backlog

- [ ] **Dark Mode Toggle** (Currently forced Dark Mode)
- [ ] **Export Data** — CSV/JSON export of check history
- [ ] **Import Monitors** — Bulk import from JSON
- [ ] **Webhook Integrations** — Generic webhook for custom alerting
- [ ] **SLA Reporting** — Calculate 99.9% uptime over custom periods
- [x] **Singleton PrismaClient** — 8+ инстансов → один `lib/prisma.ts`
- [x] **История уведомлений** — UI для просмотра отправленных/упавших уведомлений
