import type { FlowRecord, Step } from "../schemas/FlowConfig";
import type { ChatMessage } from "../schemas/Chat";
import type { NexFlowBindings } from "./utils";
import { FLOW_COACH_PROMPT } from "../generated/prompts";
import { AI_MODEL_ID } from "../config/ai";


interface FlowCoachInput {
  env: NexFlowBindings;
  flow?: FlowRecord;
  messages: ChatMessage[];
}

export async function runFlowCoach({
  env,
  flow,
  messages
}: FlowCoachInput): Promise<ChatMessage> {
  if (!env.AI) {
    throw new Error("Workers AI binding (AI) is not configured.");
  }

  const systemContent = buildSystemPrompt(flow);
  const chatMessages = [
    { role: "system", content: systemContent },
    buildFlowContextMessage(flow),
    ...messages
  ].filter(Boolean) as ChatMessage[];

  try {
    const result = await env.AI.run(AI_MODEL_ID as any, {
      messages: chatMessages,
      temperature: 0.2,
      max_tokens: 400
    });

    const assistantText = extractResponseText(result).trim();
    if (!assistantText) {
      throw new Error("Flow Coach returned an empty response.");
    }

    return {
      role: "assistant",
      content: assistantText
    };
  } catch (error) {
    console.error("[FlowCoach] AI error", error);
    throw new Error(
      error instanceof Error ? error.message : "AI Flow Coach unavailable."
    );
  }
}

function buildSystemPrompt(flow?: FlowRecord): string {
  const header = FLOW_COACH_PROMPT.trim();
  if (!flow) {
    return `${header}\n\nThe user has not selected a flow yet. Help them outline goals, schedules, and steps before they configure anything.`;
  }

  const summaryLines = [
    `You are coaching a user editing the flow "${flow.name}".`,
    `Schedule: ${flow.schedule}`,
    "Current steps:"
  ];

  if (!flow.steps.length) {
    summaryLines.push("- (no steps yet)");
  } else {
    flow.steps.forEach((step, index) => {
      summaryLines.push(`- ${index + 1}. ${formatStep(step)}`);
    });
  }

  return `${header}\n\n${summaryLines.join("\n")}`;
}

function buildFlowContextMessage(flow?: FlowRecord): ChatMessage {
  if (flow) {
    const summary = JSON.stringify(
      {
        id: flow.id,
        name: flow.name,
        schedule: flow.schedule,
        steps: flow.steps
      },
      null,
      2
    );
    return {
      role: "user",
      content:
        "Read-only context: here is the current flow JSON. Do not output JSON; use this only to inform your guidance.\n" +
        summary
    };
  }

  return {
    role: "user",
    content:
      "No flow is selected yet. Help the user design a new automation using the left Flow Editor panel before any steps exist."
  };
}

function formatStep(step: Step): string {
  switch (step.type) {
    case "fetch":
      return `FETCH [${step.id}] ${step.method ?? "GET"} ${step.url}`;
    case "delay":
      return `DELAY ${step.duration}`;
    case "condition":
      return `CONDITION ${step.input} ${step.operator} ${String(step.value)}`;
    case "logic":
      return `LOGIC ${step.logic} (${step.conditions.length} conditions)`;
    case "log":
      return `LOG "${step.message}"`;
    case "notify":
      return `NOTIFY ${step.method.toUpperCase()} -> ${step.url}`;
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

function extractResponseText(result: any): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string") return result.response;

  if (Array.isArray(result.output)) {
    const textSegment = result.output.find(
      (item: any) => item.type === "text" && typeof item.text === "string"
    );
    if (textSegment) return textSegment.text;
  }

  if (Array.isArray(result.response)) {
    const textSegment = result.response.find(
      (item: any) => item.type === "output_text"
    );
    if (textSegment?.content) return textSegment.content;
  }

  return JSON.stringify(result);
}

