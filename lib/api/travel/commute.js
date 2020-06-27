/**
 * Import external libraries
 */
const helper = require('alfred-helper');

/**
 * Import helper libraries
 */
const travelHelper = require('./travel.js');
const commuteSchema = require('../../schemas/commute.json');

/**
 * @type get
 * @path /getcommutestatus
 */
async function _getCommuteStatus(req, res, next) {
  this.logger.trace(`${this._traceStack()} - Get commute status API called`);

  let anyDisruptions = false;

  this.logger.debug(`${this._traceStack()} - Checking for params`);
  let apiData;
  try {
    this.logger.debug(`${this._traceStack()} - Get train status`);
    apiData = await travelHelper._nextTrain.call(
      this,
      { params: { startID: 'CTN', endID: 'LBG', disruptionsOnly: 'true' } },
      null,
      next,
    );
    if (!(apiData instanceof Error)) {
      if (apiData.disruptions === 'true') anyDisruptions = true;
    } else {
      anyDisruptions = true;
    }
    apiData = await travelHelper._nextTrain.call(
      this,
      { params: { startID: 'LBG', endID: 'CTN', disruptionsOnly: 'true' } },
      null,
      next,
    );
    if (apiData instanceof Error === false) {
      if (apiData.disruptions === 'true') anyDisruptions = true;
    } else {
      anyDisruptions = true;
    }
    const returnJSON = { anyDisruptions };
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, returnJSON);
    }
    return returnJSON;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${apiData.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
}

/**
 * @type get
 * @path /commute/:lat/:long
 */
function _returnCommuteError(message, req, res, next) {
  const legs = [];
  const journeys = [];
  legs.push({
    mode: 'error',
    disruptions: 'true',
    status: message,
  });
  this.logger.debug(`${this._traceStack()} - ${message}`);
  journeys.push({ legs });
  const returnJSON = { journeys };
  if (typeof res !== 'undefined' && res !== null) {
    this._sendResponse(res, next, 200, returnJSON);
  }
}

