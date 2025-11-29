# cf_ai_nexflow

NexFlow AI is a Cloudflare Workers automation playground backed by Durable Objects, Cloudflare Workflows cron triggers, and a Workers AI “Flow Coach” that gives UI-aware instructions instead of generating code. The Flow Coach runs on `@cf/meta/llama-3.1-8b-instruct`, satisfying Cloudflare’s AI assignment requirements.

## Architecture

- **Cloudflare Worker (`src/server.ts`)** – Serves the React bundle, exposes `/api/flows`, `/api/chat`, `/api/flows/:id/run`, etc., and proxies AI calls to Workers AI.
- **Durable Object `NexFlowManager`** – Persists FlowConfig documents and run history with helper APIs (`create`, `update`, `logs`, `run`).
- **Cloudflare Workflows `NexFlowEngine`** – Cron trigger (`* * * * *`) that enumerates flows, evaluates their `schedule` via `cron-parser`, and executes due flows.
- **Workers AI Flow Coach (`src/lib/flowCoach.ts`)** – Builds a prompt describing the UI layout, injects the current flow JSON as read-only context, and returns natural-language, UI-aware guidance.
- **React Frontend (`frontend/`)** – Left panel Flow Editor (Flow Name, Schedule (cron), Steps, “+ Insert”), center panel flow list/detail, right panel AI Flow Coach chat.

## Environment & Bindings

Defined in `wrangler.jsonc`:

| Binding | Type | Purpose |
| --- | --- | --- |
| `AI` | Workers AI | Llama 3.1 8B Instruct (`@cf/meta/llama-3.1-8b-instruct`) |
| `NEXFLOW_MANAGER` | Durable Object | Flow + run storage |
| `NEXFLOW_ENGINE` | Workflow binding | Cron scheduler entrypoint |

## API Overview

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/chat` | Flow Coach chat (returns `{ reply }`) |
| `POST` | `/api/flows` | Create a flow |
| `GET` | `/api/flows` | List flows |
| `GET` | `/api/flows/:id` | Fetch a flow |
| `PUT` | `/api/flows/:id` | Update a flow |
| `DELETE` | `/api/flows/:id` | Delete a flow + logs |
| `POST` | `/api/flows/:id/run` | Execute immediately |
| `GET` | `/api/flows/:id/logs` | Retrieve run history |

## Frontend

`frontend/app.tsx` composes:

- **CreateFlow** – Manual Flow Name / Schedule / Steps editor with live JSON preview.
- **FlowList** – Select, refresh, run, and delete flows.
- **FlowDetail** – Shows step definitions plus per-step execution logs.
- **FlowCoach** – UI-aware chat that references the visible Flow Editor controls (“Flow Name”, “Schedule (cron)”, “Steps”, “+ Insert”, etc.).

Bundle via `npm run build:frontend` (esbuild) before serving or deploying.

### Message templating

`log` and `notify` steps can interpolate values from earlier fetch results using `${stepId.path}` placeholders:

```json
"message": "Current BTC price: ${btcPrice.body.price} USD"
```

The placeholder resolves against `context.results[stepId]`, so nested properties like `body.price` or `headers.content-type` are available. Missing paths render as `[missing path]` to keep runs stable. Webhook `rawPayload` strings are interpolated before JSON parsing as well.

See `examples/btc-flow.json` for a complete Binance BTC price flow that logs and notifies with live data.

## Prompts & AI Model

- Prompt source: `src/prompts/flow-coach.txt` → compiled to `src/generated/prompts.ts`.
- Model constant: `AI_MODEL_ID` in `src/config/ai.ts` (`@cf/meta/llama-3.1-8b-instruct`).
- `/api/chat` validates `ChatRequestBody`, loads the selected flow (if any), injects its JSON as context, and returns `{ reply }`.

## Local Development

```bash
npm install
npm run build:frontend   # bundle React & embed prompts/assets
npm run dev              # wrangler dev (Worker + DO + Workflows shim)
```

Helpful scripts:

| Command | Description |
| --- | --- |
| `npm run typecheck` | TypeScript project-wide check |
| `npm run build` | Rebuilds the frontend + embedded assets/prompts |
| `npm run cron:test` | Runs `scripts/simulate-cron.ts` to sanity-check cron parsing |
| `npm run test:templates` | Runs template interpolation smoke tests |
| `npm run deploy` | Deploy via Wrangler |

## Testing & Verification

1. `npm run typecheck`
2. `npm run cron:test`
3. Manual smoke test:
   - Run `npm run dev`.
   - Create or edit a flow (Flow Name, Schedule (cron), Steps).
   - Ask the Flow Coach for help; responses should reference the Flow Editor controls explicitly.
   - Hit “Run now” and confirm logs appear in Flow Detail.
   - Observe `[NexFlowEngine]` logs showing cron-triggered executions (leave dev server running for ~1 minute).
