import { CronExpressionParser } from "cron-parser";

/**
 * Checks if a flow is due to run based on its cron schedule and last run time.
 * Uses cron-parser to compute the next scheduled run after the last execution.
 *
 * @param schedule The cron expression (e.g. "0 9 * * *")
 * @param lastRunAt ISO string of the last run time. If undefined, uses createdAt or epoch.
 * @param now The current time to check against.
 * @returns true if the next scheduled time is <= now.
 */
export function isDue(
  schedule: string,
  lastRunAt: string | undefined,
  now: Date = new Date()
): boolean {
  try {
    const refDate = lastRunAt ? new Date(lastRunAt) : new Date(now.getTime() - 60_000);
    const expression = CronExpressionParser.parse(schedule, {
      currentDate: refDate,
      tz: "UTC"
    });
    const nextRun = expression.next().toDate();
    return nextRun <= now;
  } catch (err) {
    console.warn(`[cron] Invalid expression "${schedule}": ${err}`);
    return false;
  }
}
