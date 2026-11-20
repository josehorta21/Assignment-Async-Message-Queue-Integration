'use strict';

function log(service, event, details = {}) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    service,
    event,
    ...details
  }));
}

module.exports = { log };
