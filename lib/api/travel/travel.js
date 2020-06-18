/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const serviceHelper = require('alfred-helper');

const skill = new Skills();

/**
 * @type get
 * @path /tubes/:line/status
 */
async function tubeStatus(req, res, next) {
  serviceHelper.log(
    'info',
    'Tubes status API called',
  );

  const TFLAPIKey = await serviceHelper.vaultSecret(
    process.env.ENVIRONMENT,
    'TFLAPIKey',
  );

  let { line } = req.params;
  let disruptions = false;
  let returnJSON;

  if (typeof line === 'undefined' || line === null || line === '') {
    const err = new Error('Missing param: line');
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      serviceHelper.sendResponse(
        res,
        next,
        400,
        err,
      );
    }
    return err;
  }

  try {
    serviceHelper.log(
      'trace',
      'Getting data from TFL',
    );
    const url = `https://api.tfl.gov.uk/Line/${line}?${TFLAPIKey}`;
    serviceHelper.log(
      'trace',
      url,
    );
    const apiData = await serviceHelper.callAlfredServiceGet(url);
    if (apiData instanceof Error) {
      serviceHelper.log(
        'error',
        apiData.message,
      );
      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          next,
          500,
          apiData,
        );
      }
      return apiData;
    }

    if (!serviceHelper.isEmptyObject(apiData) && apiData[0].disruptions) {
      line = apiData[0].name;
      if (apiData[0].disruptions.length > 1) disruptions = true;
    }

    returnJSON = {
      mode: 'tube',
      line,
      disruptions,
    };

    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        next,
        200,
        returnJSON,
      );
    }
    return returnJSON;
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        next,
        500,
        err,
      );
    }
    return err;
  }
}
skill.get(
  '/tubes/:line/status',
  tubeStatus,
);

/**
 * @type get
 * @path /tubes/:line/next
 */
async function nextTube(req, res, next) {
  serviceHelper.log(
    'info',
    'Next tube API called',
  );

  let { line } = req.params;
  const { startID, endID } = req.params;
  const TFLAPIKey = await serviceHelper.vaultSecret(
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
      serviceHelper.log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      serviceHelper.sendResponse(
        res,
        next,
        400,
        err,
      );
    }
    return err;
  }

  if (typeof startID === 'undefined' || startID === null || startID === '') {
    const err = new Error('Missing param: startID');
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      serviceHelper.sendResponse(
        res,
        next,
        400,
        err,
      );
    }
    return err;
  }

  if (typeof endID === 'undefined' || endID === null || endID === '') {
    const err = new Error('Missing param: endID');
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      serviceHelper.sendResponse(
        res,
        next,
        400,
        err,
      );
    }
    return err;
  }

  try {
    serviceHelper.log(
      'trace',
      'Getting data from TFL',
    );
    let url = `https://api.tfl.gov.uk/Line/${line}/Timetable/${startID}/to/${endID}?${TFLAPIKey}`;
    serviceHelper.log(
      'trace',
      url,
    );
    let apiData = await serviceHelper.callAPIServiceGet(url);
    if (apiData instanceof Error) {
      serviceHelper.log(
        'error',
        apiData.message,
      );
      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          next,
          500,
          apiData,
        );
      }
      return apiData;
    }

    if (!serviceHelper.isEmptyObject(apiData)) {
      line = apiData.lineName;
      let tempRoute = apiData.timetable.routes[0].stationIntervals[0].intervals;
      tempRoute = tempRoute.filter((a) => a.stopId === endID);
      let { timeToArrival } = tempRoute[0];
      if (typeof timeToArrival === 'undefined') timeToArrival = 0;
      duration = timeToArrival;
      serviceHelper.log(
        'trace',
        'Get departure station',
      );
      tempRoute = apiData.stops;
      tempRoute = tempRoute.filter((a) => a.stationId === startID);
      departureStation = tempRoute[0].name.replace(' Underground Station', '');
      serviceHelper.log(
        'trace',
        'Get arrival station',
      );
      tempRoute = apiData.stops;
      tempRoute = tempRoute.filter((a) => a.stationId === endID);
      arrivalStation = tempRoute[0].name.replace(' Underground Station', '');
    }

    serviceHelper.log(
      'trace',
      'Get distruptions',
    );
    url = `https://api.tfl.gov.uk/Line/${line}?${TFLAPIKey}`;
    serviceHelper.log(
      'trace',
      url,
    );
    apiData = await serviceHelper.callAPIServiceGet(url);
    if (apiData instanceof Error) {
      serviceHelper.log(
        'error',
        apiData.message,
      );
      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          next,
          500,
          apiData,
        );
      }
      return apiData;
    }

    if (!serviceHelper.isEmptyObject(apiData) && apiData[0].disruptions) {
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
      serviceHelper.sendResponse(
        res,
        next,
        200,
        returnJSON,
      );
    }
    return returnJSON;
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        next,
        500,
        err,
      );
    }
    return err;
  }
}
skill.get(
  '/tubes/:line/next/:startID/to/:endID',
  nextTube,
);

