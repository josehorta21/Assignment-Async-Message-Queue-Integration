'use strict';

const { openStore, getJob, changeJob, key } = require('./store');
const { openBroker } = require('./broker');
const { log } = require('./logger');
const config = require('./config');
const { decideOutcome } = require('./policy');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  if (!Number.isFinite(config.jobDurationMs) || config.jobDurationMs < 100) {
    throw new Error('JOB_DURATION_MS must be at least 100.');
  }
  const redis = await openStore('worker');
  const { channel } = await openBroker('worker');
  await channel.prefetch(1);

  async function consume(message) {
    if (!message) return;
    let jobId = message.properties.messageId || null;
    try {
      let payload;
      try { payload = JSON.parse(message.content.toString()); }
      catch (_error) {
        log('worker', 'invalid_json_dead_letter', { jobId });
        channel.nack(message, false, false);
        return;
      }
      jobId = payload.id;
      if (!jobId || typeof jobId !== 'string') {
        log('worker', 'missing_job_id_dead_letter');
        channel.nack(message, false, false);
        return;
      }
      const existing = await getJob(redis, jobId);
      if (!existing) {
        log('worker', 'missing_job_state_dead_letter', { jobId });
        channel.nack(message, false, false);
        return;
      }
      if (existing.status === 'completed') {
        log('worker', 'duplicate_ignored', { jobId });
        channel.ack(message);
        return;
      }
      if (existing.status === 'failed') {
        log('worker', 'already_failed_dead_letter', { jobId });
        channel.nack(message, false, false);
        return;
      }

      const attempts = await redis.hIncrBy(key(jobId), 'attempts', 1);
      const startedAt = new Date().toISOString();
      await changeJob(redis, jobId, { status: 'processing', startedAt, error: '' });
      log('worker', 'job_started', { jobId, attempts, redelivered: message.fields.redelivered });

      const outcome = decideOutcome(existing.kind, attempts);
      if (outcome === 'dead-letter') {
        await changeJob(redis, jobId, { status: 'failed', error: 'Permanent processing failure; routed to DLQ.' });
        channel.nack(message, false, false);
        log('worker', 'job_dead_lettered', { jobId, attempts, queue: config.deadQueue });
        return;
      }
      if (outcome === 'retry') {
        await changeJob(redis, jobId, { status: 'retrying', error: 'Simulated transient error; message requeued.' });
        // Requeue is deliberately bounded by the attempt count stored in Redis.
        channel.nack(message, false, true);
        log('worker', 'job_nack_requeue', { jobId, attempts });
        return;
      }

      await sleep(config.jobDurationMs);
      await changeJob(redis, jobId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        error: ''
      });
      // ACK is sent only after the durable status write succeeds.
      channel.ack(message);
      log('worker', 'job_ack', { jobId, attempts, durationMs: config.jobDurationMs });
    } catch (error) {
      log('worker', 'processing_error', { jobId, message: error.message });
      // Uncommitted work is retried after Redis/broker connectivity recovers.
      await sleep(1000);
      try { channel.nack(message, false, true); }
      catch (ackError) { log('worker', 'nack_failed', { jobId, message: ackError.message }); }
    }
  }

  await channel.consume(config.queue, consume, { noAck: false });
  log('worker', 'consumer_ready', { queue: config.queue, prefetch: 1, manualAck: true });
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1); });
}
module.exports = { decideOutcome };
