import { z } from "zod";
import { FlowConfigSchema } from "./FlowConfig";

export const StepResultSchema = z.object({
  stepId: z.string(),
  output: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.string()
});

export const RunRecordSchema = z.object({
  id: z.string(),
  flowId: z.string(),
  name: z.string(),
  status: z.enum(["success", "failure"]),
  trigger: z.enum(["manual", "cron"]).default("manual"),
  startedAt: z.string(),
  finishedAt: z.string(),
  logs: z.array(z.string()),
  steps: z.array(StepResultSchema),
  flow: FlowConfigSchema
});

export type RunRecord = z.infer<typeof RunRecordSchema>;

