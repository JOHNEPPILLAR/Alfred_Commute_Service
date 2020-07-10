/**
 * Import external libraries
 */
const { Service } = require('alfred-base');

// Setup service options
const { version } = require('../../package.json');
const serviceName = require('../../package.json').description;
const namespace = require('../../package.json').name;

const options = {
  serviceName,
  namespace,
  serviceVersion: version,
};

// Bind api functions to base class
Object.assign(Service.prototype, require('../api/travel/travel'));
Object.assign(Service.prototype, require('../api/travel/commute'));

// Bind schedule functions to base class
Object.assign(Service.prototype, require('../schedules/commute'));

// Create and extend base service
const service = new Service(options);

async function setupServer() {
  // Setup service
  await service.createRestifyServer();

  // Apply api routes
  service.restifyServer.get('/tubes/:line/status', (req, res, next) =>
    service._tubeStatus(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/tubes/:line/status' api`,
  );

  service.restifyServer.get(
    '/tubes/:line/next/:startID/to/:endID',
    (req, res, next) => service._nextTube(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/tubes/:line/next/:startID/to/:endID' api`,
  );

  service.restifyServer.get('/buses/:route', (req, res, next) =>
    service._busStatus(req, res, next),
  );
  service.logger.trace(`${service._traceStack()} - Added '/buses/:route' api`);

  service.restifyServer.get('/buses/:route/next', (req, res, next) =>
    service._nextbus(req, res, next),
  );
  service.logger.trace(`${service._traceStack()} - Added '/buses/:route' api`);

  service.restifyServer.get('/trains/:startID/to/:endID', (req, res, next) =>
    service._nextTrain(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/trains/:startID/to/:endID' api`,
  );

  service.restifyServer.get('/getcommutestatus', (req, res, next) =>
    service._getCommuteStatus(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/getcommutestatus' api`,
  );

  service.restifyServer.get('/commute/:lat/:long', (req, res, next) =>
    service._getCommute(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/commute/:lat/:long' api`,
  );

  if (process.env.MOCK === 'true') {
    this.logger.info('Mocking enabled, will not run commute check schedules');
  } else {
    // Add schedules
    await service.setupSchedules();
    await service.activateSchedules();
  }

  // Listen for api requests
  service.listen();
}
setupServer();
