'use strict';
const $ = id => document.getElementById(id);
const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
let loading = false;

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function updateConnection(ok) {
  $('system-indicator').className = `system-indicator ${ok ? 'ok' : 'bad'}`;
  $('connection-status').textContent = ok ? 'All systems operational' : 'Service unavailable';
}

function showResult(text, kind = '') {
  $('submit-result').className = `submit-result ${kind}`;
  $('submit-result').textContent = text;
}

async function dispatch(name, kind = 'normal') {
  const start = performance.now();
  const result = await request('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind })
  });
  return { ...result, latencyMs: Math.round(performance.now() - start) };
}

function renderJobs(jobs) {
  if (!jobs.length) return;
  $('job-list').innerHTML = jobs.map(job => {
    const status = ['queued','processing','retrying','completed','failed','publish_uncertain'].includes(job.status)
      ? job.status : 'queued';
    const shortId = job.id.slice(0, 8);
    const created = new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<div class="job-row"><div class="job-left"><div class="job-title" title="${escapeHtml(job.name)}">${escapeHtml(job.name)}</div>
      <div class="job-meta"><span>ID ${escapeHtml(shortId)}</span><span>${escapeHtml(created)}</span><span>${escapeHtml(job.kind)}</span></div></div>
      <div class="job-right"><span class="status ${status}">${escapeHtml(status.replace('_', ' '))}</span>
      <div class="job-attempts">${Number(job.attempts) || 0} attempt(s)</div></div></div>`;
  }).join('');
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const [metrics, jobs] = await Promise.all([
      request('/api/metrics'),
      request('/api/jobs?limit=20')
    ]);
    $('metric-queued').textContent = metrics.queued;
    $('metric-consumers').textContent = metrics.consumers;
    $('metric-completed').textContent = metrics.recentCompleted;
    $('metric-dlq').textContent = metrics.deadLettered;
    renderJobs(jobs.jobs);
    updateConnection(true);
  } catch (error) { updateConnection(false); }
  finally { loading = false; }
}

$('job-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('submit-button').disabled = true;
  try {
    const result = await dispatch($('job-name').value, $('job-kind').value);
    showResult(`HTTP 202 Accepted · ${result.latencyMs}ms · Job ${result.id}`, 'success');
    await refresh();
  } catch (error) { showResult(error.message, 'error'); }
  finally { $('submit-button').disabled = false; }
});

$('burst-button').addEventListener('click', async () => {
  $('burst-button').disabled = true;
  try {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      dispatch(`Burst workload ${i + 1}`, 'normal')));
    showResult(`Published ${results.length} jobs · Average HTTP latency ${Math.round(results.reduce((sum, job) => sum + job.latencyMs, 0) / results.length)}ms`, 'success');
    await refresh();
  } catch (error) { showResult(`Burst submission failed: ${error.message}`, 'error'); }
  finally { $('burst-button').disabled = false; }
});

$('refresh-button').addEventListener('click', refresh);
refresh();
setInterval(refresh, 1200);
