'use strict';

function decideOutcome(kind, attempts, maxAttempts = 3) {
  if (attempts > maxAttempts || kind === 'poison') return 'dead-letter';
  if (kind === 'flaky' && attempts === 1) return 'retry';
  return 'complete';
}

module.exports = { decideOutcome };
