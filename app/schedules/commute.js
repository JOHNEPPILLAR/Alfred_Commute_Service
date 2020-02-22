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

  // Get the list of devices to push notifiactions to
  const SQL = 'SELECT last(device_token, time) as device_token, app_user FROM ios_devices WHERE app_user is not null GROUP BY app_user';
  try {
    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbConnection = await serviceHelper.connectToDB('devices');
    serviceHelper.log('trace', 'Getting IOS devices');
    results = await dbConnection.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store and close the connection',
    );
    await dbConnection.end(); // Close data store connection

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
}

/**
 * Check date for bank holiday or weekend
 */
async function checkForBankHolidayWeekend() {
  const isWeekEndBankHoliday = await serviceHelper.checkForBankHolidayWeekend();
  if (isWeekEndBankHoliday instanceof Error) {
    serviceHelper.log('trace', isWeekEndBankHoliday.message);
    return;
  }

  if (isWeekEndBankHoliday) return;

  let counter = 0;
  const repeatTimer = setInterval(async () => {
    serviceHelper.log('trace', `Checked cummute status ${counter} times`);
    await checkDistruptions();
    counter += 1;
    if (counter === 10) clearInterval(repeatTimer); // exit after 20 minutes
  }, 120000); // Repeat every 2 minutes
}

/**
 * Set up commute distruptions notifications
 */
exports.setup = async () => {
  global.commuteDistruptions = false; // Reset distruptions flag

  try {
    const SQL = 'SELECT hour, minute FROM schedules WHERE active';
    serviceHelper.log('trace', 'Connect to data store');
    const dbConnection = await serviceHelper.connectToDB('commute');
    serviceHelper.log('trace', 'Get commute schedule settings');
    const results = await dbConnection.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store and close the connection',
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      serviceHelper.log('trace', 'No commute schedules are active');
    } // Exit function as no data to process

    serviceHelper.log('trace', 'Create commute check schedule');
    const date = new Date();
    date.setHours(results.rows[0].hour || '07');
    date.setMinutes(results.rows[0].minute || '10');
    const schedule = scheduler.scheduleJob(date, () => checkForBankHolidayWeekend());
    global.schedules.push(schedule);
    serviceHelper.log(
      'info',
      `Reset schedules will run on ${dateFormat(date, 'dd-mm-yyyy @ HH:MM')}`,
    );
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
};
