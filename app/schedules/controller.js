/**
 * Import external libraries
 */
const scheduler = require('node-schedule');
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const commute = require('./commute.js');

/**
 * Set up the schedules
 */
exports.setSchedule = () => {
  // Cancel any existing schedules
  serviceHelper.log(
    'trace',
    'Removing any existing schedules',
  );
  global.schedules.forEach((value) => {
    value.cancel();
  });

  commute.setup(); // commute schedules
};
