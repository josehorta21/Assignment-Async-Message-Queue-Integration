'use strict';

const express = require('express');
const path = require('node:path');
const { validate: validateUUID } = require('./uuid');
const { validateJob, createJob } = require('./job');
const { openStore, addJob, getJob, listJobs, changeJob } = require('./store');
const { openBroker, publishConfirmed } = require('./broker');
const { log } = require('./logger');
const config = require('./config');

async function main() {
  const redis = await openStore('api');
  const { channel } = await openBroker('api', true);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', async (_req, res) => {
    try {
      await redis.ping();
      const queue = await channel.checkQueue(config.queue);
      res.json({ ok: true, broker: 'connected', statusStore: 'connected', queue: queue.messageCount });
    } catch (error) {
      res.status(503).json({ ok: false, message: 'A dependency is unavailable.' });
    }
  });

  app.post('/api/jobs', async (req, res) => {
    const parsed = validateJob(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const job = createJob(parsed.value);
    try {
      await addJob(redis, job);
      await publishConfirmed(channel, job);
      log('api', 'job_published', { jobId: job.id, kind: job.kind });
      res.set('Location', `/api/jobs/${job.id}`);
      return res.status(202).json({ id: job.id, status: 'queued', statusUrl: `/api/jobs/${job.id}` });
    } catch (error) {
      log('api', 'publish_failed', { jobId: job.id, message: error.message });
      // A lost publisher confirm may mean the broker actually accepted the message.
      // Marking the request as uncertain is safer than claiming guaranteed failure.
      try { await changeJob(redis, job.id, { status: 'publish_uncertain', error: 'Publication could not be confirmed.' }); }
      catch (storeError) { log('api', 'status_update_failed', { message: storeError.message }); }
      return res.status(503).json({ error: 'Unable to confirm queue publication.', id: job.id });
    }
  });

  app.get('/api/jobs', async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));
      res.json({ jobs: await listJobs(redis, limit) });
    } catch (error) { res.status(503).json({ error: 'Status store unavailable.' }); }
  });

  app.get('/api/jobs/:id', async (req, res) => {
    if (!validateUUID(req.params.id)) return res.status(400).json({ error: 'Invalid job ID.' });
    try {
      const job = await getJob(redis, req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      return res.json(job);
    } catch (error) { return res.status(503).json({ error: 'Status store unavailable.' }); }
  });

  app.get('/api/metrics', async (_req, res) => {
    try {
      const [queue, deadQueue, jobs] = await Promise.all([
        channel.checkQueue(config.queue),
        channel.checkQueue(config.deadQueue),
        listJobs(redis, 50)
      ]);
      res.json({
        queued: queue.messageCount,
        consumers: queue.consumerCount,
        deadLettered: deadQueue.messageCount,
        recentCompleted: jobs.filter(job => job.status === 'completed').length,
        recentFailed: jobs.filter(job => job.status === 'failed').length
      });
    } catch (error) { res.status(503).json({ error: 'Metrics unavailable.' }); }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
    log('api', 'http_error', { message: error.message });
    return res.status(500).json({ error: 'Internal server error.' });
  });

  app.listen(config.port, '0.0.0.0', () => log('api', 'http_ready', { port: config.port }));
}

main().catch(error => { console.error(error); process.exit(1); });
