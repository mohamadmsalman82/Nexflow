import type { WorkflowEntrypoint } from "cloudflare:workflows";
import { FlowRecord, FlowRecordSchema } from "../schemas/FlowConfig";
import { RunRecord } from "../schemas/RunRecord";
import { isDue } from "../lib/cron";
import {
  getManagerStub,
  NexFlowBindings,
  runFlowNow
} from "../lib/utils";

class WorkflowBase<T> {
  static triggers?: Record<string, unknown>;
}

export class NexFlowEngine
  extends WorkflowBase<NexFlowBindings>
  implements WorkflowEntrypoint<NexFlowBindings>
{
  static triggers = {
    crons: ["* * * * *"]
  };

  async run(_event: unknown, env: NexFlowBindings, ctx: ExecutionContext) {
    console.log("[NexFlowEngine] Cron tick started at", new Date().toISOString());
    // Run a loop for ~55 seconds to check for flows every 15 seconds
    const loopStart = Date.now();
    const LOOP_DURATION = 55_000;
    const INTERVAL = 15_000;

    while (Date.now() - loopStart < LOOP_DURATION) {
      await this.checkAndRunFlows(env, ctx);
      
      // Wait for next interval if time remains
      const elapsed = Date.now() - loopStart;
      if (elapsed < LOOP_DURATION) {
        await new Promise((resolve) => setTimeout(resolve, INTERVAL));
      }
    }
  }

  private async checkAndRunFlows(env: NexFlowBindings, ctx: ExecutionContext) {
    try {
      const flows = await this.fetchFlows(env);
      const now = new Date();

      const runnable = flows.filter((flow) =>
        isDue(flow.schedule, flow.lastRunAt, now)
      );

      if (runnable.length > 0) {
        console.log(
          `[NexFlowEngine] ${runnable.length} flow(s) due at ${now.toISOString()}`
        );
      }

      await Promise.all(
        runnable.map(async (flow) => {
          try {
            console.log(
              `[NexFlowEngine] Running flow ${flow.name} (${flow.id}) scheduled ${flow.schedule}`
            );
            const record = await runFlowNow(flow, env, { trigger: "cron" });
            ctx.waitUntil(this.writeRunRecord(env, record));
          } catch (error) {
            console.error(
              `[NexFlowEngine] Failed to run ${flow.name} (${flow.id})`,
              error
            );
          }
        })
      );
    } catch (error) {
      console.error("[NexFlowEngine] Loop error:", error);
    }
  }

  private async fetchFlows(env: NexFlowBindings): Promise<FlowRecord[]> {
    const stub = getManagerStub(env);
    const response = await stub.fetch("https://nexflow-manager/flows");
    if (!response.ok) {
      throw new Error(`Unable to list flows (${response.status})`);
    }
    const data = await response.json();
    return FlowRecordSchema.array().parse(data);
  }

  private async writeRunRecord(
    env: NexFlowBindings,
    record: RunRecord
  ): Promise<void> {
    const stub = getManagerStub(env);
    const response = await stub.fetch("https://nexflow-manager/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      console.error(
        `[NexFlowEngine] failed to persist log for ${record.name}: ${response.status}`
      );
    }
  }
}
