/**
 * Import external libraries
 */
const dateFormat = require('dateformat');
const helper = require('alfred-helper');

// Helper functions
function _minutesToStop(seconds) {
  const timetostopinMinutes = Math.floor(seconds / 60);
  const timeNow = new Date();
  timeNow.setMinutes(timeNow.getMinutes() + timetostopinMinutes);
  return dateFormat(timeNow, 'h:MM TT');
}

/**
 * @type get
 * @path /tubes/:line/status
 */
async function _tubeStatus(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Tube status API called`);

  const TFLAPIKey = await this._getVaultSecret.call(
    this,
    process.env.ENVIRONMENT,
    'TFLAPIKey',
  );

  let { line } = req.params;
  let disruptions = false;
  let returnJSON;

  if (typeof line === 'undefined' || line === null || line === '') {
    const err = new Error('Missing param: line');
    if (typeof res !== 'undefined' && res !== null) {
      this.logger.error(
        `${this._traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
      );
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  try {
    this.logger.trace(`${this._traceStack()} - Getting data from TFL`);
    const url = `https://api.tfl.gov.uk/Line/${line}?${TFLAPIKey}`;
    this.logger.trace(`${this._traceStack()} - ${url}`);
    const apiData = await this._callAPIServiceGet.call(this, url);
    if (apiData instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${apiData.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, apiData);
      }
      return apiData;
    }

    if (!helper.isEmptyObject(apiData) && apiData[0].disruptions) {
      line = apiData[0].name;
      if (apiData[0].disruptions.length > 1) disruptions = true;
    }

    returnJSON = {
      mode: 'tube',
      line,
      disruptions,
    };

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, returnJSON);
    }
    return returnJSON;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
}

/**
 * @type get
 * @path /tubes/:line/next/:startID/to/:endID
 */
