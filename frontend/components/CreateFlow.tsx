import React, { useEffect, useMemo, useState } from "react";
import type { FlowRecord, Step, NotifyMethod } from "../app";

const API_BASE = "/api";

interface CreateFlowProps {
  onFlowCreated: (flow: FlowRecord) => void | Promise<void>;
  flowToEdit?: FlowRecord | null;
  onFlowUpdated?: (flow: FlowRecord) => void | Promise<void>;
  onCancelEdit?: () => void;
}

type StepForm = Step & { key: string };
type Operator = "=" | "!=" | "<" | ">" | "<=" | ">=";
const OPERATORS: Operator[] = ["=", "!=", "<", ">", "<=", ">="];

const makeKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const defaultStep = (type: Step["type"]): StepForm => {
  const key = makeKey();
  switch (type) {
    case "fetch":
      return { key, type, id: "", url: "", method: "GET" };
    case "delay":
      return { key, type, duration: "5m" };
    case "log":
      return { key, type, message: "Log message" };
    case "notify":
      return {
        key,
        type,
        method: "slack",
        url: "https://hooks.slack.com/services/...",
        message: "Notification message"
      };
    case "condition":
      return {
        key,
        type,
        input: "previous-step-id",
        operator: "=" as Operator,
        value: "ok"
      };
    case "logic":
      return {
        key,
        type,
        logic: "AND",
        conditions: [
          { input: "step-id", operator: "=" as Operator, value: "ok" },
          { input: "step-id", operator: "!=" as Operator, value: "error" }
        ]
      };
    default:
      return { key, type: "fetch", id: "", url: "" };
  }
};

