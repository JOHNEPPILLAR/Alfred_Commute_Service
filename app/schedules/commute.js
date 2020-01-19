/**
 * Import external libraries
 */
const scheduler = require('node-schedule');
const dateFormat = require('dateformat');
const serviceHelper = require('alfred-helper');
const apn = require('apn');

/**
 * Import helper libraries
 */
const commuteHelper = require('../api/travel/commute.js');

/**
 * Send IOS notification
 */
async function sendPushNotification(apnProvider, user, messageToSend) {
  if (typeof user.app_user !== 'undefined' && user.user !== null) {
    const notification = new apn.Notification();
    notification.topic = 'JP.Alfred-IOS';
    notification.expiry = Math.floor(Date.now() / 1000) + 600; // Expires 10 minutes from now.
    notification.alert = messageToSend;
    serviceHelper.log('trace', 'Send Apple push notification');
    const result = await apnProvider.send(notification, user.device_token);
    if (result.sent.length === 1) {
      serviceHelper.log(
        'info',
        `Commute push notification sent to: ${user.device_token}`,
      );
    } else {
      serviceHelper.log(
        'error',
        `Commute push notification failed to send: ${result.failed[0].response.reason}, for device: ${user.device_token}`,
      );
    }
  }
  return true;
}

/**
 * Get devices to notify
 */
async function getDevicesToNotify(messageToSend) {
  let results;
  let dbClient;

  // Get the list of devices to push notifiactions to
  const SQL = 'SELECT last(device_token, time) as device_token, app_user FROM ios_devices WHERE app_user is not null GROUP BY app_user';
  try {
    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbConnection = await serviceHelper.connectToDB('devices');
    dbClient = await dbConnection.connect(); // Connect to data store
    serviceHelper.log('trace', 'Getting IOS devices');
    results = await dbClient.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store and close the connection',
    );
    await dbClient.end(); // Close data store connection

    if (results.rowCount === 0) {
      serviceHelper.log(
        'warn',
        'No devices registered to send push notifications to',
      );
      return false;
    } // Exit function as no data to process

    // Connect to apples push notification service
    serviceHelper.log('trace', 'Connect to Apple push notification service');
    const apnProvider = await serviceHelper.connectToAPN();

    // Send notifications
    await Promise.all(
      results.rows.map((user) => sendPushNotification(apnProvider, user, messageToSend)),
    );

    serviceHelper.log(
      'trace',
      'Close down connection to push notification service',
    );
    await apnProvider.shutdown(); // Close the connection with apn
  } catch (err) {
    serviceHelper.log('error', err.message);
    return false;
  }
  return true;
}

/**
 * Check for distruptions
 */
async function checkDistruptions() {
  serviceHelper.log('trace', 'Checking for any commute distruptions');

  let commuteData;
  let commuteDistruption;

  try {
    serviceHelper.log('trace', 'Getting commute status');
    commuteData = await commuteHelper.getCommuteStatus();
    if (commuteData instanceof Error) {
      serviceHelper.log('error', commuteHelper);
      return false;
    }
    commuteDistruption = commuteData.anyDisruptions;
  } catch (err) {
    serviceHelper.log('error', `${err.message}`);
    return false;
  }

  if (commuteDistruption) {
    serviceHelper.log('info', 'There are commute distruptions');
    if (!global.commuteDistruptions) {
      serviceHelper.log(
        'trace',
        'No previous notifications sent, send first notification',
      );
      getDevicesToNotify(
        'Distruptions on the 🚂, please check Citymapper for more information.',
      );
    } else {
      serviceHelper.log('trace', 'Notification already sent');
    }
    global.commuteDistruptions = true;
  } else {
    serviceHelper.log('info', 'There are no commute distruptions');
    if (global.commuteDistruptions) {
      serviceHelper.log(
        'trace',
        'Notifications sent, send another informing distruption of over.',
      );
      getDevicesToNotify('🚂 Distruptions have cleared');
    }
    global.commuteDistruptions = false;
  }
  return true;
}

/**
 * Check date for bank holiday or weekend
 */
async function checkForBankHolidayWeekend() {
  serviceHelper.log('trace', 'Check for bank holidays and weekends');
  const toDay = new Date();
  const isWeekend = toDay.getDay() === 6 || toDay.getDay() === 0;
  const url = 'https://www.gov.uk/bank-holidays.json';
  let counter = 1;

  if (isWeekend) {
    serviceHelper.log('trace', "It's the weekend");
    return;
  }

  const returnData = await serviceHelper.callAPIService(url);
  if (returnData instanceof Error) {
    serviceHelper.log('trace', returnData.message);
    return;
  }

  let bankHolidays = [];
  try {
    bankHolidays = returnData['england-and-wales'].events;
  } catch (err) {
    serviceHelper.log('error', err.message);
    return;
  }
  if (bankHolidays.length === 0) {
    serviceHelper.log('trace', 'No bank holiday data');
    return;
  }

  bankHolidays = bankHolidays.filter(
    (a) => a.date === dateFormat(toDay, 'yyyy-mm-dd'),
  );

  if (bankHolidays.length === 0) {
    checkDistruptions();
    serviceHelper.log('trace', "It's a weekday");
    const repeatTimer = setInterval(() => {
      serviceHelper.log('trace', `Checked cummute status ${counter} times`);
      checkDistruptions();
      counter += 1;
      if (counter === 10) clearInterval(repeatTimer); // exit after 20 minutes
    }, 120000); // Repeat every 2 minutes
  } else {
    serviceHelper.log(
      'trace',
      `It's ${bankHolidays[0].title}, so will not check commute status`,
    );
  }
}

/**
 * Set up commute distruptions notifications
 */
exports.setup = async () => {
  let schedule;
  let results;
  let dbClient;

  global.commuteDistruptions = false; // Reset distruptions flag

  try {
    const SQL = 'SELECT hour, minute FROM schedules WHERE active';
    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbConnection = await serviceHelper.connectToDB('commute');
    dbClient = await dbConnection.connect(); // Connect to data store
    serviceHelper.log('trace', 'Get commute schedule settings');
    results = await dbClient.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store and close the connection',
    );
    await dbClient.end(); // Close data store connection

    if (results.rowCount === 0) {
      serviceHelper.log('trace', 'No commute schedules are active');
    } // Exit function as no data to process

    serviceHelper.log('trace', 'Create commute check timer');
    const rule = new scheduler.RecurrenceRule();
    rule.hour = results.rows[0].hour || '07';
    rule.minute = results.rows[0].minute || '10';

    // Set the schedule
    schedule = scheduler.scheduleJob(rule, () => checkForBankHolidayWeekend());
    global.schedules.push(schedule);
    serviceHelper.log(
      'info',
      `Commute check schedule will run at: ${serviceHelper.zeroFill(
        rule.hour,
        2,
      )}:${serviceHelper.zeroFill(rule.minute, 2)}`,
    );
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
};