async function _nextTube(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Next tube API called`);

  let { line } = req.params;
  const { startID, endID } = req.params;
  const TFLAPIKey = await this._getVaultSecret.call(
    this,
    process.env.ENVIRONMENT,
    'TFLAPIKey',
  );

  let duration = 0;
  let disruptions = false;
  let departureStation;
  let arrivalStation;
  let returnJSON;

  if (typeof line === 'undefined' || line === null || line === '') {
    const err = new Error('Missing param: line');
    if (typeof res !== 'undefined' && res !== null) {
      this.logger.error(
        `${this._traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
      );
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  if (typeof startID === 'undefined' || startID === null || startID === '') {
    const err = new Error('Missing param: startID');
    if (typeof res !== 'undefined' && res !== null) {
      this.logger.error(
        `${this._traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
      );
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  if (typeof endID === 'undefined' || endID === null || endID === '') {
    const err = new Error('Missing param: endID');
    if (typeof res !== 'undefined' && res !== null) {
      this.logger.error(
        `${this._traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
      );
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  try {
    this.logger.trace(`${this._traceStack()} - Getting data from TFL`);
    let url = `https://api.tfl.gov.uk/Line/${line}/Timetable/${startID}/to/${endID}?${TFLAPIKey}`;
    this.logger.trace(`${this._traceStack()} - ${url}`);
    let apiData = await this._callAPIServiceGet(url);
    if (apiData instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${apiData.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, apiData);
      }
      return apiData;
    }

    if (!helper.isEmptyObject(apiData)) {
      line = apiData.lineName;
      let tempRoute = apiData.timetable.routes[0].stationIntervals[0].intervals;
      tempRoute = tempRoute.filter((a) => a.stopId === endID);
      let { timeToArrival } = tempRoute[0];
      if (typeof timeToArrival === 'undefined') timeToArrival = 0;
      duration = timeToArrival;
      this.logger.trace(`${this._traceStack()} - Get departure station`);
      tempRoute = apiData.stops;
      tempRoute = tempRoute.filter((a) => a.stationId === startID);
      departureStation = tempRoute[0].name.replace(' Underground Station', '');
      this.logger.trace(`${this._traceStack()} - Get arrival station`);
      tempRoute = apiData.stops;
      tempRoute = tempRoute.filter((a) => a.stationId === endID);
      arrivalStation = tempRoute[0].name.replace(' Underground Station', '');
    }

    this.logger.trace(`${this._traceStack()} - Get distruptions`);
    url = `https://api.tfl.gov.uk/Line/${line}?${TFLAPIKey}`;
    this.logger.trace(`${this._traceStack()} - ${url}`);
    apiData = await this._callAPIServiceGet(url);
    if (apiData instanceof Error) {
      this.logger.trace(`${this._traceStack()} - ${apiData.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, apiData);
      }
      return apiData;
    }

    if (!helper.isEmptyObject(apiData) && apiData[0].disruptions) {
      if (apiData[0].disruptions.length > 1) disruptions = true;
    }

    returnJSON = {
      mode: 'tube',
      line,
      disruptions,
      duration,
      departureStation,
      arrivalStation,
    };

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, returnJSON);
    }
    return returnJSON;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
}

/**
 * @type get
 * @path /buses/:route
 */
async function _busStatus(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Bus Status API called`);

  const TFLAPIKey = await this._getVaultSecret.call(
    this,
    process.env.ENVIRONMENT,
    'TFLAPIKey',
  );

  let { route } = req.params;
  let disruptions = false;
  let returnJSON;

  if (typeof route === 'undefined' || route === null || route === '') {
    const err = new Error('Missing param: route');
    if (typeof res !== 'undefined' && res !== null) {
      this.logger.error(
        `${this._traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
      );
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  try {
    this.logger.trace(`${this._traceStack()} - Getting data from TFL`);
    const url = `https://api.tfl.gov.uk/Line/${route}/Status?detail=true&${TFLAPIKey}`;
    this.logger.trace(`${this._traceStack()} - ${url}`);
    const apiData = await this._callAPIServiceGet(url);
    if (apiData instanceof Error) {
      this.logger.trace(`${this._traceStack()} - ${apiData.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, apiData);
      }
      return apiData;
    }

    if (!helper.isEmptyObject(apiData) && apiData[0].disruptions) {
      route = apiData[0].name;
      if (apiData[0].disruptions.length > 1) disruptions = true;
    }

    returnJSON = {
      mode: 'bus',
      line: route,
      disruptions,
    };

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, returnJSON);
    }
    return returnJSON;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
}

/**
 * @type get
 * @path /buses/:route/next
 */
async function _nextbus(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Next Bus API called`);

  const { route } = req.params;
  const TFLAPIKey = await this._getVaultSecret(
    this,
    process.env.ENVIRONMENT,
    'TFLAPIKey',
  );

  let url;
  let returnJSON;
  let atHome;
  let stopPoint = '';

  if (typeof route === 'undefined' || route === null || route === '') {
    const err = new Error('Missing param: route');
    if (typeof res !== 'undefined' && res !== null) {
      this.logger.error(
        `${this._traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
      );
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }

  switch (req.query.atHome) {
    case 'false':
      atHome = false;
      break;
    case 'true':
      atHome = true;
      break;
    default:
      atHome = true;
  }

  switch (route) {
    case '380':
      this.logger.trace(`${this._traceStack()} - Using Bus no. 380`);
      url = `https://api.tfl.gov.uk/StopPoint/490013012S/Arrivals?mode=bus&line=380&${TFLAPIKey}`;
      break;
    case '486':
      this.logger.trace(`${this._traceStack()} - Using Bus no. 486`);
      stopPoint = '490001058H'; // Default going to work stop point
      if (!atHome) {
        stopPoint = '490010374B';
      } // Override to coming home stop point
      url = `https://api.tfl.gov.uk/StopPoint/${stopPoint}/Arrivals?mode=bus&line=486&${TFLAPIKey}`;
      break;
    case '161':
      this.logger.trace(`${this._traceStack()} - Using Bus no. 161`);
      stopPoint = '490010374A'; // Default coming home stop point
      url = `https://api.tfl.gov.uk/StopPoint/${stopPoint}/Arrivals?mode=bus&line=161&${TFLAPIKey}`;
      break;
    default:
      this.logger.trace(
        `${this._traceStack()} - Bus no.${route} is not supported`,
      );
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(
          res,
          next,
          400,
          `Bus route ${route} is not currently supported'}`,
        );
        next();
      }
      return false;
  }

  try {
    // Get the bus data
    const passOnReq = { params: { route } };
    const distruptionsJSON = await this._busStatus.call(
      this,
      passOnReq,
      null,
      next,
    );
    if (distruptionsJSON instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${distruptionsJSON.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, distruptionsJSON);
      }
      return distruptionsJSON;
    }

    this.logger.trace(`${this._traceStack()} - Get data from TFL`);
    this.logger.trace(`${this._traceStack()} - ${url}`);
    const apiData = await this._callAPIServiceGet.call(this, url);
    if (apiData instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${apiData.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, apiData);
      }
      return apiData;
    }

    if (helper.isEmptyObject(apiData)) {
      returnJSON = {};
      this.logger.error(
        `${this._traceStack()} - No data was returned from the call to the TFL API`,
      );
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, returnJSON);
      }
    } else {
      this.logger.error(
        `${this._traceStack()} - Filter bus stop for only desired route and direction`,
      );
      let busData = apiData.filter((a) => a.lineId === route);
      this.logger.trace(
        `${this._traceStack()} - Sort by time to arrive at staton`,
      );
      busData = busData.sort(helper.getSortOrder('timeToStation'));

      let numberOfElements = busData.length;
      if (numberOfElements > 2) numberOfElements = 2;

      returnJSON = {
        mode: 'bus',
        line: busData[0].lineName,
        destination: busData[0].destinationName,
        firstTime: _minutesToStop(busData[0].timeToStation),
        secondTime: 'N/A',
        disruptions: distruptionsJSON.disruptions,
      };

      if (numberOfElements === 2) {
        returnJSON.secondTime = _minutesToStop(busData[1].timeToStation);
      }

      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, returnJSON);
      }
    }
    return returnJSON;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
}

/**
 * @type get
 * @path /trains/:startID/to/:endID
 */
async function _nextTrain(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Next train API called`);

  const TransportAPIKey = await this._getVaultSecret(
    process.env.ENVIRONMENT,
    'TransportAPIKey',
  );
  const { nextTrainOnly } = req.params;

  let { startID, endID, departureTimeOffSet, disruptionsOnly } = req.params;

  if (typeof startID === 'undefined' || startID === null || startID === '') {
    const err = new Error('Missing param: startID');
    if (typeof res !== 'undefined' && res !== null) {
      this.logger.error(
        `${this._traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
      );
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }
  startID = startID.toUpperCase();

  if (typeof endID === 'undefined' || endID === null || endID === '') {
    const err = new Error('Missing param: endID');
    if (typeof res !== 'undefined' && res !== null) {
      this.logger.error(
        `${this._traceStack()} - Invalid params: ${JSON.stringify(req.params)}`,
      );
      this._sendResponse(res, next, 400, err);
    }
    return err;
  }
  endID = endID.toUpperCase();

  if (
    typeof departureTimeOffSet !== 'undefined' &&
    departureTimeOffSet !== null &&
    departureTimeOffSet !== ''
  ) {
    departureTimeOffSet = `PT${departureTimeOffSet}:00`;
  } else {
    departureTimeOffSet = '';
  }

  if (disruptionsOnly === 'true') {
    disruptionsOnly = true;
  } else {
    disruptionsOnly = false;
  }

  let url = `https://transportapi.com/v3/uk/train/station/${startID}/live.json?${TransportAPIKey}&train_status=passenger&from_offset=${departureTimeOffSet}&calling_at=${endID}`;
  this.logger.trace(`${this._traceStack()} - ${url}`);

  try {
    this.logger.trace(`${this._traceStack()} - Get data from API`);
    const apiData = await this._callAPIServiceGet.call(this, url);

    if (apiData instanceof Error) {
      const err = new Error('Error transportapi.com response');
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, err);
      }
      return apiData;
    }

    if (helper.isEmptyObject(apiData)) {
      const err = new Error('No data was returned from the call to the API');
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, err);
      }
      return err;
    }

    let trainData = apiData.departures.all;

    if (helper.isEmptyObject(trainData)) {
      const err = new Error('No trains running');
      this.logger.info(`${err.message}`);
      const returnMsg = [
        {
          mode: 'train',
          disruptions: 'true',
          status: err.message,
        },
      ];
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, returnMsg);
      }
      return returnMsg;
    }

    this.logger.trace(
      `${this._traceStack()} - Remove results that start and end at same station`,
    );
    const cleanData = trainData.filter(
      (a) => a.origin_name !== a.destination_name,
    );

    this.logger.trace(`${this._traceStack()} - Sort by departure time`);
    trainData = cleanData.sort(helper.getSortOrder('aimed_departure_time'));

    this.logger.trace(`${this._traceStack()} - Construct JSON`);
    let returnJSON = [];
    let trainStations;
    let journey;
    let anyDisruptions = false;
    let disruptions = false;
    let mode;
    let line;
    let finalDestination;
    let duration;
    let departureTime;
    let departureStation;
    let departurePlatform;
    let arrivalTime;
    let arrivalStation;
    let status;

    let maxJourneyCounter = 3;
    if (maxJourneyCounter > trainData.length)
      maxJourneyCounter = trainData.length;
    if (nextTrainOnly === true) maxJourneyCounter = 1;

    for (let index = 0; index < maxJourneyCounter; index += 1) {
      mode = 'train';
      line = trainData[index].operator_name;
      finalDestination = trainData[index].destination_name;
      if (line === null) line = 'Network rail';
      departureTime = trainData[index].aimed_departure_time;
      switch (startID) {
        case 'LBG':
          departureStation = 'London Bridge';
          break;
        case 'STP':
          departureStation = 'St Pancras International';
          break;
        case 'CHX':
          departureStation = 'Charing Cross';
          break;
        case 'CST':
          departureStation = 'Cannon Street';
          break;
        default:
          departureStation = 'Charlton';
      }
      departurePlatform = 'N/A';
      if (trainData[index].platform != null)
        departurePlatform = trainData[index].platform;
      status = trainData[index].status.toLowerCase();

      this.logger.trace(`${this._traceStack()} - Check for cancelled train`);
      if (
        trainData[index].status.toLowerCase() === 'it is currently off route' ||
        trainData[index].status.toLowerCase() === 'cancelled'
      ) {
        this.logger.trace(`${this._traceStack()} - Found distrupted train`);
        disruptions = true;
        anyDisruptions = true;
      }

      if (!disruptionsOnly) {
        this.logger.trace(`${this._traceStack()} - Get stops info`);
        url = trainData[index].service_timetable.id;
        // eslint-disable-next-line no-await-in-loop
        trainStations = await this._callAPIServiceGet.call(this, url);
        if (apiData instanceof Error) {
          this.logger.error(`${this._traceStack()} - ${apiData.message}`);
        } else {
          trainStations = trainStations.stops;
          this.logger.trace(
            `${this._traceStack()} - Get arrival time at destination station`,
          );
          trainStations = trainStations.filter((a) => a.station_code === endID);
          arrivalTime = trainStations[0].aimed_arrival_time;
          arrivalStation = trainStations[0].station_name;

          this.logger.trace(`${this._traceStack()} - Work out duration`);
          duration = helper.timeDiff(departureTime, arrivalTime);

          this.logger.trace(`${this._traceStack()} - Construct journey JSON`);
          journey = {
            mode,
            line,
            disruptions,
            finalDestination,
            duration,
            departureTime,
            departureStation,
            departurePlatform,
            arrivalTime,
            arrivalStation,
            status,
          };
          returnJSON.push(journey);
        }
      }

      if (index + 1 === maxJourneyCounter) {
        if (disruptionsOnly) returnJSON = { anyDisruptions };

        if (typeof res !== 'undefined' && res !== null) {
          this._sendResponse(res, next, 200, returnJSON);
        }
        return returnJSON;
      }
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
  return true;
}

module.exports = {
  _tubeStatus,
  _nextTube,
  _busStatus,
  _nextbus,
  _nextTrain,
};