/**
 * @type get
 * @path /buses/:route
 */
async function busStatus(req, res, next) {
  serviceHelper.log(
    'info',
    'Bus Status API called',
  );

  const TFLAPIKey = await serviceHelper.vaultSecret(
    process.env.ENVIRONMENT,
    'TFLAPIKey',
  );

  let { route } = req.params;
  let disruptions = false;
  let returnJSON;

  if (typeof route === 'undefined' || route === null || route === '') {
    const err = new Error('Missing param: route');
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      serviceHelper.sendResponse(
        res,
        next,
        400,
        err,
      );
    }
    return err;
  }

  try {
    serviceHelper.log(
      'trace',
      'Getting data from TFL',
    );
    const url = `https://api.tfl.gov.uk/Line/${route}/Status?detail=true&${TFLAPIKey}`;
    serviceHelper.log(
      'trace',
      url,
    );
    const apiData = await serviceHelper.callAlfredServiceGet(url);
    if (apiData instanceof Error) {
      serviceHelper.log(
        'error',
        apiData.message,
      );
      serviceHelper.sendResponse(
        res,
        next,
        500,
        apiData,
      );
      return apiData;
    }

    if (!serviceHelper.isEmptyObject(apiData) && apiData[0].disruptions) {
      route = apiData[0].name;
      if (apiData[0].disruptions.length > 1) disruptions = true;
    }

    returnJSON = {
      mode: 'bus',
      line: route,
      disruptions,
    };

    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        next,
        200,
        returnJSON,
      );
    }
    return returnJSON;
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        next,
        500,
        err,
      );
    }
    return err;
  }
}
skill.get(
  '/buses/:route',
  busStatus,
);

/**
 * @type get
 * @path /buses/:route/next
 */
