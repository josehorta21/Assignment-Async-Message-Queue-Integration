'use strict';

const { createClient } = require('redis');
const config = require('./config');
const { presentJob } = require('./job');
const { log } = require('./logger');

function key(id) { return `asyncflow:job:${id}`; }

async function openStore(service) {
  const redis = createClient({ url: config.redisUrl });
  redis.on('error', error => log(service, 'redis_error', { message: error.message }));
  await redis.connect();
  return redis;
}

async function addJob(redis, job) {
  // Store state before publishing so a fast consumer can always find its job.
  await redis.hSet(key(job.id), job);
  await redis.lPush(config.recentList, job.id);
  await redis.lTrim(config.recentList, 0, 49);
}

async function getJob(redis, id) {
  const job = await redis.hGetAll(key(id));
  return presentJob(job);
}

async function listJobs(redis, limit = 20) {
  const ids = await redis.lRange(config.recentList, 0, limit - 1);
  if (ids.length === 0) return [];
  const jobs = await Promise.all(ids.map(id => getJob(redis, id)));
  return jobs.filter(Boolean);
}

async function changeJob(redis, id, fields) {
  await redis.hSet(key(id), {
    ...fields,
    updatedAt: new Date().toISOString()
  });
}

module.exports = { openStore, addJob, getJob, listJobs, changeJob, key };
