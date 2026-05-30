// =============================================================================
// Scheduler Service - Program Scheduling & Automation
// =============================================================================

const schedule = require('node-schedule');
const { query } = require('../database/connection');
const { broadcast } = require('./websocket');
const logger = require('../utils/logger');

const activeJobs = new Map();

function startScheduler() {
  // Check schedule every minute
  schedule.scheduleJob('* * * * *', async () => {
    try {
      await checkSchedule();
    } catch (error) {
      logger.error('Schedule check error:', error.message);
    }
  });

  // Daily cleanup at 3 AM
  schedule.scheduleJob('0 3 * * *', async () => {
    try {
      await cleanupOldStats();
      await cleanupOldLogs();
    } catch (error) {
      logger.error('Cleanup error:', error.message);
    }
  });

  logger.info('Scheduler initialized');
}

async function checkSchedule() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.toTimeString().substring(0, 5);

  // Find slots that should be active now
  const result = await query(
    `SELECT ss.*, dp.dj_name, s.name as station_name
     FROM schedule_slots ss
     LEFT JOIN dj_profiles dp ON ss.dj_profile_id = dp.id
     LEFT JOIN stations s ON ss.station_id = s.id
     WHERE ss.day_of_week = $1
       AND ss.start_time <= $2::TIME
       AND ss.end_time > $2::TIME
       AND ss.is_recurring = true`,
    [dayOfWeek, currentTime]
  );

  if (result.rows.length > 0) {
    // Broadcast current schedule info
    broadcast('schedule', {
      current: result.rows.map(slot => ({
        title: slot.title,
        djName: slot.dj_name,
        stationName: slot.station_name,
        startTime: slot.start_time,
        endTime: slot.end_time,
        isLive: slot.is_live
      }))
    });
  }
}

async function cleanupOldStats() {
  // Keep only 90 days of listener stats
  const result = await query(
    `DELETE FROM listener_stats WHERE recorded_at < NOW() - INTERVAL '90 days'`
  );
  logger.info(`Cleaned up ${result.rowCount} old listener stats records`);
}

async function cleanupOldLogs() {
  // Keep only 30 days of system logs
  const result = await query(
    `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days'`
  );
  logger.info(`Cleaned up ${result.rowCount} old log records`);
}

module.exports = { startScheduler };
