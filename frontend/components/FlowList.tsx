import React from "react";
import type { FlowRecord } from "../app";

interface FlowListProps {
  flows: FlowRecord[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  runningId: string | null;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}

export const FlowList: React.FC<FlowListProps> = ({
  flows,
  loading,
  selectedId,
  onSelect,
  onRefresh,
  onDelete,
  onRun,
  runningId,
  onToggleEnabled
}) => {
  return (
    <div className="pane list-pane">
      <header className="pane-header">
        <div>
          <p className="eyebrow">Automation library</p>
          <h2>Your flows</h2>
        </div>
        <div className="hero-actions">
          <button className="subtle" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>
      {flows.length === 0 && (
        <p className="hint">No flows yet — create one to get started.</p>
      )}
      <ul className="flow-list">
        {flows.map((flow) => (
          <li
            key={flow.id}
            className={`${flow.id === selectedId ? "selected" : ""} ${
              flow.enabled ? "" : "disabled"
            }`}
            onClick={() => onSelect(flow.id)}
          >
            <div className="flow-info">
            <div className="flow-title">
              <span>{flow.name}</span>
              <span className="badge muted">
                {flow.lastRunAt
                  ? `Last run ${new Date(flow.lastRunAt).toLocaleTimeString()}`
                  : "Never run"}
              </span>
            </div>
              <p>{flow.schedule}</p>
            </div>
            <div className="flow-actions">
              <label
                className={`flow-toggle ${flow.enabled ? "on" : "off"}`}
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={flow.enabled !== false}
                  onChange={(event) => {
                    event.stopPropagation();
                    onToggleEnabled(flow.id, event.currentTarget.checked);
                  }}
                />
                <span>{flow.enabled ? "On" : "Off"}</span>
              </label>
              <button
                type="button"
                className="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  onRun(flow.id);
                }}
                disabled={runningId === flow.id}
              >
                {runningId === flow.id ? "Running…" : "Run now"}
              </button>
              <button
                type="button"
                className="ghost danger"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(flow.id);
                }}
                title="Delete flow"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

