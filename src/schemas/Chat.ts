import { z } from "zod";

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1)
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  flowId: z.string().min(1).optional(),
  messages: z.array(ChatMessageSchema).min(1)
});

export type ChatRequestBody = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  reply: z.string().min(1)
});

export type ChatResponseBody = z.infer<typeof ChatResponseSchema>;

