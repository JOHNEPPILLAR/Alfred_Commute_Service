/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const travelHelper = require('./travel.js');

const skill = new Skills();

/**
 * @api {get} /commute/Status Get commute status
 * @apiName getCommuteStatus
 * @apiGroup Travel
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     success: 'true'
 *     data: {
 *       "anyDisruptions": false,
 *    }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 500 Internal error
 *   {
 *     data: Error message
 *   }
 *
 */
async function getCommuteStatus(req, res, next) {
  serviceHelper.log('trace', 'getCommuteStatus API called');

  let anyDisruptions = false;

  serviceHelper.log('trace', 'Checking for params');

  let apiData;
  try {
    serviceHelper.log('trace', 'Get train status');
    apiData = await travelHelper.nextTrain(
      { params: { startID: 'CTN', endID: 'LBG', disruptionsOnly: 'true' } },
      null,
      next,
    );
    if (apiData instanceof Error === false) {
      if (apiData.disruptions === 'true') anyDisruptions = true;
    } else {
      anyDisruptions = true;
    }
    apiData = await travelHelper.nextTrain(
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
      serviceHelper.sendResponse(res, 200, returnJSON);
      next();
    }
    return returnJSON;
  } catch (err) {
    serviceHelper.log('error', err.message);
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(res, 500, err);
      next();
    }
    return err;
  }
}
skill.get('/getcommutestatus', getCommuteStatus);

/**
 * @api {get} /commute Get commute information
 * @apiName commute
 * @apiGroup Travel
 *
 * @apiParam {String} lat
 * @apiParam {String} long
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     success: 'true'
 *     data: {
 *       "anyDisruptions": false,
 *       "commuteResults": [
 *           ...
 *       ]
 *    }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 500 Internal error
 *   {
 *     data: Error message
 *   }
 *
 */
function returnCommuteError(message, req, res, next) {
  const legs = [];
  const journeys = [];
  legs.push({
    mode: 'error',
    disruptions: 'true',
    status: message,
  });
  serviceHelper.log('trace', message);
  journeys.push({ legs });
  const returnJSON = { journeys };
  if (typeof res !== 'undefined' && res !== null) {
    serviceHelper.sendResponse(res, 200, returnJSON);
    next();
  }
}

