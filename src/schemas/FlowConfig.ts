import { z } from "zod";

export const StepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fetch"),
    id: z.string().min(1, "FETCH steps require a unique id"),
    url: z.string(),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().default("GET"),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    timeout_ms: z.number().optional()
  }),

  z.object({
    type: z.literal("condition"),
    input: z.string(),
    operator: z.enum(["=", "!=", "<", ">", "<=", ">="]),
    value: z.union([z.string(), z.number()])
  }),

  z.object({
    type: z.literal("logic"),
    logic: z.enum(["AND", "OR"]),
    conditions: z.array(
      z.object({
        input: z.string(),
        operator: z.enum(["=", "!=", "<", ">", "<=", ">="]),
        value: z.union([z.string(), z.number()])
      })
    )
  }),

  z.object({
    type: z.literal("delay"),
    duration: z.string()
  }),

  z.object({
    type: z.literal("log"),
    message: z.string(),
    include: z.array(z.string()).optional()
  }),

  z.object({
    type: z.literal("notify"),
    method: z.enum(["slack", "discord", "teams", "webhook"]),
    url: z.string().url(),
    message: z.string().optional(),
    rawPayload: z.string().optional(),
    include: z.array(z.string()).optional()
  })
]);

const FlowConfigCoreSchema = z.object({
  name: z.string(),
  schedule: z.string(),
  enabled: z.boolean().default(true),
  steps: z.array(StepSchema)
});

function validateNotifySteps(
  steps: Array<z.infer<typeof StepSchema>>,
  ctx: z.RefinementCtx
) {
  const fetchIds = new Set<string>();
  steps.forEach((step, index) => {
    if (step.type === "fetch") {
      if (fetchIds.has(step.id)) {
        ctx.addIssue({
          path: ["steps", index, "id"],
          code: z.ZodIssueCode.custom,
          message: `Duplicate fetch id "${step.id}". Each fetch step must have a unique id.`
        });
      } else {
        fetchIds.add(step.id);
      }
    }

    if (step.type === "notify") {
      if (step.method === "webhook") {
        if (!step.rawPayload || !step.rawPayload.trim()) {
          ctx.addIssue({
            path: ["steps", index, "rawPayload"],
            code: z.ZodIssueCode.custom,
            message: "rawPayload is required for webhook notifications"
          });
        }
      } else if (!step.message || !step.message.trim()) {
        ctx.addIssue({
          path: ["steps", index, "message"],
          code: z.ZodIssueCode.custom,
          message: "message is required for slack, discord, and teams notifications"
        });
      }
    }
  });
}

export const FlowConfigSchema = FlowConfigCoreSchema.superRefine((config, ctx) =>
  validateNotifySteps(config.steps, ctx)
);

export const FlowRecordSchema = FlowConfigCoreSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRunAt: z.string().optional()
}).superRefine((config, ctx) => validateNotifySteps(config.steps, ctx));

export type Step = z.infer<typeof StepSchema>;
export type FlowConfig = z.infer<typeof FlowConfigSchema>;
export type FlowRecord = z.infer<typeof FlowRecordSchema>;