async function _getCommute(req, res, next) {
  this.logger.trace(`${this._traceStack()} - Get commute API called`);

  const { lat, long } = req.params;
  const journeys = [];

  let apiData;
  let atHome = true;
  let atJPWork = false;
  const busLeg = {};
  const walkLeg = {};
  const walkToUndergroundLeg = {};
  const tubeLeg = {};

  // eslint-disable-next-line no-restricted-globals
  if (isNaN(lat)) {
    const err = new Error('param: lat is not a number');
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  // eslint-disable-next-line no-restricted-globals
  if (isNaN(long)) {
    const err = new Error('param: long is not a number');
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  const validSchema = this._validateSchema(req, commuteSchema);
  if (validSchema !== true) {
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 400, validSchema);
    }
    return validSchema;
  }

  this.logger.debug(
    `${this._traceStack()} - Find out if caller is at home location`,
  );

  try {
    atHome = await this._inHomeGeoFence(lat, long);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      _returnCommuteError(
        'Unable to calculate commute due to starting location',
        req,
        res,
        next,
      );
    }
    return false;
  }

  if (atHome) {
    this.logger.debug(
      `${this._traceStack()} - Current location is close to home`,
    );
    this.logger.debug(`${this._traceStack()} - Checking train and tube status`);
    const trainData = await travelHelper._nextTrain.call(
      this,
      { params: { startID: 'CTN', endID: 'LBG', disruptionsOnly: 'true' } },
      null,
      next,
    );

    // Work out main commute
    if (trainData.anyDisruptions === 'false') {
      // Add train leg
      apiData = await travelHelper.nextTrain(
        {
          params: {
            startID: 'CTN',
            endID: 'LBG',
            departureTimeOffSet: '00:05',
          },
        },
        null,
        next,
      );
      if (apiData instanceof Error || apiData === false) {
        _returnCommuteError(
          'Error occured working out commute',
          req,
          res,
          next,
        );
        return false;
      }

      const legs = [];
      this.logger.debug(`${this._traceStack()} - Add train leg`);
      legs.push(apiData[0]);

      // Add walking leg
      walkLeg.mode = 'walk';
      walkLeg.line = 'Person';
      walkLeg.disruptions = 'false';
      walkLeg.duration = '25';
      walkLeg.departureTime = apiData[0].arrivalTime;
      walkLeg.departureStation = 'London Bridge';
      walkLeg.arrivalTime = helper.addTime(
        walkLeg.departureTime,
        walkLeg.duration,
      );
      walkLeg.arrivalStation = 'WeWork';
      this.logger.debug(`${this._traceStack()} - Add walking leg`);
      legs.push(walkLeg);

      journeys.push({ legs });
    } else {
      const tubeData = await travelHelper._tubeStatus.call(
        this,
        { params: { line: 'Jubilee' } },
        null,
        next,
      );

      if (tubeData.disruptions === 'true') {
        _returnCommuteError(
          'There are distriptions on both the trains and Jubilee line',
          req,
          res,
          next,
        );
        return false;
      }

      // Add bus leg
      const legs = [];
      busLeg.mode = 'bus';
      busLeg.line = '486';
      busLeg.disruptions = 'false';
      busLeg.duration = '30';
      busLeg.departureTime = helper.addTime(null, '00:10');
      busLeg.departureStation = 'Home';
      busLeg.arrivalTime = helper.addTime(
        busLeg.departureTime,
        busLeg.duration,
      );
      busLeg.arrivalStation = 'North Greenwich';
      this.logger.debug(`${this._traceStack()} - Add bus leg`);
      legs.push(busLeg);

      // Add walk to underground leg
      walkToUndergroundLeg.mode = 'walk';
      walkToUndergroundLeg.line = 'Person';
      walkToUndergroundLeg.disruptions = 'false';
      walkToUndergroundLeg.duration = '10';
      walkToUndergroundLeg.departureTime = busLeg.arrivalTime;
      walkToUndergroundLeg.departureStation = 'Change';
      walkToUndergroundLeg.arrivalTime = helper.addTime(
        walkToUndergroundLeg.departureTime,
        walkToUndergroundLeg.duration,
      );
      walkToUndergroundLeg.arrivalStation = 'Underground';
      this.logger.debug(`${this._traceStack()} - Add walking leg`);
      legs.push(walkToUndergroundLeg);

      // Add tube leg
      apiData = await travelHelper._nextTube.call(
        this,
        {
          params: {
            line: 'Jubilee',
            startID: '940GZZLUNGW',
            endID: '940GZZLULNB',
          },
        },
        null,
        next,
      );
      tubeLeg.mode = apiData.mode;
      tubeLeg.line = apiData.line;
      tubeLeg.disruptions = apiData.disruptions;
      tubeLeg.duration = apiData.duration;
      tubeLeg.departureTime = walkToUndergroundLeg.arrivalTime;
      tubeLeg.departureStation = busLeg.arrivalStation;
      tubeLeg.arrivalTime = helper.addTime(
        walkToUndergroundLeg.arrivalTime,
        tubeLeg.duration,
      );
      tubeLeg.arrivalStation = apiData.arrivalStation;
      legs.push(tubeLeg);

      // Add walking leg
      walkLeg.mode = 'walk';
      walkLeg.line = 'Person';
      walkLeg.disruptions = 'false';
      walkLeg.duration = '25';
      walkLeg.departureTime = tubeLeg.arrivalTime;
      walkLeg.departureStation = 'London Bridge';
      walkLeg.arrivalTime = helper.addTime(
        walkLeg.departureTime,
        walkLeg.duration,
      );
      walkLeg.arrivalStation = 'WeWork';
      this.logger.debug(`${this._traceStack()} - Add walking leg`);
      legs.push(walkLeg);

      journeys.push({ legs });
    }
  }

  this.logger.debug(`${this._traceStack()} - Find out if at work location`);
  try {
    atJPWork = await this._inJPWorkGeoFence(lat, long);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      _returnCommuteError(
        'Unable to calculate commute due to starting location',
        req,
        res,
        next,
      );
    }
    return false;
  }

  if (atJPWork) {
    this.logger.debug(
      `${this._traceStack()} - Current location is close to work`,
    );
    const legs = [];

    // Add walking leg
    walkLeg.mode = 'walk';
    walkLeg.line = 'Person';
    walkLeg.disruptions = 'false';
    walkLeg.duration = '25';
    walkLeg.departureTime = helper.addTime(null, '00:05');
    walkLeg.departureStation = 'WeWork';
    walkLeg.arrivalTime = helper.addTime(
      walkLeg.departureTime,
      walkLeg.duration,
    );
    walkLeg.arrivalStation = 'London Bridge';
    this.logger.debug(`${this._traceStack()} - Add walking leg`);
    legs.push(walkLeg);

    // Add train leg
    this.logger.debug(`${this._traceStack()} - Check train status`);
    const trainData = await travelHelper.trainStatus(
      { params: { startID: 'LBG', endID: 'CTN' } },
      null,
      next,
    );
    if (trainData.disruptions === 'false') {
      const timeOffset = helper.timeDiff(null, walkLeg.arrivalTime, null, true);
      apiData = await travelHelper.nextTrain(
        {
          params: {
            startID: 'LBG',
            endID: 'CTN',
            departureTimeOffSet: timeOffset,
          },
        },
        null,
        next,
      );

      if (apiData instanceof Error || apiData === false) {
        _returnCommuteError(
          'Error occured working out commute',
          req,
          res,
          next,
        );
        return false;
      }

      legs.push(apiData[0]);
      this.logger.debug(`${this._traceStack()} - Add train leg`);
      journeys.push({ legs });
    } else {
      this.logger.debug(
        `${this._traceStack()} - Calc backup journey, check train status`,
      );
      const tubeData = await travelHelper.tubeStatus(
        { params: { line: 'Jubilee' } },
        null,
        next,
      );

      if (tubeData.disruptions === 'true') {
        _returnCommuteError(
          'There are distriptions on both the trains and Jubilee line',
          req,
          res,
          next,
        );
        return false;
      }

      // Add tube leg
      apiData = await travelHelper.nextTube(
        {
          params: {
            line: 'Jubilee',
            startID: '940GZZLULNB',
            endID: '940GZZLUNGW',
          },
        },
        null,
        next,
      );

      tubeLeg.mode = apiData.mode;
      tubeLeg.line = apiData.line;
      tubeLeg.disruptions = apiData.disruptions;
      tubeLeg.duration = apiData.duration;
      tubeLeg.departureTime = walkLeg.arrivalTime;
      tubeLeg.departureStation = walkLeg.arrivalStation;
      tubeLeg.arrivalTime = helper.addTime(
        tubeLeg.departureTime,
        tubeLeg.duration,
      );
      tubeLeg.arrivalStation = apiData.arrivalStation;
      legs.push(tubeLeg);

      // Add bus leg
      busLeg.mode = 'bus';
      busLeg.line = '486';
      busLeg.disruptions = 'false';
      busLeg.duration = '30';
      busLeg.departureTime = helper.addTime(tubeLeg.arrivalTime, '00:10');
      busLeg.departureStation = 'North Greenwich';
      busLeg.arrivalTime = helper.addTime(
        busLeg.departureTime,
        busLeg.duration,
      );
      busLeg.arrivalStation = 'Home';
      this.logger.debug(`${this._traceStack()} - Add bus leg`);
      legs.push(busLeg);

      journeys.push({ legs });
    }
  }

  if (!atHome && !atJPWork) {
    this.logger.debug(`${this._traceStack()} - Add not at home or work`);
    if (typeof res !== 'undefined' && res !== null) {
      _returnCommuteError(
        'Unable to calculate commute due to starting location',
        req,
        res,
        next,
      );
    }
    return false;
  }

  const returnJSON = {
    journeys,
  };

  if (typeof res !== 'undefined' && res !== null) {
    this._sendResponse(res, next, 200, returnJSON);
  } else {
    return returnJSON;
  }
  return null;
}

module.exports = {
  _getCommuteStatus,
  _getCommute,
};
