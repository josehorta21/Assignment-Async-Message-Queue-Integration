'use strict';

/*
 * INTENTIONALLY UNSAFE AI AUDIT BASELINE — NOT EXECUTED BY THE APPLICATION.
 * This deliberately simplified candidate demonstrates the exact shortcuts
 * rejected in the corrected implementation. It is retained for review only.
 */

const express = require('express');
const app = express();
const jobs = []; // PROBLEM 1: in-process array; disappears if API restarts.
app.use(express.json());

app.post('/api/jobs', async (req, res) => {
  const job = { id: Date.now(), status: 'processing', payload: req.body };
  jobs.push(job);
  // PROBLEM 2: blocks HTTP response until job completes; not asynchronous.
  await new Promise(resolve => setTimeout(resolve, 4000));
  job.status = 'completed';
  res.json(job); // PROBLEM 3: HTTP 200, not 202; no status URL.
});

// PROBLEM 4: no broker, no publisher confirms, no ACK/NACK, no DLQ, no recovery.
// A worker process crash would lose in-flight work and job status.

if (require.main === module) app.listen(3999);