async function getCommute(req, res, next) {
  serviceHelper.log('trace', 'getCommute API called');
  serviceHelper.log('trace', `Params: ${JSON.stringify(req.params)}`);

  const { lat, long } = req.params;
  const journeys = [];

  let apiData;
  let atHome = true;
  const atJPWork = false;
  const busLeg = {};
  const walkLeg = {};
  const walkToUndergroundLeg = {};
  const tubeLeg = {};

  serviceHelper.log('trace', 'Checking for params');
  if (
    (typeof lat === 'undefined' && lat === null && lat === '')
    || (typeof long === 'undefined' && long === null && long === '')
  ) {
    serviceHelper.log('info', 'Missing param: lat/long');
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(res, 400, 'Missing param: lat/long');
      next();
    }
    return false;
  }

  serviceHelper.log('trace', 'Find out if caller is at home location');
  try {
    atHome = serviceHelper.inHomeGeoFence(lat, long);
  } catch (err) {
    serviceHelper.log('error', err.message);

    if (typeof res !== 'undefined' && res !== null) {
      returnCommuteError(
        'Unable to calculate commute due to starting location',
        req,
        res,
        next,
      );
    }
    return false;
  }

  if (atHome) {
    serviceHelper.log('trace', 'Current location is close to home');

    serviceHelper.log('trace', 'Checking train and tube status');
    const trainData = await travelHelper.nextTrain(
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
        returnCommuteError('Error occured working out commute', req, res, next);
        return false;
      }

      const legs = [];
      serviceHelper.log('trace', 'Add train leg');
      legs.push(apiData[0]);

      // Add walking leg
      walkLeg.mode = 'walk';
      walkLeg.line = 'Person';
      walkLeg.disruptions = 'false';
      walkLeg.duration = '25';
      walkLeg.departureTime = apiData[0].arrivalTime;
      walkLeg.departureStation = 'London Bridge';
      walkLeg.arrivalTime = serviceHelper.addTime(
        walkLeg.departureTime,
        walkLeg.duration,
      );
      walkLeg.arrivalStation = 'WeWork';
      serviceHelper.log('trace', 'Add walking leg');
      legs.push(walkLeg);

      journeys.push({ legs });
    } else {
      const tubeData = await travelHelper.tubeStatus(
        { params: { line: 'Jubilee' } },
        null,
        next,
      );

      if (tubeData.disruptions === 'true') {
        returnCommuteError(
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
      busLeg.departureTime = serviceHelper.addTime(null, '00:10');
      busLeg.departureStation = 'Home';
      busLeg.arrivalTime = serviceHelper.addTime(
        busLeg.departureTime,
        busLeg.duration,
      );
      busLeg.arrivalStation = 'North Greenwich';
      serviceHelper.log('trace', 'Add bus leg');
      legs.push(busLeg);

      // Add walk to underground leg
      walkToUndergroundLeg.mode = 'walk';
      walkToUndergroundLeg.line = 'Person';
      walkToUndergroundLeg.disruptions = 'false';
      walkToUndergroundLeg.duration = '10';
      walkToUndergroundLeg.departureTime = busLeg.arrivalTime;
      walkToUndergroundLeg.departureStation = 'Change';
      walkToUndergroundLeg.arrivalTime = serviceHelper.addTime(
        walkToUndergroundLeg.departureTime,
        walkToUndergroundLeg.duration,
      );
      walkToUndergroundLeg.arrivalStation = 'Underground';
      serviceHelper.log('trace', 'Add walking leg');
      legs.push(walkToUndergroundLeg);

      // Add tube leg
      apiData = await travelHelper.nextTube(
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
      tubeLeg.arrivalTime = serviceHelper.addTime(
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
      walkLeg.arrivalTime = serviceHelper.addTime(
        walkLeg.departureTime,
        walkLeg.duration,
      );
      walkLeg.arrivalStation = 'WeWork';
      serviceHelper.log('trace', 'Add walking leg');
      legs.push(walkLeg);

      journeys.push({ legs });
    }
  }

  if (atJPWork) {
    serviceHelper.log('trace', 'Current location is close to work');
    const legs = [];

    // Add walking leg
    walkLeg.mode = 'walk';
    walkLeg.line = 'Person';
    walkLeg.disruptions = 'false';
    walkLeg.duration = '25';
    walkLeg.departureTime = serviceHelper.addTime(null, '00:05');
    walkLeg.departureStation = 'WeWork';
    walkLeg.arrivalTime = serviceHelper.addTime(
      walkLeg.departureTime,
      walkLeg.duration,
    );
    walkLeg.arrivalStation = 'London Bridge';
    serviceHelper.log('trace', 'Add walking leg');
    legs.push(walkLeg);

    // Add train leg
    serviceHelper.log('trace', 'Check train status');
    const trainData = await travelHelper.trainStatus(
      { params: { startID: 'LBG', endID: 'CTN' } },
      null,
      next,
    );
    if (trainData.disruptions === 'false') {
      const timeOffset = serviceHelper.timeDiff(
        null,
        walkLeg.arrivalTime,
        null,
        true,
      );
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
        returnCommuteError('Error occured working out commute', req, res, next);
        return false;
      }

      legs.push(apiData[0]);
      serviceHelper.log('trace', 'Add train leg');
      journeys.push({ legs });
    } else {
      serviceHelper.log('trace', 'Calc backup journey, check train status');
      const tubeData = await travelHelper.tubeStatus(
        { params: { line: 'Jubilee' } },
        null,
        next,
      );

      if (tubeData.disruptions === 'true') {
        returnCommuteError(
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
      tubeLeg.arrivalTime = serviceHelper.addTime(
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
      busLeg.departureTime = serviceHelper.addTime(
        tubeLeg.arrivalTime,
        '00:10',
      );
      busLeg.departureStation = 'North Greenwich';
      busLeg.arrivalTime = serviceHelper.addTime(
        busLeg.departureTime,
        busLeg.duration,
      );
      busLeg.arrivalStation = 'Home';
      serviceHelper.log('trace', 'Add bus leg');
      legs.push(busLeg);

      journeys.push({ legs });
    }
  }

  if (!atHome && !atJPWork) {
    serviceHelper.log('trace', 'Add not at home or work');
    if (typeof res !== 'undefined' && res !== null) {
      returnCommuteError(
        'Unable to calculate commute due to starting location',
        req,
        res,
        next,
      );
    }
    return false;
  }

  serviceHelper.log('trace', 'Send data back to caller');
  const returnJSON = {
    journeys,
  };

  if (typeof res !== 'undefined' && res !== null) {
    serviceHelper.sendResponse(res, 200, returnJSON);
    next();
  } else {
    return returnJSON;
  }
  return null;
}
skill.get('/commute/:lat/:long', getCommute);

module.exports = {
  skill,
  getCommuteStatus,
  getCommute,
};
