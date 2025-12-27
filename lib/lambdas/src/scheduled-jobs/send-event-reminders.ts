import { ScheduledHandler } from 'aws-lambda';

/**
 * Send event reminders (runs hourly via EventBridge cron)
 *
 * Flow:
 * 1. Query events happening now (startTime <= now <= endTime)
 * 2. For each event, get all members
 * 3. Send push notification reminder to members
 * 4. Track last reminder time to avoid spam
 */
export const handler: ScheduledHandler = async (event) => {
  console.log('SendEventReminders invoked', JSON.stringify(event, null, 2));

  // TODO: Implement event reminder logic
  // - Query Event table for active events
  // - For each event: Query EventMember table for members
  // - Send push notification via SNS/Pinpoint
  // - Update lastReminderSentAt in Event table

  return;
};
