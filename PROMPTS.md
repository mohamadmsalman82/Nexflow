# NexFlow Prompt Pack

## flow-coach.txt

Purpose: guide the AI Flow Coach chat assistant so it provides natural-language advice while the user edits flows manually.

Highlights:

- Explains cron expressions, branching logic, logging, and notifications in prose.
- Explicitly forbids the model from emitting JSON, code, or FlowConfig objects.
- Encourages clarifying questions, safety callouts, and actionable next steps.
- Reminds the assistant to reference the currently selected flow summary when available.
- Backed by Workers AI model `@cf/meta/llama-3.1-8b-instruct` (configured in `src/config/ai.ts`).

