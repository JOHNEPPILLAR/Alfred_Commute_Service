/**
 * Import helper libraries
 */
const commuteHelper = require('../api/travel/commute.js');

/**
 * Check for distruptions
 */
async function checkDistruptions() {
  this.logger.debug(
    `${this._traceStack()} - Checking for any commute distruptions`,
  );

  let commuteData;
  let commuteDistruption;

  try {
    this.logger.trace(`${this._traceStack()} - Getting commute status`);
    commuteData = await commuteHelper._getCommuteStatus();
    if (commuteData instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${commuteData.message}`);
      return false;
    }
    commuteDistruption = commuteData.anyDisruptions;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    return false;
  }

  if (commuteDistruption) {
    this.logger.trace(`${this._traceStack()} - There are commute distruptions`);
    if (!global.commuteDistruptions) {
      this.logger.trace(
        `${this._traceStack()} - No previous notifications sent, send first notification`,
      );
      const messageToSend =
        'Distruptions on the 🚂, please check transport apps for more information.';
      this._sendPushNotification.call(this, messageToSend);
    } else {
      this.logger.trace(`${this._traceStack()} - Notification already sent`);
    }
    global.commuteDistruptions = true;
  } else {
    this.logger.trace(
      `${this._traceStack()} - There are no commute distruptions`,
    );
    if (global.commuteDistruptions) {
      const messageToSend = '🚂 Distruptions have cleared';
      this.logger.trace(`${this._traceStack()} - ${messageToSend}`);
      this._sendPushNotification.call(this, messageToSend);
    }
    global.commuteDistruptions = false;
  }
  return true;
}

/**
 * Check date for bank holiday or weekend
 */
async function checkForBankHolidayWeekend() {
  const isWeekEndBankHoliday = await this._isBankHolidayWeekend.call(this);
  if (isWeekEndBankHoliday instanceof Error) {
    this.logger.trace(
      `${this._traceStack()} - ${isWeekEndBankHoliday.message}`,
    );
    return;
  }
  if (isWeekEndBankHoliday) return;

  const isJPAtHome = await this._workingFromHomeToday.call(this);
  if (isJPAtHome instanceof Error) {
    this.logger.trace(`${this._traceStack()} - ${isJPAtHome.message}`);
    return;
  }
  if (isJPAtHome) return;

  let counter = 0;
  const repeatTimer = setInterval(async () => {
    this.logger.trace(
      `${this._traceStack()} - Checked cummute status ${counter} times`,
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
  try {
    // Clear current schedules array
    this.logger.debug(`${this._traceStack()} - Clear current schedules`);
    this.schedules = [];

    this.logger.debug(`${this._traceStack()} - Setting up Schedules`);

    global.commuteDistruptions = false; // Reset distruptions flag

    const sql = 'SELECT hour, minute FROM schedules WHERE active';
    this.logger.trace(`${this._traceStack()} - Connect to data store`);
    const dbConnection = await this._connectToDB('commute');
    this.logger.trace(`${this._traceStack()} - Get commute schedule settings`);
    const results = await dbConnection.query(sql);
    this.logger.trace(
      `${this._traceStack()} - Release the data store and close the connection`,
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      this.logger.trace(
        `${this._traceStack()} - No commute schedules are active`,
      );
      return;
    }

    this.logger.debug(`${this._traceStack()} - Create commute check schedule`);
    this.logger.trace(
      `${this._traceStack()} - Register commute check schedule`,
    );
    this.schedules.push({
      hour: results.rows[0].hour || 7,
      minute: results.rows[0].minute || 10,
      description: 'Commute check',
      functionToCall: checkForBankHolidayWeekend,
    });

    // Activate schedules
    await this.activateSchedules();
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

module.exports = {
  setupSchedules,
};