async function nextbus(req, res, next) {
  serviceHelper.log(
    'info',
    'Next Bus API called',
  );

  const { route } = req.params;
  const TFLAPIKey = await serviceHelper.vaultSecret(
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
      serviceHelper.log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      serviceHelper.sendResponse(
        res,
        next,
        400,
        err,
      );
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
      serviceHelper.log(
        'trace',
        'Using Bus no. 380',
      );
      url = `https://api.tfl.gov.uk/StopPoint/490013012S/Arrivals?mode=bus&line=380&${TFLAPIKey}`;
      break;
    case '486':
      serviceHelper.log(
        'trace',
        'Using Bus no. 486',
      );
      stopPoint = '490001058H'; // Default going to work stop point
      if (!atHome) {
        stopPoint = '490010374B';
      } // Override to coming home stop point
      url = `https://api.tfl.gov.uk/StopPoint/${stopPoint}/Arrivals?mode=bus&line=486&${TFLAPIKey}`;
      break;
    case '161':
      serviceHelper.log(
        'trace',
        'Using Bus no. 161',
      );
      stopPoint = '490010374A'; // Default coming home stop point
      url = `https://api.tfl.gov.uk/StopPoint/${stopPoint}/Arrivals?mode=bus&line=161&${TFLAPIKey}`;
      break;
    default:
      serviceHelper.log(
        'trace',
        `Bus no.${route} is not supported`,
      );
      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          400,
          `Bus route ${route} is not currently supported`,
        );
        next();
      }
      return false;
  }

  try {
    // Get the bus data
    const passOnReq = { params: { route } };
    const distruptionsJSON = await busStatus(
      passOnReq,
      null,
      next,
    );
    if (distruptionsJSON instanceof Error) {
      serviceHelper.log(
        'error',
        distruptionsJSON.message,
      );
      serviceHelper.sendResponse(
        res,
        next,
        500,
        distruptionsJSON,
      );
      return distruptionsJSON;
    }

    serviceHelper.log(
      'trace',
      'Get data from TFL',
    );
    serviceHelper.log(
      'trace',
      url,
    );
    const apiData = await serviceHelper.callAPIServiceGet(url);
    if (apiData instanceof Error) {
      serviceHelper.log(
        'error',
        apiData.message,
      );
      serviceHelper.sendResponse(
        res,
        next,
        500,
        apiData,
      );
      return apiData;
    }

    if (serviceHelper.isEmptyObject(apiData)) {
      returnJSON = {};
      serviceHelper.log(
        'error',
        'No data was returned from the call to the TFL API',
      );
      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          next,
          200,
          returnJSON,
        );
      }
    } else {
      serviceHelper.log(
        'trace',
        'Filter bus stop for only desired route and direction',
      );
      let busData = apiData.filter((a) => a.lineId === route);
      serviceHelper.log(
        'trace',
        'Sort by time to arrive at staton',
      );
      busData = busData.sort(serviceHelper.GetSortOrder('timeToStation'));

      let numberOfElements = busData.length;
      if (numberOfElements > 2) numberOfElements = 2;

      returnJSON = {
        mode: 'bus',
        line: busData[0].lineName,
        destination: busData[0].destinationName,
        firstTime: serviceHelper.minutesToStop(busData[0].timeToStation),
        secondTime: 'N/A',
        disruptions: distruptionsJSON.disruptions,
      };

      if (numberOfElements === 2) {
        returnJSON.secondTime = serviceHelper.minutesToStop(busData[1].timeToStation);
      }

      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          next,
          200,
          returnJSON,
        );
      }
    }
    return returnJSON;
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        next,
        500,
        err,
      );
    }
    return err;
  }
}
skill.get(
  '/buses/:route/next',
  nextbus,
);

/**
 * @type get
 * @path /trains/:startID/to/:endID
 */
