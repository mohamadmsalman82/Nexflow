import { isDue } from "../src/lib/cron.ts";

const defaultNow = new Date("2025-01-01T12:00:00Z");

type Scenario = {
  schedule: string;
  lastRunAt?: string;
  expected: "DUE" | "WAIT";
  note: string;
  nowOverride?: string;
};

const scenarios: Scenario[] = [
  {
    schedule: "*/5 * * * *",
    lastRunAt: "2025-01-01T11:55:00Z",
    expected: "DUE",
    note: "Every 5 minutes; 5 minutes have passed."
  },
  {
    schedule: "*/5 * * * *",
    lastRunAt: "2025-01-01T11:55:00Z",
    nowOverride: "2025-01-01T11:56:00Z",
    expected: "WAIT",
    note: "Every 5 minutes; next run at 12:00 so 11:56 should wait."
  },
  {
    schedule: "*/15 * * * *",
    lastRunAt: "2025-01-01T11:55:00Z",
    expected: "DUE",
    note: "Next occurrence exactly at 12:00."
  },
  {
    schedule: "0 9 * * *",
    lastRunAt: "2024-12-31T09:00:00Z",
    expected: "DUE",
    note: "Daily 09:00 UTC; has not run yet today."
  },
  {
    schedule: "0 12 * * *",
    lastRunAt: undefined,
    expected: "DUE",
    note: "New flow scheduled for 12:00 should run immediately."
  }
];

console.log("Cron simulation baseline @", defaultNow.toISOString());
scenarios.forEach((scenario) => {
  const checkTime = scenario.nowOverride
    ? new Date(scenario.nowOverride)
    : defaultNow;
  const due = isDue(scenario.schedule, scenario.lastRunAt, checkTime);
  console.log(
    ` - ${scenario.schedule.padEnd(10)} lastRun=${scenario.lastRunAt ?? "never"} now=${
      checkTime.toISOString()
    } => ${due ? "DUE" : "WAIT"} (expected ${scenario.expected} – ${scenario.note})`
  );
});

