import { z } from "zod";
import { FlowConfigSchema } from "./schemas/FlowConfig";
import { ChatRequestSchema } from "./schemas/Chat";
import { runFlowCoach } from "./lib/flowCoach";
import {
  createManagerAPI,
  DurableObjectError,
  NexFlowBindings
} from "./lib/utils";
import { ensureFlowScheduler } from "./lib/scheduler";
import { NexFlowManager } from "./durable/NexFlowManager";
import { NexFlowEngine } from "./workflows/NexFlowEngine";
import { INDEX_HTML, APP_JS, STYLES_CSS } from "./generated/assets";

export { NexFlowManager, NexFlowEngine };

const ToggleEnabledSchema = z.object({
  enabled: z.boolean()
});

export default {
  async fetch(request: Request, env: NexFlowBindings): Promise<Response> {
    ensureFlowScheduler(env);
    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const normalized = normalizePath(url.pathname);
    if (request.method === "GET" && (normalized === "/" || normalized === "/index.html")) {
      return serveRawAsset(INDEX_HTML, "text/html");
    }
    if (request.method === "GET" && normalized === "/app.js") {
      return serveRawAsset(APP_JS, "application/javascript");
    }
    if (request.method === "GET" && normalized === "/styles.css") {
      return serveRawAsset(STYLES_CSS, "text/css");
    }

    try {
      const url = new URL(request.url);
      const path = normalizePath(url.pathname);
      const method = request.method.toUpperCase();
      const manager = createManagerAPI(env);

      if (method === "POST" && path === "/api/chat") {
        const body = ChatRequestSchema.parse(await request.json());
        let flow;
        if (body.flowId) {
          try {
            flow = await manager.get(body.flowId);
          } catch (err) {
            if (err instanceof DurableObjectError && err.status === 404) {
              flow = undefined;
            } else {
              throw err;
            }
          }
        }
        const assistantMessage = await runFlowCoach({
          env,
          flow,
          messages: body.messages
        });
        return json({ reply: assistantMessage.content });
      }

      if (method === "POST" && path === "/api/flows") {
        const payload = FlowConfigSchema.parse(await request.json());
        const created = await manager.create(payload);
        return json(created, 201);
      }

      if (method === "GET" && path === "/api/flows") {
        const list = await manager.list();
        return json(list);
      }

      if (path.startsWith("/api/flows/")) {
        const remainder = path.replace("/api/flows/", "");
        const [rawId, subRoute] = remainder.split("/", 2);
        const id = decodeURIComponent(rawId);
        if (!id) {
          return error("Flow id required", 400);
        }

        if (!subRoute) {
          if (method === "GET") {
            const flow = await manager.get(id);
            return json(flow);
          }
          if (method === "PUT") {
            const payload = FlowConfigSchema.parse(await request.json());
            const updated = await manager.update(id, payload);
            return json(updated);
          }
          if (method === "DELETE") {
            await manager.delete(id);
            return corsResponse(new Response(null, { status: 204 }));
          }
        }

        if (subRoute === "enabled" && method === "PATCH") {
          const payload = ToggleEnabledSchema.parse(await request.json());
          const updated = await manager.setEnabled(id, payload.enabled);
          return json(updated);
        }

        if (subRoute === "logs" && method === "GET") {
          const logs = await manager.logs(id);
          return json(logs);
        }

        if (subRoute === "run" && method === "POST") {
          const record = await manager.run(id, { trigger: "manual" });
          return json(record);
        }
      }

      return error("Not found", 404);
    } catch (err) {
      console.error("[server] error", err);
      if (err instanceof z.ZodError) {
        return error(err.message, 400);
      }
      if (err instanceof DurableObjectError) {
        return error(err.message, err.status);
      }
      return error(err instanceof Error ? err.message : "Internal error", 500);
    }
  },

    // Scheduled handler for Cron Triggers
    async scheduled(event: any, env: NexFlowBindings, ctx: any): Promise<void> {
      console.log("[scheduler] Scheduled event fired at", new Date().toISOString());
  
      const manager = createManagerAPI(env);
  
      try {
        // Get all flows
        const flows = await manager.list();
        console.log(`[scheduler] Found ${flows.length} flows`);
  
        for (const flow of flows as any[]) {
          // If your flow objects have an `enabled` flag, respect it
          if (flow.enabled === false) {
            console.log(`[scheduler] Skipping disabled flow ${flow.id}`);
            continue;
          }
  
          console.log(`[scheduler] Running flow ${flow.id} via cron trigger`);
  
          // Run the flow, marking trigger type as "cron"
          ctx.waitUntil(
            manager
              .run(flow.id, { trigger: "cron" })
              .catch((err: any) => {
                console.error(`[scheduler] Error running flow ${flow.id}`, err);
              })
          );
        }
      } catch (err) {
        console.error("[scheduler] Failed to run scheduled flows", err);
      }
    }
  };

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
}

function json(data: unknown, status = 200): Response {
  return corsResponse(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function serveRawAsset(content: string, contentType: string): Response {
  const headers = new Headers({ "Content-Type": contentType });
  return corsResponse(
    new Response(content, {
      status: 200,
      headers
    })
  );
}