async function nextTrain(req, res, next) {
  serviceHelper.log(
    'info',
    'Next train API called',
  );

  const TransportAPIKey = await serviceHelper.vaultSecret(
    process.env.ENVIRONMENT,
    'TransportAPIKey',
  );
  const { nextTrainOnly } = req.params;

  let {
    startID,
    endID,
    departureTimeOffSet,
    disruptionsOnly,
  } = req.params;

  if (typeof startID === 'undefined' || startID === null || startID === '') {
    const err = new Error('Missing param: startID');
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      serviceHelper.sendResponse(
        res,
        next,
        400,
        err,
      );
    }
    return err;
  }
  startID = startID.toUpperCase();

  if (typeof endID === 'undefined' || endID === null || endID === '') {
    const err = new Error('Missing param: endID');
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.log(
        'error',
        `Invalid params: ${JSON.stringify(req.params)}`,
      );
      serviceHelper.sendResponse(
        res,
        next,
        400,
        err,
      );
    }
    return err;
  }
  endID = endID.toUpperCase();

  if (typeof departureTimeOffSet !== 'undefined' && departureTimeOffSet !== null && departureTimeOffSet !== '') {
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
  serviceHelper.log(
    'trace',
    url,
  );

  try {
    serviceHelper.log(
      'trace',
      'Get data from API',
    );
    const apiData = await serviceHelper.callAPIServiceGet(url);

    if (apiData instanceof Error) {
      const err = new Error('Error transportapi.com response');
      serviceHelper.log(
        'error',
        err.message,
      );
      serviceHelper.sendResponse(
        res,
        next,
        500,
        err,
      );
      return apiData;
    }

    if (serviceHelper.isEmptyObject(apiData)) {
      const err = new Error('No data was returned from the call to the API');
      serviceHelper.log(
        'error',
        err.message,
      );
      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          next,
          500,
          err,
        );
      }
      return err;
    }

    let trainData = apiData.departures.all;

    if (serviceHelper.isEmptyObject(trainData)) {
      const err = new Error('No trains running');
      serviceHelper.log(
        'info',
        err.message,
      );
      const returnMsg = [
        {
          mode: 'train',
          disruptions: 'true',
          status: err.message,
        },
      ];
      if (typeof res !== 'undefined' && res !== null) {
        serviceHelper.sendResponse(
          res,
          next,
          200,
          returnMsg,
        );
      }
      return returnMsg;
    }

    serviceHelper.log(
      'trace',
      'Remove results that start and end at same station',
    );
    const cleanData = trainData.filter(
      (a) => a.origin_name !== a.destination_name,
    );

    serviceHelper.log(
      'trace',
      'Sort by departure time',
    );
    trainData = cleanData.sort(
      serviceHelper.GetSortOrder('aimed_departure_time'),
    );

    serviceHelper.log(
      'trace',
      'Construct JSON',
    );
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
    if (maxJourneyCounter > trainData.length) maxJourneyCounter = trainData.length;
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
      if (trainData[index].platform != null) departurePlatform = trainData[index].platform;
      status = trainData[index].status.toLowerCase();

      serviceHelper.log(
        'trace',
        'Check for cancelled train',
      );
      if (
        trainData[index].status.toLowerCase() === 'it is currently off route'
        || trainData[index].status.toLowerCase() === 'cancelled'
      ) {
        serviceHelper.log(
          'trace',
          'Found distrupted train',
        );
        disruptions = true;
        anyDisruptions = true;
      }

      if (!disruptionsOnly) {
        serviceHelper.log(
          'trace',
          'Get stops info',
        );
        url = trainData[index].service_timetable.id;
        // eslint-disable-next-line no-await-in-loop
        trainStations = await serviceHelper.callAPIServiceGet(url);
        if (apiData instanceof Error) {
          serviceHelper.log(
            'error',
            apiData.message,
          );
        } else {
          trainStations = trainStations.stops;
          serviceHelper.log(
            'trace',
            'Get arrival time at destination station',
          );
          trainStations = trainStations.filter((a) => a.station_code === endID);
          arrivalTime = trainStations[0].aimed_arrival_time;
          arrivalStation = trainStations[0].station_name;

          serviceHelper.log(
            'trace',
            'Work out duration',
          );
          duration = serviceHelper.timeDiff(departureTime, arrivalTime);

          serviceHelper.log(
            'trace',
            'Construct journey JSON',
          );

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
        serviceHelper.log(
          'trace',
          'Send data back to caller',
        );
        if (disruptionsOnly) returnJSON = { anyDisruptions };

        if (typeof res !== 'undefined' && res !== null) {
          serviceHelper.sendResponse(
            res,
            next,
            200,
            returnJSON,
          );
        }
        return returnJSON;
      }
    }
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
    if (typeof res !== 'undefined' && res !== null) {
      serviceHelper.sendResponse(
        res,
        next,
        500,
        err,
      );
    }
    return err;
  }
  return true;
}
skill.get(
  '/trains/:startID/to/:endID',
  nextTrain,
);

module.exports = {
  skill,
  tubeStatus,
  nextTube,
  nextTrain,
};
