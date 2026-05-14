# Architectural Review — uptime-monitor-v2

**Author:** Claude Opus 4.7 (AI-assisted architectural review)
**Date:** 2026-05-14
**Project:** uptime-monitor-v2
**Repository:** https://github.com/kursov-git/uptime-monitor-v2

## Summary

uptime-monitor-v2 is a self-hosted, split-architecture uptime monitoring system. It monitors HTTP/HTTPS endpoints (including certificate expiry), TCP ports, and DNS records. It supports authenticated multi-step checks, notifications via Telegram and Zulip, remote execution through registered agents, a builtin worker, and a public status page.

Production topology: control plane on `onedashmsk`, agent hosts `cloudruvm1` and `ruvdskzn`, domain `ping-agent.ru`. Deployment via `docker-compose.split.yml` (split-runtime mode). SQLite with WAL mode.

## Recommendations (ranked by value/effort)

### 1. Persistent flapping state

**Problem:** Flapping detection is stored in an in-memory `Map` and lost on server restart. If restart happens during a monitor flap — notifications are silently dropped.

**Fix:** Persist flapping window in SQLite. Store `failCount` and `firstFailureAt` in a table. Restore on startup. ~2-3h.

### 2. API versioning

**Problem:** All routes live under `/api/...` without version prefix. Agent protocol evolution (agents already carry `CURRENT_AGENT_VERSION`) risks silent incompatibility.

**Fix:** Add `/api/v1/...` prefix now. Old agents keep working via redirect or duplicate proxy. ~30min.

### 3. Browser SSE reconnect

**Problem:** Agent SSE has bounded exponential backoff. Browser SSE in `App.tsx` has no reconnect — connection loss means lost real-time updates until manual page reload.

**Fix:** Wrap browser `EventSource` in a hook with exponential backoff + jitter, matching the agent SSE pattern. ~1h.

### 4. Prometheus metrics

**Problem:** A monitoring system with no self-monitoring. No visibility into API latency percentiles, check frequency, agent queue depth, DB size, memory usage.

**Fix:** Add `fastify-metrics` (`prom-client`), expose `GET /metrics` (IP-restricted), basic Grafana dashboard. ~2-3h.

### 5. Agent token expiry

**Problem:** Agent tokens live forever — only manual rotation or revoke. A compromised token (leaked `.env` on agent host) grants permanent access.

**Fix:** Add `expiresAt` to `Agent` model, optional TTL at creation (default 90 days). Agent on `401` heartbeat requests re-registration. ~evenings.

### 6. Circuit breaker for external checks

**Problem:** `packages/checker` does 3 immediate retries with no delay. For HTTP targets this can worsen load (thundering herd with multiple agents checking simultaneously).

**Fix:** Add jitter between retries (1s, 2s, 4s) and configurable `retryStrategy` in monitor config. ~3-4h.

### 7. Monorepo build caching

**Problem:** CI rebuilds all shared packages from scratch on every job (`npm ci` in each of 4 jobs).

**Fix:** Add `turbo` or `nx` for incremental builds with caching. Estimated ~40-50% CI time reduction at current project size. ~evening.

### 8. Differentiated rate limiting

**Problem:** Global `@fastify/rate-limit` applies equally to all routes. Public status page and auth endpoints share the same budget.

**Fix:** Separate limits: `/api/auth/*` — strict (already done), `/api/public/*` — lenient, `/api/*` — standard. ~30min.

### 9. PostgreSQL migration (strategic)

**Problem:** Split-mode with multiple processes already hits SQLite limits — `DB_INIT_ON_START=false` for workers, binary-split fallback on `SQLITE_BUSY`. At >100 checks/min, write contention becomes the bottleneck.

**Fix:** Migrate to PostgreSQL. Prisma supports it natively. Schema is already relational, foreign keys in place. ~1-2 days. Unlocks horizontal API scaling.

## Priority Matrix

| # | Recommendation | Value | Effort |
|---|---|---|---|
| 1 | Persistent flapping | High | Low |
| 2 | API versioning | High | Low |
| 3 | Browser SSE reconnect | Medium | Low |
| 4 | Prometheus metrics | Medium | Medium |
| 5 | Agent token expiry | Medium | Medium |
| 6 | Circuit breaker | Low | Medium |
| 7 | Turbo/Nx caching | Medium | Medium |
| 8 | Rate limit differentiation | Low | Low |
| 9 | PostgreSQL migration | High | High |

## Key Risks

- SQLite write contention will become the scaling bottleneck before any other component
- In-memory flapping state means a server restart during an incident drops the alert
- No API versioning creates coupling between server and agent deployments
- Agent tokens with no expiry are a latent security risk across all agent hosts
