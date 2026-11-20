'use strict';

module.exports = {
  rabbitUrl: process.env.AMQP_URL || 'amqp://labuser:labpass@localhost:5672',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  port: Number(process.env.PORT || 3000),
  jobDurationMs: Number(process.env.JOB_DURATION_MS || 4000),
  queue: 'asyncflow.jobs',
  deadExchange: 'asyncflow.dlx',
  deadRoutingKey: 'asyncflow.failed',
  deadQueue: 'asyncflow.dead',
  maxAttempts: 3,
  recentList: 'asyncflow:recent'
};