export const CreateFlow: React.FC<CreateFlowProps> = ({
  onFlowCreated,
  flowToEdit = null,
  onFlowUpdated,
  onCancelEdit
}) => {
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 9 * * *");
  const [enabled, setEnabled] = useState(true);
  const [steps, setSteps] = useState<StepForm[]>([defaultStep("fetch")]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedType, setSelectedType] = useState<Step["type"]>("fetch");

  const editing = Boolean(flowToEdit);

  useEffect(() => {
    if (flowToEdit) {
      setName(flowToEdit.name);
      setSchedule(flowToEdit.schedule);
      setEnabled(flowToEdit.enabled ?? true);
      setSteps(
        flowToEdit.steps.map((step) => ({
          key: makeKey(),
          ...step
        }))
      );
      setStatus("Editing existing flow.");
    } else {
      setName("");
      setSchedule("0 9 * * *");
      setEnabled(true);
      setSteps([defaultStep("fetch")]);
      setStatus("");
    }
  }, [flowToEdit]);

  const payloadPreview = useMemo(
    () =>
      JSON.stringify(
        {
          name: name || "workflow-name",
          schedule: schedule || "0 9 * * *",
          steps: steps.map(({ key, ...rest }) => rest)
        },
        null,
        2
      ),
    [name, schedule, steps]
  );

  function updateStep(
    key: string,
    updater: (step: StepForm) => StepForm
  ): void {
    setSteps((prev) => prev.map((step) => (step.key === key ? updater(step) : step)));
  }

  function removeStep(key: string) {
    setSteps((prev) => (prev.length === 1 ? prev : prev.filter((s) => s.key !== key)));
  }

  async function saveFlow() {
    if (!name.trim() || !schedule.trim()) {
      setStatus("Name and schedule are required.");
      return;
    }
    if (!steps.length) {
      setStatus("Add at least one step.");
      return;
    }
    setBusy(true);
    setStatus(editing ? "Updating flow..." : "Saving flow...");
    try {
      const payload = {
        name: name.trim(),
        schedule: schedule.trim(),
        enabled,
        steps: steps.map(({ key, ...rest }) => rest)
      };
      const resp = await fetch(
        editing ? `${API_BASE}/flows/${flowToEdit?.id}` : `${API_BASE}/flows`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const flow = (await resp.json()) as FlowRecord;
      setStatus(editing ? `Flow “${flow.name}” updated.` : `Flow “${flow.name}” saved.`);
      setEnabled(true);
      if (editing && onFlowUpdated) {
        await onFlowUpdated(flow);
      } else {
        await onFlowCreated(flow);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function renderStepFields(step: StepForm) {
    switch (step.type) {
      case "fetch": {
        const fetchStep = step as Extract<StepForm, { type: "fetch" }>;
        return (
          <div className="step-grid">
            <label>
              Step ID
              <input
                value={fetchStep.id}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="analytics-fetch"
              />
            </label>
            <label>
              Method
              <select
                value={fetchStep.method || "GET"}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({ 
                    ...(prev as Extract<StepForm, { type: "fetch" }>), 
                    method: e.target.value as any 
                  }))
                }
              >
                {["GET", "POST", "PUT", "DELETE", "PATCH"].map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label>
              URL
              <input
                value={fetchStep.url}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder="https://api.example.com/data"
              />
            </label>
            <label>
              Timeout (ms)
              <input
                type="number"
                min={0}
                value={fetchStep.timeout_ms ?? ""}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({
                    ...prev,
                    timeout_ms: e.target.value ? Number(e.target.value) : undefined
                  }))
                }
                placeholder="optional"
              />
            </label>
            <label className="full-width">
              Body (JSON/Text)
              <textarea
                rows={2}
                value={fetchStep.body ?? ""}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({
                    ...(prev as Extract<StepForm, { type: "fetch" }>),
                    body: e.target.value
                  }))
                }
                placeholder='{"key": "value"}'
              />
            </label>
          </div>
        );
      }
      case "delay":
        return (
          <label>
            Duration
            <input
              value={step.duration}
              onChange={(e) =>
                updateStep(step.key, (prev) => ({ ...prev, duration: e.target.value }))
              }
              placeholder="5m, 30s, 1h"
            />
          </label>
        );
      case "log":
        return (
          <>
            <label>
              Message
              <input
                value={step.message}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({ ...prev, message: e.target.value }))
                }
              />
            </label>
            <label>
              Include keys (comma separated)
              <input
                value={(step.include || []).join(", ")}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({
                    ...prev,
                    include: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean)
                  }))
                }
                placeholder="fetch-weather, fetch-email"
              />
            </label>
          </>
        );
      case "notify": {
        const notifyStep = step as Extract<StepForm, { type: "notify" }>;
        const isWebhook = notifyStep.method === "webhook";
        return (
          <div className="step-grid">
            <label>
              Method
              <select
                value={notifyStep.method}
                onChange={(e) => {
                  const method = e.target.value as NotifyMethod;
                  updateStep(step.key, (prev) => ({
                    ...(prev as Extract<StepForm, { type: "notify" }>),
                    method,
                    message:
                      method === "webhook"
                        ? undefined
                        : (prev as Extract<StepForm, { type: "notify" }>).message ?? "",
                    rawPayload:
                      method === "webhook"
                        ? (prev as Extract<StepForm, { type: "notify" }>).rawPayload ?? '{\n  "foo": "bar"\n}'
                        : undefined
                  }));
                }}
              >
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="teams">Teams</option>
                <option value="webhook">Webhook (Generic)</option>
              </select>
            </label>
            <label>
              URL
              <input
                value={notifyStep.url}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({
                    ...(prev as Extract<StepForm, { type: "notify" }>),
                    url: e.target.value
                  }))
                }
              />
            </label>
            {!isWebhook && (
              <label>
                Message
                <input
                  value={notifyStep.message ?? ""}
                  onChange={(e) =>
                    updateStep(step.key, (prev) => ({
                      ...(prev as Extract<StepForm, { type: "notify" }>),
                      message: e.target.value
                    }))
                  }
                />
              </label>
            )}
            {isWebhook && (
              <label className="full-width">
                Raw JSON Payload
                <textarea
                  rows={4}
                  value={notifyStep.rawPayload ?? ""}
                  onChange={(e) =>
                    updateStep(step.key, (prev) => ({
                      ...(prev as Extract<StepForm, { type: "notify" }>),
                      rawPayload: e.target.value
                    }))
                  }
                  placeholder='{"foo":"bar"}'
                />
              </label>
            )}
          </div>
        );
      }
      case "condition": {
        const conditionStep = step as Extract<StepForm, { type: "condition" }>;
        return (
          <div className="step-grid">
            <label>
              Input
              <input
                value={conditionStep.input}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({
                    ...(prev as Extract<StepForm, { type: "condition" }>),
                    input: e.target.value
                  }))
                }
              />
            </label>
            <label>
              Operator
              <select
                value={conditionStep.operator}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({
                    ...(prev as Extract<StepForm, { type: "condition" }>),
                    operator: e.target.value as Operator
                  }))
                }
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input
                value={String(conditionStep.value)}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({
                    ...(prev as Extract<StepForm, { type: "condition" }>),
                    value: isNaN(Number(e.target.value))
                      ? e.target.value
                      : Number(e.target.value)
                  }))
                }
              />
            </label>
          </div>
        );
      }
      case "logic": {
        const logicStep = step as Extract<StepForm, { type: "logic" }>;
        return (
          <>
            <label>
              Mode
              <select
                value={logicStep.logic}
                onChange={(e) =>
                  updateStep(step.key, (prev) => ({
                    ...(prev as Extract<StepForm, { type: "logic" }>),
                    logic: e.target.value as "AND" | "OR"
                  }))
                }
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            </label>
            <div className="conditions">
              {logicStep.conditions.map((condition, idx) => (
                <div key={idx} className="condition-row">
                  <input
                    value={condition.input}
                    placeholder="input"
                    onChange={(e) =>
                      updateStep(step.key, (prev) => ({
                        ...(prev as Extract<StepForm, { type: "logic" }>),
                    conditions: (
                      prev as Extract<StepForm, { type: "logic" }>
                    ).conditions.map((cond, i) =>
                          i === idx ? { ...cond, input: e.target.value } : cond
                        )
                      }))
                    }
                  />
                  <select
                    value={condition.operator}
                    onChange={(e) =>
                      updateStep(step.key, (prev) => ({
                        ...(prev as Extract<StepForm, { type: "logic" }>),
                        conditions: (
                          prev as Extract<StepForm, { type: "logic" }>
                        ).conditions.map((cond, i) =>
                          i === idx
                            ? {
                                ...cond,
                                operator: e.target.value as Operator
                              }
                            : cond
                        )
                      }))
                    }
                  >
                    {OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  <input
                    value={String(condition.value)}
                    onChange={(e) =>
                      updateStep(step.key, (prev) => ({
                        ...(prev as Extract<StepForm, { type: "logic" }>),
                        conditions: (
                          prev as Extract<StepForm, { type: "logic" }>
                        ).conditions.map((cond, i) =>
                          i === idx
                            ? {
                                ...cond,
                                value: isNaN(Number(e.target.value))
                                  ? e.target.value
                                  : Number(e.target.value)
                              }
                            : cond
                        )
                      }))
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  updateStep(step.key, (prev) => ({
                    ...(prev as Extract<StepForm, { type: "logic" }>),
                    conditions: [
                      ...(prev as Extract<StepForm, { type: "logic" }>).conditions,
                      { input: "", operator: "=" as Operator, value: "" }
                    ]
                  }))
                }
              >
                + Condition
              </button>
            </div>
          </>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="pane">
      <div className="pane-header">
        <div>
          <p className="eyebrow">{editing ? "Edit flow" : "Create flow"}</p>
          <h2>{editing ? "Update workflow" : "Design a workflow"}</h2>
          <p className="muted">
            Configure schedules and steps manually. Use the AI Flow Coach chat for guidance
            when you need help planning logic, delays, or notifications.
          </p>
        </div>
        <div className="hero-actions">
          {editing && (
            <button type="button" className="ghost" onClick={onCancelEdit} disabled={busy}>
              Cancel edit
            </button>
          )}
          <button onClick={saveFlow} disabled={busy}>
            {editing ? "Save changes" : "Save Flow"}
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Flow name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer health check"
          />
        </label>
        <label>
          Cron schedule (UTC)
          <input
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="0 9 * * *"
          />
        </label>
        <label className="toggle-field">
          Enabled
          <div className={`flow-toggle ${enabled ? "on" : "off"}`}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.currentTarget.checked)}
            />
            <span>{enabled ? "On" : "Off"}</span>
          </div>
        </label>
      </div>

      <div className="step-toolbar">
        <div>
          <span className="muted">Add step</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as Step["type"])}
          >
            {["fetch", "delay", "condition", "logic", "log", "notify"].map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev, defaultStep(selectedType)])}
          >
            + Insert
          </button>
        </div>
        <small>{steps.length} step(s)</small>
      </div>

      <ol className="step-list">
        {steps.map((step, index) => (
          <li key={step.key} className="step-card">
            <header>
              <div className="pill">{step.type.toUpperCase()}</div>
              <div className="step-index">#{index + 1}</div>
              <button
                type="button"
                className="ghost"
                onClick={() => removeStep(step.key)}
                title="Remove step"
              >
                ✕
              </button>
            </header>
            <label className="type-select">
              Type
              <select
                value={step.type}
                onChange={(e) =>
                  updateStep(step.key, () => defaultStep(e.target.value as Step["type"]))
                }
              >
                {["fetch", "delay", "condition", "logic", "log", "notify"].map((type) => (
                  <option key={type} value={type}>
                    {type.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <div className="step-fields">{renderStepFields(step)}</div>
          </li>
        ))}
      </ol>

      <div className="code-preview">
        <div className="pill mono">FlowConfig preview</div>
        <pre>{payloadPreview}</pre>
      </div>

      {status && <p className="hint">{status}</p>}
    </div>
  );
};
