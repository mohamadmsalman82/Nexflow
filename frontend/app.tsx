import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CreateFlow } from "./components/CreateFlow";
import { FlowList } from "./components/FlowList";
import { FlowDetail } from "./components/FlowDetail";
import { FlowCoach } from "./components/FlowCoach";
import "./styles.css";

const API_BASE = "/api";

export type NotifyMethod = "slack" | "discord" | "teams" | "webhook";

export type Step =
  | { 
      type: "fetch"; 
      id: string; 
      url: string; 
      timeout_ms?: number;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      headers?: Record<string, string>;
      body?: string;
    }
  | { type: "delay"; duration: string }
  | { type: "log"; message: string; include?: string[] }
  | {
      type: "notify";
      method: NotifyMethod;
      url: string;
      message?: string;
      rawPayload?: string;
      include?: string[];
    }
  | {
      type: "condition";
      input: string;
      operator: "=" | "!=" | "<" | ">" | "<=" | ">=";
      value: string | number;
    }
  | {
      type: "logic";
      logic: "AND" | "OR";
      conditions: {
        input: string;
        operator: "=" | "!=" | "<" | ">" | "<=" | ">=";
        value: string | number;
      }[];
    };

export interface FlowRecord {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  steps: Step[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
}

export interface RunRecord {
  id: string;
  flowId: string;
  name: string;
  status: "success" | "failure";
  trigger: "manual" | "cron";
  startedAt: string;
  finishedAt: string;
  logs: string[];
  steps: Array<{
    stepId: string;
    output?: unknown;
    error?: string;
    timestamp: string;
  }>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type ApiMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

const normalizeFlow = (flow: FlowRecord): FlowRecord => ({
  ...flow,
  enabled: flow.enabled ?? true
});

const App: React.FC = () => {
  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<FlowRecord | null>(null);
  const [logs, setLogs] = useState<RunRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [coachChats, setCoachChats] = useState<Record<string, ChatMessage[]>>({});
  const [editingFlow, setEditingFlow] = useState<FlowRecord | null>(null);

  const highlightedFlow = useMemo(() => {
    if (!selectedId) return null;
    return flows.find((flow) => flow.id === selectedId) ?? selectedFlow;
  }, [flows, selectedId, selectedFlow]);

  const flowKey = highlightedFlow?.id ?? "no-flow";
  const seedCoachMessages = useMemo(() => getCoachSeed(highlightedFlow), [highlightedFlow]);
  const coachMessages = coachChats[flowKey] ?? seedCoachMessages;

  useEffect(() => {
    void refreshFlows();
  }, []);

  async function apiFetch<T>(
    path: string,
    method: ApiMethod,
    body?: unknown
  ): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `Request failed (${resp.status})`);
    }
    if (resp.status === 204) {
      return undefined as T;
    }
    return (await resp.json()) as T;
  }

  async function refreshFlows() {
    try {
      setLoadingFlows(true);
      const list = await apiFetch<FlowRecord[]>("/flows", "GET");
      setFlows(list.map(normalizeFlow));
      if (!selectedId && list.length) {
        await selectFlow(list[0].id);
      } else if (selectedId) {
        const refreshed = list.find((f) => f.id === selectedId);
        if (refreshed) {
          setSelectedFlow(normalizeFlow(refreshed));
        }
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load flows");
    } finally {
      setLoadingFlows(false);
    }
  }

  async function selectFlow(id: string) {
    try {
      setStatus(null);
      setEditingFlow(null);
      setSelectedId(id);
      const flow = await apiFetch<FlowRecord>(`/flows/${id}`, "GET");
      setSelectedFlow(normalizeFlow(flow));
      await loadLogs(id);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to fetch flow");
    }
  }

  async function loadLogs(id: string) {
    try {
      const data = await apiFetch<RunRecord[]>(`/flows/${id}/logs`, "GET");
      setLogs(data);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load logs");
    }
  }

  async function deleteFlow(id: string) {
    try {
      await apiFetch<void>(`/flows/${id}`, "DELETE");
      setStatus("Flow deleted");
      setSelectedFlow(null);
      setSelectedId(null);
      setEditingFlow(null);
      setLogs([]);
      await refreshFlows();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to delete flow");
    }
  }

  async function toggleFlow(id: string, enabled: boolean) {
    try {
      const updated = normalizeFlow(
        await apiFetch<FlowRecord>(`/flows/${id}/enabled`, "PATCH", {
          enabled
        })
      );
      setFlows((prev) =>
        prev.map((flow) => (flow.id === id ? updated : flow))
      );
      if (selectedFlow?.id === id) {
        setSelectedFlow(updated);
      }
      setStatus(`Flow "${updated.name}" ${enabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update flow");
    }
  }

  async function runFlow(id: string) {
    try {
      setRunningId(id);
      const run = await apiFetch<RunRecord>(`/flows/${id}/run`, "POST");
      setStatus(`Run complete: ${run.status.toUpperCase()}`);
      await loadLogs(id);
      await refreshFlows();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to run flow");
    } finally {
      setRunningId(null);
    }
  }

  function handleCoachMessagesChange(key: string, updated: ChatMessage[]) {
    setCoachChats((prev) => ({
      ...prev,
      [key]: updated
    }));
  }

  function handleFlowUpdated(flow: FlowRecord) {
    const normalized = normalizeFlow(flow);
    setFlows((prev) => prev.map((f) => (f.id === normalized.id ? normalized : f)));
    if (selectedId === normalized.id) {
      setSelectedFlow(normalized);
    }
    setStatus(`Flow "${normalized.name}" updated`);
    setEditingFlow(null);
  }

  return (
    <div className="app-shell">
      <div className="glow" />
      <div className="app">
        <header className="hero">
          <div>
            <p className="eyebrow">NexFlow AI</p>
            <h1>Natural-language automations, verified.</h1>
            <p className="lead">
              Compile ideas into Cloudflare Workers workflows, run them instantly,
              and monitor execution history in one place.
            </p>
          </div>
          <div className="hero-meta">
            <div>
              <span>Flows</span>
              <strong>{flows.length}</strong>
            </div>
            <div>
              <span>Runs today</span>
              <strong>{logs.filter((log) => log.status === "success").length}</strong>
            </div>
          </div>
        </header>

        {status && <div className="status-toast">{status}</div>}

        <section className="layout-grid">
          <CreateFlow
            onFlowCreated={async (flow) => {
              setStatus(`Flow "${flow.name}" created`);
              await refreshFlows();
            }}
            flowToEdit={editingFlow}
            onFlowUpdated={handleFlowUpdated}
            onCancelEdit={() => setEditingFlow(null)}
          />
          <FlowList
            flows={flows}
            loading={loadingFlows}
            selectedId={selectedId}
            onSelect={selectFlow}
            onRefresh={refreshFlows}
            onDelete={deleteFlow}
            onRun={runFlow}
            runningId={runningId}
            onToggleEnabled={toggleFlow}
          />
          <FlowDetail
            flow={highlightedFlow}
            logs={logs}
            onRun={() => highlightedFlow && runFlow(highlightedFlow.id)}
            running={runningId === highlightedFlow?.id}
            onRefreshLogs={() => highlightedFlow && loadLogs(highlightedFlow.id)}
            onEdit={(flow) => setEditingFlow(flow)}
          />
          <FlowCoach
            flow={highlightedFlow}
            flowKey={flowKey}
            messages={coachMessages}
            seedMessages={seedCoachMessages}
            onMessagesChange={handleCoachMessagesChange}
          />
        </section>
      </div>
    </div>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}

function getCoachSeed(flow: FlowRecord | null): ChatMessage[] {
  if (flow) {
    return [
      {
        role: "assistant",
        content:
          `You’re editing “${flow.name}”. Ask me what to change in the left Flow Editor panel ` +
          "(Flow Name, Schedule, or Steps) and I’ll point you to the exact controls."
      }
    ];
  }

  return [
    {
      role: "assistant",
      content:
        "Hi! I’m the AI Flow Coach. Describe the automation you want, and I’ll tell you which fields to edit on the left (Flow Name, Schedule (cron), Steps) before you click + Insert."
    }
  ];
}
