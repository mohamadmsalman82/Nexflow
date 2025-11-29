# Verification Guide

Run these steps before sharing the project with reviewers or recruiters.

1. **Type safety**
   - `npm run typecheck`
2. **Cron sanity**
   - `npm run cron:test`
3. **End-to-end smoke test**
   1. `npm run dev`
   2. Create or edit a flow from the left Flow Editor (Flow Name, Schedule (cron), Steps, “+ Insert”).
   3. Ask the AI Flow Coach how to modify that flow; ensure the reply references the Flow Editor controls explicitly.
   4. Click “Run now” in Flow Detail and confirm logs appear (success or failure).
   5. Leave the dev server running for ~1 minute and watch the terminal for `[NexFlowEngine]` logs indicating cron-triggered executions.

