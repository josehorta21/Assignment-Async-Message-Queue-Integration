'use strict';

const { randomUUID } = require('node:crypto');

const VALID_KINDS = Object.freeze(['normal', 'flaky', 'poison']);

function validateJob(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Expected a JSON object.' };
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 3 || name.length > 80) {
    return { error: 'Job name must be between 3 and 80 characters.' };
  }
  const kind = input.kind === undefined ? 'normal' : input.kind;
  if (!VALID_KINDS.includes(kind)) {
    return { error: 'Job kind must be normal, flaky, or poison.' };
  }
  return { value: { name, kind } };
}

function createJob(payload, now = new Date().toISOString()) {
  return {
    id: randomUUID(),
    name: payload.name,
    kind: payload.kind,
    status: 'queued',
    attempts: '0',
    createdAt: now,
    updatedAt: now,
    startedAt: '',
    completedAt: '',
    error: ''
  };
}

function presentJob(record) {
  if (!record || !record.id) return null;
  return {
    ...record,
    attempts: Number(record.attempts || 0),
    startedAt: record.startedAt || null,
    completedAt: record.completedAt || null,
    error: record.error || null
  };
}

module.exports = { validateJob, createJob, presentJob, VALID_KINDS };
