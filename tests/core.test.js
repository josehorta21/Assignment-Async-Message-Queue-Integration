'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateJob, createJob, presentJob } = require('../src/job');
const { validate } = require('../src/uuid');
const { decideOutcome } = require('../src/policy');

test('accepts valid names and defaults to normal processing', () => {
  assert.deepEqual(validateJob({ name: '  Generate report  ' }), {
    value: { name: 'Generate report', kind: 'normal' }
  });
});

test('rejects empty, excessive and unsupported input', () => {
  assert.match(validateJob(null).error, /JSON/);
  assert.match(validateJob({ name: 'a' }).error, /3 and 80/);
  assert.match(validateJob({ name: 'a'.repeat(81) }).error, /3 and 80/);
  assert.match(validateJob({ name: 'Report', kind: 'unknown' }).error, /kind/);
});

test('creates UUID v4 jobs with a queued state', () => {
  const job = createJob({ name: 'Export', kind: 'normal' }, '2026-11-19T00:00:00.000Z');
  assert.equal(validate(job.id), true);
  assert.equal(job.status, 'queued');
  assert.equal(job.attempts, '0');
  assert.equal(job.createdAt, '2026-11-19T00:00:00.000Z');
  assert.equal(presentJob(job).attempts, 0);
  assert.equal(presentJob(job).completedAt, null);
});

test('invalid UUID paths are rejected', () => {
  assert.equal(validate('not-a-uuid'), false);
  assert.equal(validate('..'), false);
});

test('normal jobs succeed and a transient failure retries once', () => {
  assert.equal(decideOutcome('normal', 1), 'complete');
  assert.equal(decideOutcome('flaky', 1), 'retry');
  assert.equal(decideOutcome('flaky', 2), 'complete');
});

test('poison jobs and over-retried messages are routed to DLQ', () => {
  assert.equal(decideOutcome('poison', 1), 'dead-letter');
  assert.equal(decideOutcome('normal', 4, 3), 'dead-letter');
});
