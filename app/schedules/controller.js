/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');
const scheduler = require('node-schedule');

/**
 * Import helper libraries
 */
const commute = require('./commute.js');

// Set up the schedules
async function setupSchedules() {
  // Cancel any existing schedules
  serviceHelper.log(
    'trace',
    'Removing any existing schedules',
  );
  await global.schedules.map((value) => value.cancel());
  await commute.setup(); // commute schedules
}

exports.setSchedule = async () => {
  await setupSchedules(); // commute schedules

  // Set schedules each day to keep in sync with sunrise & sunset changes
  const rule = new scheduler.RecurrenceRule();
  rule.hour = 3;
  rule.minute = 5;
  const schedule = scheduler.scheduleJob(rule, () => {
    serviceHelper.log('info', 'Resetting daily schedules to keep in sync with sunrise & sunset changes');
    setupSchedules(); // commute schedules
  }); // Set the schedule
  global.schedules.push(schedule);

  serviceHelper.log(
    'info',
    `Reset schedules will run at: ${serviceHelper.zeroFill(
      rule.hour,
      2,
    )}:${serviceHelper.zeroFill(rule.minute, 2)}`,
  );
};
