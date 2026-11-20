'use strict';

const amqp = require('amqplib');
const config = require('./config');
const { log } = require('./logger');

async function initializeTopology(channel) {
  await channel.assertExchange(config.deadExchange, 'direct', { durable: true });
  await channel.assertQueue(config.deadQueue, { durable: true });
  await channel.bindQueue(config.deadQueue, config.deadExchange, config.deadRoutingKey);
  await channel.assertQueue(config.queue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': config.deadExchange,
      'x-dead-letter-routing-key': config.deadRoutingKey
    }
  });
}

async function openBroker(service, confirmations = false) {
  const connection = await amqp.connect(config.rabbitUrl);
  connection.on('error', error => log(service, 'rabbit_connection_error', { message: error.message }));
  connection.on('close', () => {
    log(service, 'rabbit_connection_closed');
    // Docker restarts the process; an unacknowledged delivery returns to the broker.
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 100).unref();
  });
  const channel = confirmations
    ? await connection.createConfirmChannel()
    : await connection.createChannel();
  channel.on('error', error => log(service, 'rabbit_channel_error', { message: error.message }));
  await initializeTopology(channel);
  return { connection, channel };
}

async function publishConfirmed(channel, job) {
  const payload = Buffer.from(JSON.stringify({
    id: job.id,
    name: job.name,
    kind: job.kind
  }));
  // Durable queue + persistent message + broker publisher confirmation.
  channel.sendToQueue(config.queue, payload, {
    persistent: true,
    contentType: 'application/json',
    messageId: job.id,
    timestamp: Date.now()
  });
  await channel.waitForConfirms();
}

module.exports = { openBroker, publishConfirmed, initializeTopology };
