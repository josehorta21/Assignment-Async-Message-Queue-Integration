'use strict';

/*
 * End-to-end QA: requires the local Docker stack to be running.
 * Destructive worker stop/start and SIGKILL tests require RUN_DESTRUCTIVE_QA=1.
 * Results are written to docs/qa-run-results.json for user review.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const destructive = process.env.RUN_DESTRUCTIVE_QA === '1';
const RESULTS_FILE = path.join(__dirname, '..', 'docs', 'qa-run-results.json');
const results = { startedAt: new Date().toISOString(), destructive, checks: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function record(name, status, details = {}) {
  results.checks.push({ name, status, ...details });
  console.log(`${status === 'passed' ? 'PASS' : status === 'skipped' ? 'SKIP' : 'FAIL'} | ${name}`, details);
  if (status === 'failed') throw new Error(`QA failed: ${name}`);
}
async function http(pathname, options = {}) {
  const response = await fetch(BASE + pathname, { ...options, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return { data, response };
}
async function send(name, kind = 'normal') {
  const start = performance.now();
  const { data, response } = await http('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind })
  });
  return { ...data, code: response.status, elapsedMs: Math.round(performance.now() - start) };
}
async function waitFor(jobId, statuses, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await http(`/api/jobs/${jobId}`);
    if (statuses.includes(data.status)) return data;
    await sleep(450);
  }
  throw new Error(`Timed out awaiting ${statuses.join('/')} for ${jobId}`);
}
function compose(...args) {
  return execFileSync('docker', ['compose', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
}
async function waitForConsumers(expected, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { data } = await http('/api/metrics');
      if (expected(data.consumers)) return data;
    } catch (_error) {}
    await sleep(350);
  }
  throw new Error('Timed out waiting for expected consumer count');
}

async function run() {
  let workerStopped = false;
  try {
    const { data: health } = await http('/api/health');
    record('API, Redis and RabbitMQ healthy', health.ok ? 'passed' : 'failed', { health });

    // Warm-up before measuring the acceptance latency.
    const first = await send('QA single job');
    record('POST returns 202 and unique job ID', first.code === 202 && !!first.id ? 'passed' : 'failed', { code: first.code, id: first.id });
    record('Measured HTTP 202 latency below 100 ms', first.elapsedMs < 100 ? 'passed' : 'failed', { measuredMs: first.elapsedMs, targetMs: 100 });
    const completed = await waitFor(first.id, ['completed']);
    record('Polling observes completed state', completed.status === 'completed' ? 'passed' : 'failed', { attempts: completed.attempts });

    const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => send(`QA burst ${i + 1}`)));
    const { data: duringBurst } = await http('/api/metrics');
    record('Five jobs published concurrently', burst.every(job => job.code === 202) ? 'passed' : 'failed', { count: burst.length });
    record('RabbitMQ buffered pending jobs', duringBurst.queued > 0 ? 'passed' : 'failed', { queued: duringBurst.queued });
    await Promise.all(burst.map(job => waitFor(job.id, ['completed'])));
    record('Burst drained without lost jobs', 'passed', { completed: burst.length });

    const flaky = await send('QA recoverable failure', 'flaky');
    const recovered = await waitFor(flaky.id, ['completed']);
    record('Transient failure NACK/requeue was handled', recovered.attempts >= 2 ? 'passed' : 'failed', { attempts: recovered.attempts });

    const { data: beforeDlq } = await http('/api/metrics');
    const poison = await send('QA poison payload', 'poison');
    const failed = await waitFor(poison.id, ['failed']);
    const { data: afterDlq } = await http('/api/metrics');
    record('Poison payload failed and reached DLQ', failed.status === 'failed' && afterDlq.deadLettered > beforeDlq.deadLettered ? 'passed' : 'failed', {
      before: beforeDlq.deadLettered,
      after: afterDlq.deadLettered
    });

    if (!destructive) {
      record('Worker isolation, restart and SIGKILL recovery', 'skipped', { instruction: 'Run with RUN_DESTRUCTIVE_QA=1 to perform Docker worker lifecycle tests.' });
      return;
    }

    compose('stop', 'worker');
    workerStopped = true;
    await waitForConsumers(count => count === 0);
    const offline = await Promise.all([
      send('QA queued with worker offline 1'),
      send('QA queued with worker offline 2')
    ]);
    const { data: buffer } = await http('/api/metrics');
    record('Ingress continues while worker offline', offline.every(job => job.code === 202) && buffer.queued >= 2 ? 'passed' : 'failed', { queued: buffer.queued });
    compose('start', 'worker');
    workerStopped = false;
    await waitForConsumers(count => count >= 1);
    await Promise.all(offline.map(job => waitFor(job.id, ['completed'])));
    record('Stopped worker recovered durable queued jobs', 'passed', { completed: 2 });

    const midFlight = await send('QA SIGKILL while processing');
    await waitFor(midFlight.id, ['processing']);
    compose('kill', 'worker');
    // Docker restart policy starts the worker; the broker requeues the unacked message.
    await waitForConsumers(count => count >= 1, 30000);
    const replayed = await waitFor(midFlight.id, ['completed'], 45000);
    record('SIGKILL redelivered unacknowledged job', replayed.attempts >= 2 ? 'passed' : 'failed', { attempts: replayed.attempts });
  } finally {
    if (workerStopped) {
      try { compose('start', 'worker'); } catch (error) { console.error('Unable to restart worker:', error.message); }
    }
  }
}

run().catch(error => {
  results.error = error.message;
  process.exitCode = 1;
}).finally(() => {
  results.finishedAt = new Date().toISOString();
  results.passed = !results.error;
  results.complete = !results.error && results.checks.length > 0 && results.checks.every(check => check.status === 'passed');
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2) + '\n');
  console.log(`QA evidence written to ${RESULTS_FILE}`);
});
