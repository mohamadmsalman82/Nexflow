import { z } from "zod";
import {
  FlowConfig,
  FlowConfigSchema,
  FlowRecord
} from "../schemas/FlowConfig";
import { RunRecord, RunRecordSchema } from "../schemas/RunRecord";
import { generateFlowId, runFlowNow } from "../lib/utils";
import type { NexFlowBindings } from "../lib/utils";
const ToggleSchema = z.object({
  enabled: z.boolean()
});

const RunTriggerSchema = z
  .object({
    trigger: z.enum(["manual", "cron"]).optional()
  })
  .optional();


interface NexFlowState {
  flows: Record<string, FlowRecord>;
  history: Record<string, RunRecord[]>;
}

export class NexFlowManager {
  state: DurableObjectState;
  env: NexFlowBindings;

  constructor(state: DurableObjectState, env: NexFlowBindings) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const method = request.method.toUpperCase();

    let storage = await this.loadState();
    storage = await this.migrateLegacyState(storage);

    if (segments[0] === "flows") {
      if (segments.length === 1) {
        if (method === "GET") {
          return Response.json(
            Object.values(storage.flows).map((flow) => this.withDefaults(flow))
          );
        }
        if (method === "POST") {
          const payload = FlowConfigSchema.parse(await request.json());
          const id = generateFlowId(payload.name);
          if (storage.flows[id]) {
            return new Response("Flow already exists", { status: 409 });
          }
          const now = new Date().toISOString();
          const record: FlowRecord = {
            ...payload,
            id,
            createdAt: now,
            updatedAt: now
          };
          storage.flows[id] = this.withDefaults(record);
          await this.saveState(storage);
          return Response.json(storage.flows[id], { status: 201 });
        }
      }

      if (segments.length >= 2) {
        const id = segments[1];
        const storedFlow = storage.flows[id];
        if (!storedFlow) {
          return new Response("Flow not found", { status: 404 });
        }
        const flow = this.withDefaults(storedFlow);

        if (segments.length === 2) {
          if (method === "GET") {
            return Response.json(flow);
          }
          if (method === "PUT") {
            const payload = FlowConfigSchema.parse(await request.json());
            const now = new Date().toISOString();
            const updated: FlowRecord = {
              ...payload,
              id,
              createdAt: flow.createdAt,
              updatedAt: now,
              lastRunAt: flow.lastRunAt
            };
            storage.flows[id] = this.withDefaults(updated);
            await this.saveState(storage);
            return Response.json(storage.flows[id]);
          }
          if (method === "DELETE") {
            delete storage.flows[id];
            delete storage.history[id];
            await this.saveState(storage);
            return new Response(null, { status: 204 });
          }
        }

        if (segments[2] === "enabled" && method === "PATCH") {
          const body = ToggleSchema.parse(await request.json());
          const now = new Date().toISOString();
          const updated: FlowRecord = {
            ...flow,
            enabled: body.enabled,
            updatedAt: now
          };
          storage.flows[id] = updated;
          await this.saveState(storage);
          return Response.json(updated);
        }

        if (segments[2] === "logs" && method === "GET") {
          return Response.json(storage.history[id] || []);
        }

        if (segments[2] === "run" && method === "POST") {
          let trigger: "manual" | "cron" = "manual";
          if (request.body) {
            try {
              const parsed = RunTriggerSchema.parse(await request.json());
              if (parsed?.trigger) trigger = parsed.trigger;
            } catch {
              // ignore malformed body, default to manual
            }
          }
          const record = await runFlowNow(flow, this.env, { trigger });
          await this.persistRun(storage, record);
          return Response.json(record);
        }
      }
    }

    if (segments[0] === "runs" && method === "POST") {
      const body = await request.json();
      const parsed = RunRecordSchema.parse(body);
      await this.persistRun(storage, parsed);
      return Response.json(parsed);
    }

    return new Response("Not found", { status: 404 });
  }

  private async loadState(): Promise<NexFlowState> {
    return (
      (await this.state.storage.get<NexFlowState>("state")) || {
        flows: {},
        history: {}
      }
    );
  }

  private async saveState(data: NexFlowState) {
    await this.state.storage.put("state", data);
  }

  private async persistRun(state: NexFlowState, record: RunRecord) {
    const normalized = this.normalizeRun(record);
    const flowId = normalized.flowId;
    if (!state.history[flowId]) {
      state.history[flowId] = [];
    }
    state.history[flowId].unshift(normalized);
    state.history[flowId] = state.history[flowId].slice(0, 50);

    const flow = state.flows[flowId];
    if (flow) {
      state.flows[record.flowId] = {
        ...flow,
        lastRunAt: normalized.finishedAt
      };
    }

    await this.saveState(state);
  }

  private async migrateLegacyState(state: NexFlowState): Promise<NexFlowState> {
    let mutated = false;
    const flows: Record<string, FlowRecord> = {};
    const history: Record<string, RunRecord[]> = {};

    for (const stored of Object.values(state.flows)) {
      if ((stored as FlowRecord).id) {
        const flow = this.withDefaults(stored as FlowRecord);
        flows[flow.id] = flow;
        history[flow.id] = (state.history[flow.id] || state.history[flow.name] || []).map(
          (run) => this.normalizeRun({
            ...run,
            id: run.id ?? crypto.randomUUID(),
            flowId: run.flowId ?? flow.id
          })
        );
        continue;
      }

      mutated = true;
      const flowConfig = stored as FlowConfig;
      const id = generateFlowId(flowConfig.name);
      const now = new Date().toISOString();
      const newRecord: FlowRecord = {
        ...flowConfig,
        id,
        createdAt: now,
        updatedAt: now
      };
      flows[id] = this.withDefaults(newRecord);
      history[id] = (state.history[flowConfig.name] || []).map((run) =>
        this.normalizeRun({
          ...run,
          id: run.id ?? crypto.randomUUID(),
          flowId: id
        })
      );
    }

    if (mutated) {
      const nextState: NexFlowState = { flows, history };
      await this.saveState(nextState);
      return nextState;
    }

    return state;
  }
  private withDefaults(flow: FlowRecord): FlowRecord {
    return {
      ...flow,
      enabled: flow.enabled ?? true
    };
  }

  private normalizeRun(run: RunRecord): RunRecord {
    return {
      ...run,
      trigger: run.trigger ?? "manual"
    };
  }
}

