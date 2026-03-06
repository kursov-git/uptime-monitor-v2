# Uptime Monitor v2 Rollback Runbook

## Immediate Actions
1. Set `ENABLE_AGENT_API=false` on server.
2. Redeploy server.
3. Keep `ENABLE_BUILTIN_WORKER=true`.
4. Verify `/health` and monitor checks resume through builtin worker.

## Data Safety
- Do not roll back DB migrations.
- `agentId` fields are nullable; monitors continue to work without agent assignment.

## Recovery Verification
- `GET /api/monitors` shows active checks and fresh results.
- Alert channels are sending expected notifications.
- No growing backlog in agent queues.

## Communication
- Log incident timeline in `docs/V2_CANARY_SIGNOFF.md`.
- Notify stakeholders about rollback reason and ETA for retry.

## Retry Checklist
- Identify root cause.
- Add regression test.
- Repeat staging canary before production retry.
