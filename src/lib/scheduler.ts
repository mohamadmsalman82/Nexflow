import { isDue } from "./cron";
import { createManagerAPI, NexFlowBindings } from "./utils";
import type { FlowRecord } from "../schemas/FlowConfig";

const SCHEDULER_INTERVAL_MS = 15_000;

class FlowScheduler {
  private env: NexFlowBindings;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(env: NexFlowBindings) {
    this.env = env;
  }

  updateEnv(env: NexFlowBindings) {
    this.env = env;
  }

  start() {
    if (this.timer) return;
    console.log(
      `[FlowScheduler] starting interval (${SCHEDULER_INTERVAL_MS}ms) at ${new Date().toISOString()}`
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, SCHEDULER_INTERVAL_MS);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const manager = createManagerAPI(this.env);
      const flows = await manager.list();
      if (!Array.isArray(flows) || !flows.length) return;
      const now = new Date();
      for (const flow of flows) {
        if (!this.shouldRun(flow, now)) continue;
        try {
          console.log(
            `[FlowScheduler] Cron triggering "${flow.name}" (${flow.id}) at ${now.toISOString()}`
          );
          await manager.run(flow.id, { trigger: "cron" });
        } catch (err) {
          console.error(
            `[FlowScheduler] Failed to run "${flow.name}" (${flow.id})`,
            err
          );
        }
      }
    } catch (err) {
      console.error("[FlowScheduler] Tick error", err);
    } finally {
      this.running = false;
    }
  }

  private shouldRun(flow: FlowRecord, now: Date): boolean {
    if (flow.enabled === false) {
      return false;
    }
    if (!flow.schedule || !flow.schedule.trim()) {
      return false;
    }
    return isDue(flow.schedule, flow.lastRunAt, now);
  }
}

let scheduler: FlowScheduler | null = null;

export function ensureFlowScheduler(env: NexFlowBindings) {
  if (!scheduler) {
    scheduler = new FlowScheduler(env);
    scheduler.start();
  } else {
    scheduler.updateEnv(env);
  }
}

