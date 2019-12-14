/**
 * Import external libraries
 */
require('dotenv').config();

const serviceHelper = require('alfred-helper');
const restify = require('restify');
const fs = require('fs');
const UUID = require('pure-uuid');
const { version } = require('../../package.json');

/**
 * Import helper libraries
 */
const schedules = require('../schedules/controller.js');

global.APITraceID = '';
global.schedules = [];
let ClientAccessKey;

// Restify server Init
const server = restify.createServer({
  name: process.env.ServiceName,
  version,
  key: fs.readFileSync('./certs/server.key'),
  certificate: fs.readFileSync('./certs/server.crt'),
});

// Setup API middleware
server.on('NotFound', (req, res, err) => {
  serviceHelper.log('error', `${err.message}`);
  serviceHelper.sendResponse(res, 404, err.message);
});
server.use(restify.plugins.jsonBodyParser({ mapParams: true }));
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser({ mapParams: true }));
server.use(restify.plugins.fullResponse());
server.use((req, res, next) => {
  serviceHelper.log('trace', req.url);
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self' ${process.env.ServiceDomain}`,
  );
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
server.use(async (req, res, next) => {
  // Check for a trace id
  if (typeof req.headers['api-trace-id'] === 'undefined') {
    global.APITraceID = new UUID(4);
  } else {
    global.APITraceID = req.headers['api-trace-id'];
  }

  // Check for valid auth key
  ClientAccessKey = await serviceHelper.vaultSecret(process.env.Environment, 'ClientAccessKey');
  if (ClientAccessKey instanceof Error) {
    serviceHelper.log('error', 'Vault service not running');
    serviceHelper.sendResponse(
      res,
      500,
      new Error('There was a problem with the auth service'),
    );
    return;
  }
  if (req.headers['client-access-key'] !== ClientAccessKey) {
    serviceHelper.log(
      'warn',
      `Invaid client access key: ${req.headers.ClientAccessKey}`,
    );
    serviceHelper.sendResponse(
      res,
      401,
      'There was a problem authenticating you',
    );
    return;
  }
  next();
});

// Configure API end points
require('../api/root/root.js').applyRoutes(server);
require('../api/travel/travel.js').skill.applyRoutes(server);
require('../api/travel/commute.js').skill.applyRoutes(server);

// Stop server if process close event is issued
function cleanExit() {
  serviceHelper.log('warn', 'Service stopping');
  serviceHelper.log('trace', 'Close rest server');
  server.close(() => {
    serviceHelper.log('info', 'Exit the app');
    process.exit(1); // Exit app
  });
}
process.on('SIGINT', () => {
  cleanExit();
});
process.on('SIGTERM', () => {
  cleanExit();
});
process.on('SIGUSR2', () => {
  cleanExit();
});
process.on('uncaughtException', (err) => {
  serviceHelper.log('error', err.message); // log the error
});
process.on('unhandledRejection', (reason, p) => {
  serviceHelper.log('error', `Unhandled Rejection at Promise: ${p} - ${reason}`); // log the error
});

// Start service and listen to requests
server.listen(process.env.Port, () => {
  serviceHelper.log('info', `${process.env.ServiceName} has started`);
  if (process.env.Mock === 'true') {
    serviceHelper.log('info', 'Mocking enabled, will not setup schedules');
  } else {
    schedules.setSchedule(true); // Setup schedules
  }
});
