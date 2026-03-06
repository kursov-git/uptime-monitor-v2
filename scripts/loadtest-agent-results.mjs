#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const token = process.env.AGENT_TOKEN || '';
const monitorId = process.env.MONITOR_ID || '';
const concurrency = Number(process.env.CONCURRENCY || 10);
const requestsPerWorker = Number(process.env.REQUESTS_PER_WORKER || 50);
const batchSize = Number(process.env.BATCH_SIZE || 100);

if (!token || !monitorId) {
  console.error('Usage: AGENT_TOKEN=... MONITOR_ID=... node scripts/loadtest-agent-results.mjs');
  process.exit(1);
}

function makeBatch() {
  const now = Date.now();
  return {
    results: Array.from({ length: batchSize }, (_, i) => ({
      idempotencyKey: `lt-${now}-${Math.random().toString(36).slice(2)}-${i}`,
      monitorId,
      checkedAt: new Date(now).toISOString(),
      isUp: true,
      responseTimeMs: 20 + (i % 10),
      statusCode: 200,
      error: null,
    })),
  };
}

async function worker() {
  const durations = [];
  let failures = 0;

  for (let i = 0; i < requestsPerWorker; i++) {
    const body = makeBatch();
    const start = performance.now();
    try {
      const res = await fetch(`${baseUrl}/api/agent/results`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        failures += 1;
      }
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - start);
    }
  }

  return { durations, failures };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

(async () => {
  const start = performance.now();
  const all = await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const totalDuration = performance.now() - start;

  const durations = all.flatMap((w) => w.durations);
  const failures = all.reduce((acc, w) => acc + w.failures, 0);
  const totalRequests = concurrency * requestsPerWorker;

  console.log('Load test complete');
  console.log(`baseUrl=${baseUrl}`);
  console.log(`totalRequests=${totalRequests}`);
  console.log(`batchSize=${batchSize}`);
  console.log(`failures=${failures}`);
  console.log(`durationMs=${Math.round(totalDuration)}`);
  console.log(`rps=${(totalRequests / (totalDuration / 1000)).toFixed(2)}`);
  console.log(`p50=${percentile(durations, 50).toFixed(2)}ms`);
  console.log(`p95=${percentile(durations, 95).toFixed(2)}ms`);
  console.log(`p99=${percentile(durations, 99).toFixed(2)}ms`);

  process.exit(failures > 0 ? 1 : 0);
})();
