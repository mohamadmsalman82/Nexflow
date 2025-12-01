## Product & Architecture

“Design a Cloudflare Workers app that lets users create, edit, enable/disable, delete, and manually run cron-based workflows. Use Durable Objects for storage, Cloudflare Workflows for cron, and Workers AI for a UI-aware ‘Flow Coach’ chat. Describe the data model and APIs.”

“Define Zod schemas for FlowConfig (steps: fetch/delay/condition/logic/log/notify), FlowRecord (timestamps + lastRunAt), RunRecord (per-step outputs/errors).”

## Backend (Worker + DO + Workflow)

“Implement src/server.ts to serve SPA assets and REST endpoints: POST /api/chat, CRUD /api/flows, PATCH /api/flows/:id/enabled, POST /api/flows/:id/run, GET /api/flows/:id/logs. Include CORS and validation with Zod.”

“Implement a Durable Object NexFlowManager to persist flows and run history with CRUD, enable toggle, manual run, and history migration.”

“Implement a Workflow NexFlowEngine cron trigger (* * * * *) that lists flows, checks cron ‘due’ via cron-parser, runs due flows, and persists run records.”

“Implement step execution functions for fetch/condition/logic/delay/log/notify with short-circuit on false condition/logic, fetch timeouts, and notify payloads per channel.”

## AI Flow Coach

“Write a system prompt that is UI-aware: it references exact UI labels (Flow Name, Schedule (cron), Steps, + Insert) and never outputs code or JSON. Tone: concise, actionable.”

“Implement runFlowCoach that builds system prompt + flow JSON context as read-only, calls Workers AI @cf/meta/llama-3.1-8b-instruct, extracts text, and returns a chat message.”

## Frontend

“Build a React SPA with panels stacked: AI Flow Coach (top), Design a workflow (Flow editor), Your flows (list), Flow detail/logs. Use esbuild. Dark theme.”

“Create a Flow editor component: name, cron, enabled toggle, step builder with type switcher, live JSON preview, Save/Save changes, Cancel edit.”

“Create Flow list component: select, refresh, run, delete, toggle enabled.”

“Create Flow detail component: show steps, run history, per-step outputs/errors, console logs, and Edit flow button.”

“Create Flow Coach chat component: seeded messages per-flow, optimistic sends, auto-scroll, render bold as <strong>, preserve line breaks, Reset chat.”

“Add responsive styling: dark glassy panels, pills, chat bubbles, timeline logs.”

## Build & Embedding

“Add a script to embed frontend assets and prompt into src/generated/assets.ts and src/generated/prompts.ts (read index.html, dist/app.js, styles.css, flow-coach.txt).”

“Wire npm scripts: build:frontend (esbuild) + embed-assets, build, dev (wrangler), deploy, typecheck, cron:test.”

## Verification

“Provide a smoke test checklist: create/edit flow, run manually, see logs, coach references UI controls, cron triggers fire after 1 minute in dev.”
