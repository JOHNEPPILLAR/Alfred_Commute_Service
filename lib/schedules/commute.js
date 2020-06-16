/**
 * Import external libraries
 */
const scheduler = require('node-schedule');
const dateformat = require('dateformat');
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const commuteHelper = require('../api/travel/commute.js');

/**
 * Check for distruptions
 */
async function checkDistruptions() {
  serviceHelper.log(
    'trace',
    'Checking for any commute distruptions',
  );

  let commuteData;
  let commuteDistruption;

  try {
    serviceHelper.log(
      'trace',
      'Getting commute status',
    );
    commuteData = await commuteHelper.getCommuteStatus();
    if (commuteData instanceof Error) {
      serviceHelper.log(
        'error',
        commuteHelper,
      );
      return false;
    }
    commuteDistruption = commuteData.anyDisruptions;
  } catch (err) {
    serviceHelper.log(
      'error',
      `${err.message}`,
    );
    return false;
  }

  if (commuteDistruption) {
    serviceHelper.log(
      'info',
      'There are commute distruptions',
    );
    if (!global.commuteDistruptions) {
      serviceHelper.log(
        'trace',
        'No previous notifications sent, send first notification',
      );
      const messageToSend = 'Distruptions on the 🚂, please check transport apps for more information.';
      serviceHelper.sendPushNotification(messageToSend);
    } else {
      serviceHelper.log(
        'trace',
        'Notification already sent',
      );
    }
    global.commuteDistruptions = true;
  } else {
    serviceHelper.log(
      'info',
      'There are no commute distruptions',
    );
    if (global.commuteDistruptions) {
      const messageToSend = '🚂 Distruptions have cleared';
      serviceHelper.log(
        'trace',
        messageToSend,
      );
      serviceHelper.sendPushNotification(messageToSend);
    }
    global.commuteDistruptions = false;
  }
  return true;
}

/**
 * Check date for bank holiday or weekend
 */
async function checkForBankHolidayWeekend() {
  const isWeekEndBankHoliday = await serviceHelper.checkForBankHolidayWeekend();
  if (isWeekEndBankHoliday instanceof Error) {
    serviceHelper.log(
      'trace',
      isWeekEndBankHoliday.message,
    );
    return;
  }

  if (isWeekEndBankHoliday) return;

  let counter = 0;
  const repeatTimer = setInterval(async () => {
    serviceHelper.log(
      'trace',
      `Checked cummute status ${counter} times`,
    );
    await checkDistruptions();
    counter += 1;
    if (counter === 10) clearInterval(repeatTimer); // exit after 20 minutes
  }, 120000); // Repeat every 2 minutes
}

/**
 * Set up commute distruptions notifications
 */
async function setupSchedules() {
  global.commuteDistruptions = false; // Reset distruptions flag

  try {
    const SQL = 'SELECT hour, minute FROM schedules WHERE active';
    serviceHelper.log(
      'trace',
      'Connect to data store',
    );
    const dbConnection = await serviceHelper.connectToDB('commute');
    serviceHelper.log(
      'trace',
      'Get commute schedule settings',
    );
    const results = await dbConnection.query(SQL);
    serviceHelper.log(
      'trace',
      'Release the data store and close the connection',
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      serviceHelper.log(
        'trace',
        'No commute schedules are active',
      );
      return;
    }

    serviceHelper.log(
      'trace',
      'Create commute check schedule',
    );
    const date = new Date();
    date.setHours(results.rows[0].hour || '07');
    date.setMinutes(results.rows[0].minute || '10');
    const schedule = scheduler.scheduleJob(date, () => checkForBankHolidayWeekend());
    global.schedules.push(schedule);
    serviceHelper.log(
      'info',
      `Schedule will run on ${dateformat(date, 'dd-mm-yyyy @ HH:MM')}`,
    );
  } catch (err) {
    serviceHelper.log(
      'error',
      err.message,
    );
  }
}

exports.setup = setupSchedules;
