import type { Ai } from "@cloudflare/workers-types";
import { FlowConfig, FlowRecord } from "../schemas/FlowConfig";
import { RunRecord } from "../schemas/RunRecord";
import {
  ExecContext,
  ExecutionOutcome,
  StepExecutionResult,
  executeSteps
} from "./stepExecutor";

export interface NexFlowBindings {
  NEXFLOW_MANAGER: DurableObjectNamespace;
  NEXFLOW_ENGINE: Fetcher;
  AI: Ai;
  [key: string]: unknown;
}

export interface ManagerAPI {
  create(flow: FlowConfig): Promise<FlowRecord>;
  update(id: string, flow: FlowConfig): Promise<FlowRecord>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<FlowRecord>;
  list(): Promise<FlowRecord[]>;
  logs(id: string): Promise<RunRecord[]>;
  run(id: string, options?: RunOptions): Promise<RunRecord>;
  log(record: RunRecord): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<FlowRecord>;
}

export class DurableObjectError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function generateFlowId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function getManagerStub(env: NexFlowBindings): DurableObjectStub {
  return env.NEXFLOW_MANAGER.get(env.NEXFLOW_MANAGER.idFromName("nexflow"));
}

export function createManagerAPI(env: NexFlowBindings): ManagerAPI {
  const stub = getManagerStub(env);

  return {
    async create(flow) {
      return await fetchJSON(stub, "/flows", { method: "POST", body: flow });
    },
    async update(id, flow) {
      return await fetchJSON(stub, `/flows/${id}`, { method: "PUT", body: flow });
    },
    async delete(id) {
      await fetchJSON(stub, `/flows/${id}`, { method: "DELETE" });
    },
    async get(id) {
      return await fetchJSON(stub, `/flows/${id}`);
    },
    async list() {
      return await fetchJSON(stub, "/flows");
    },
    async logs(id) {
      return await fetchJSON(stub, `/flows/${id}/logs`);
    },
    async run(id, options) {
      return await fetchJSON(stub, `/flows/${id}/run`, {
        method: "POST",
        body: options ?? {}
      });
    },
    async log(record) {
      await fetchJSON(stub, "/runs", { method: "POST", body: record });
    },
    async setEnabled(id, enabled) {
      return await fetchJSON(stub, `/flows/${id}/enabled`, {
        method: "PATCH",
        body: { enabled }
      });
    }
  };
}

async function fetchJSON(
  stub: DurableObjectStub,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<any> {
  const method =
    init.method || (init.body !== undefined ? "POST" : "GET");

  const response = await stub.fetch(`https://nexflow-manager${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new DurableObjectError(
      response.status,
      text || `Durable Object error ${response.status}`
    );
  }

  if (response.status === 204) {
    return;
  }

  return response.json();
}

type RunOptions = {
  trigger?: "manual" | "cron";
};

export async function runFlowNow(
  flow: FlowRecord,
  env?: NexFlowBindings,
  options: RunOptions = {}
): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const execContext: ExecContext = { results: {}, logs: [] };
  let outcome: ExecutionOutcome;
  const trigger = options.trigger ?? "manual";
  execContext.logs.push(`[system] Triggered by ${trigger} at ${startedAt}`);
  console.log(
    `[runFlowNow] Starting flow ${flow.name} (${flow.id}) with ${flow.steps.length} step(s) at ${startedAt}`
  );

  try {
    outcome = await executeSteps(flow.steps, execContext, env);
  } catch (error) {
    outcome = {
      success: false,
      stepResults: [
        {
          stepId: "execution",
          error:
            error instanceof Error ? error.message : String(error ?? "Unknown"),
          timestamp: new Date().toISOString()
        } as StepExecutionResult
      ]
    };
    execContext.logs.push(
      error instanceof Error ? error.message : String(error ?? "Unknown")
    );
  }

  console.log(
    `[runFlowNow] Finished flow ${flow.name} (${flow.id}) with status ${outcome.success ? "success" : "failure"}`
  );

  return {
    id: crypto.randomUUID(),
    flowId: flow.id,
    name: flow.name,
    status: outcome.success ? "success" : "failure",
    trigger,
    startedAt,
    finishedAt: new Date().toISOString(),
    logs: execContext.logs,
    steps: outcome.stepResults,
    flow
  };
}

