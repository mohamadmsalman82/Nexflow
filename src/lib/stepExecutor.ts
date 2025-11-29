import type { FlowConfig } from "../schemas/FlowConfig";
import { interpolateJsonPayload, interpolateTemplate } from "./template";

export interface ExecContext {
  results: Record<string, any>;
  logs: string[];
}

export interface StepExecutionResult {
  stepId: string;
  output?: any;
  error?: string;
  timestamp: string;
}

export interface ExecutionOutcome {
  success: boolean;
  stepResults: StepExecutionResult[];
}

type StepUnion = FlowConfig["steps"][number];

type ConditionRule = Pick<
  Extract<StepUnion, { type: "condition" }>,
  "input" | "operator" | "value"
>;

export async function executeSteps(
  steps: FlowConfig["steps"],
  context: ExecContext,
  _env?: unknown
): Promise<ExecutionOutcome> {
  const timestamp = () => new Date().toISOString();
  const results: StepExecutionResult[] = [];

  for (const step of steps) {
    try {
      let output: any;

      switch (step.type) {
        case "fetch":
          output = await executeFetch(step, context);
          break;
        case "condition":
          output = executeCondition(step, context);
          // Condition failure (false) should stop execution?
          // The prompt says "Control whether next steps execute".
          // If false, we should probably stop or skip?
          // Usually conditions returning false means "stop/skip subsequent steps".
          // We will assume it stops execution but considers it a "success" run (just halted).
          if (!output) {
             context.logs.push(`[condition:${step.input}] Evaluated false, stopping execution.`);
             results.push({ stepId: "condition", output: false, timestamp: timestamp() });
             return { success: true, stepResults: results };
          }
          break;
        case "logic":
          output = executeLogic(step, context);
          if (!output) {
             context.logs.push(`[logic] Evaluated false, stopping execution.`);
             results.push({ stepId: "logic", output: false, timestamp: timestamp() });
             return { success: true, stepResults: results };
          }
          break;
        case "delay":
          output = await executeDelay(step);
          break;
        case "log":
          output = executeLog(step, context);
          break;
        case "notify":
          output = await executeNotify(step, context);
          break;
        default:
          throw new Error(`Unsupported step type: ${(step as any).type}`);
      }

      if (step.type === "fetch") {
        context.results[step.id] = output;
      }

      const stepId = "id" in step ? (step as any).id : step.type;
      results.push({ stepId, output, timestamp: timestamp() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "Unknown");
      context.logs.push(`[${step.type}] Error: ${message}`);
      results.push({
        stepId: "id" in step ? (step as any).id : step.type,
        error: message,
        timestamp: timestamp()
      });
      // Step failure means workflow failure
      return { success: false, stepResults: results };
    }
  }

  return { success: true, stepResults: results };
}

export async function executeFetch(
  step: Extract<StepUnion, { type: "fetch" }>,
  context: ExecContext
): Promise<any> {
  const controller = step.timeout_ms
    ? new AbortController()
    : undefined;
  const timeout = step.timeout_ms
    ? setTimeout(() => controller?.abort(), step.timeout_ms)
    : undefined;

  try {
    const headers = new Headers(step.headers || {});
    if (step.body && !headers.has("Content-Type")) {
      // Auto-detect simple JSON
      if (step.body.trim().startsWith("{") || step.body.trim().startsWith("[")) {
        headers.set("Content-Type", "application/json");
      }
    }

    const resp = await fetch(step.url, {
      method: step.method || "GET",
      headers,
      body: step.body,
      signal: controller?.signal
    });

    const text = await resp.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    
    const headersObj: Record<string, string> = {};
    resp.headers.forEach((val, key) => { headersObj[key] = val; });

    const output = { status: resp.status, headers: headersObj, body: parsed };
    
    context.logs.push(`[fetch:${step.id}] ${step.method} ${step.url} -> ${resp.status}`);
    if (!resp.ok) {
       // We don't throw here, we let the user handle status codes or condition steps?
       // However, "fetch" step usually implies we expect success.
       // If 4xx/5xx, should we fail?
       // The prompt says "Return: status, headers, json/text" and "Show readable errors".
       // We'll return the object. If the user wants to fail on 404, they can add a condition step.
    }
    
    return output;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${step.timeout_ms}ms`);
    }
    throw err;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function executeCondition(
  step: Extract<StepUnion, { type: "condition" }>,
  context: ExecContext
): boolean {
  const result = evaluateRule(step, context);
  context.logs.push(`[condition] ${step.input} ${step.operator} ${step.value} -> ${result}`);
  return result;
}

export function executeLogic(
  step: Extract<StepUnion, { type: "logic" }>,
  context: ExecContext
): boolean {
  const evaluations = step.conditions.map((condition) =>
    evaluateRule(condition, context)
  );

  let result = false;
  if (step.logic === "AND") {
    result = evaluations.every(Boolean);
  } else {
    result = evaluations.some(Boolean);
  }

  context.logs.push(`[logic] ${step.conditions.length} conditions (${step.logic}) -> ${result}`);
  return result;
}

export async function executeDelay(
  step: Extract<StepUnion, { type: "delay" }>
): Promise<boolean> {
  const ms = parseDuration(step.duration);
  await new Promise((resolve) => setTimeout(resolve, ms));
  return true;
}

export function executeLog(
  step: Extract<StepUnion, { type: "log" }>,
  context: ExecContext
): boolean {
  const baseMessage = interpolateTemplate(step.message, context.results);
  const included = step.include?.reduce<Record<string, any>>(
    (acc, key) => {
      // Supports deep access like "stepId.body.field" ?
      // For now simple key access.
      acc[key] = context.results[key];
      return acc;
    },
    {}
  );
  const message = included && Object.keys(included).length > 0
    ? `${baseMessage} ${JSON.stringify(included)}`
    : baseMessage;
  context.logs.push(`[log] ${message}`);
  return true;
}

export async function executeNotify(
  step: Extract<StepUnion, { type: "notify" }>,
  context: ExecContext
): Promise<boolean> {
  let payload: unknown;
  const interpolatedMessage = interpolateTemplate(step.message ?? "", context.results);

  switch (step.method) {
    case "slack":
      payload = { text: interpolatedMessage };
      break;
    case "teams":
      payload = { text: interpolatedMessage };
      break;
    case "discord":
      payload = { content: interpolatedMessage };
      break;
    case "webhook":
      if (step.rawPayload) {
        try {
          const raw = interpolateJsonPayload(step.rawPayload, context.results);
          payload = JSON.parse(raw);
        } catch (error) {
          throw new Error(
            `Invalid webhook payload JSON: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      } else {
        // Fallback if validation missed it
        payload = { message: interpolatedMessage };
      }
      break;
    default:
      throw new Error(`Unknown notify method: ${(step as any).method}`);
  }

  const resp = await fetch(step.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  context.logs.push(
    `[notify:${step.method}] status=${resp.status}`
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notify request failed (${resp.status}): ${text.slice(0, 100)}`);
  }

  return true;
}

function parseDuration(duration: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format "${duration}"`);
  }

  const value = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    default:
      throw new Error(`Unsupported duration unit "${unit}"`);
  }
}

function evaluateRule(rule: ConditionRule, context: ExecContext): boolean {
  // Support retrieving deep values using dot notation (e.g. "fetch-id.body.status")
  const value = getDeepValue(context.results, rule.input);
  const target = rule.value;

  // Handle numeric comparisons safely
  const numValue = Number(value);
  const numTarget = Number(target);
  const isNumeric = !isNaN(numValue) && !isNaN(numTarget);

  switch (rule.operator) {
    case "=":
      return value == target; // Loose equality for string/number
    case "!=":
      return value != target;
    case "<":
      return isNumeric ? numValue < numTarget : String(value) < String(target);
    case ">":
      return isNumeric ? numValue > numTarget : String(value) > String(target);
    case "<=":
      return isNumeric ? numValue <= numTarget : String(value) <= String(target);
    case ">=":
      return isNumeric ? numValue >= numTarget : String(value) >= String(target);
    default:
      throw new Error(`Unknown operator: ${rule.operator}`);
  }
}

function getDeepValue(obj: any, path: string): any {
  if (!path) return undefined;
  const parts = path.split(".");
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}
