import React from "react";
import type { FlowRecord, RunRecord, Step } from "../app";

interface FlowDetailProps {
  flow: FlowRecord | null;
  logs: RunRecord[];
  onRun: () => void;
  running: boolean;
  onRefreshLogs: () => void;
  onEdit?: (flow: FlowRecord) => void;
}

export const FlowDetail: React.FC<FlowDetailProps> = ({
  flow,
  logs,
  onRun,
  running,
  onRefreshLogs,
  onEdit
}) => {
  if (!flow) {
    return (
      <div className="pane">
        <p className="eyebrow">Flow detail</p>
        <h2>Select a workflow</h2>
        <p className="hint">Choose a flow to explore steps and run history.</p>
      </div>
    );
  }

  const renderStep = (step: Step, index: number) => (
    <li key={`${step.type}-${index}`} className="step-card">
      <header>
        <div className="pill">{step.type.toUpperCase()}</div>
        <span className="step-index">#{index + 1}</span>
      </header>
      <pre>{JSON.stringify(step, null, 2)}</pre>
    </li>
  );

  return (
    <div className="pane detail-pane">
      <header className="pane-header">
        <div>
          <p className="eyebrow">Flow detail</p>
          <h2>{flow.name}</h2>
          <p className="muted">Schedule: {flow.schedule}</p>
          <p className={`muted ${flow.enabled ? "" : "disabled"}`}>
            Status: {flow.enabled ? "Enabled" : "Disabled"}
          </p>
        </div>
        <div className="hero-actions">
          <button className="subtle" onClick={onRefreshLogs}>
            Refresh logs
          </button>
          {onEdit && (
            <button className="ghost" type="button" onClick={() => onEdit(flow)}>
              Edit flow
            </button>
          )}
          <button onClick={onRun} disabled={running}>
            {running ? "Running…" : "Run now"}
          </button>
        </div>
      </header>

      <section>
        <header className="section-header">
          <h3>Steps</h3>
          <span className="muted">{flow.steps.length} total</span>
        </header>
        <ol className="step-list static">{flow.steps.map(renderStep)}</ol>
      </section>

      <section>
        <header className="section-header">
          <h3>Recent runs</h3>
          <span className="muted">{logs.length ? `${logs.length} entries` : "No runs yet"}</span>
        </header>
        {!logs.length && <p className="hint">No execution history has been recorded.</p>}

        {logs.length > 0 && (
          <details className="logs-accordion">
            <summary>Show recent runs ({logs.length})</summary>
            <ul className="timeline">
              {logs.map((log) => (
                <li key={log.id}>
                  <div className={`status-pill ${log.status}`}>
                    {log.status.toUpperCase()}
                  </div>
                  <div className="timeline-body">
                    <div className="timeline-meta">
                      <strong>{new Date(log.startedAt).toLocaleString()}</strong>
                      <span>→ {new Date(log.finishedAt).toLocaleTimeString()}</span>
                      <span className="muted">
                        Trigger: {(log.trigger || "manual").toUpperCase()}
                      </span>
                    </div>
                    
                    {log.steps && log.steps.length > 0 && (
                      <div className="steps-execution">
                         <h4>Step Results</h4>
                         {log.steps.map((stepResult, idx) => (
                            <div key={idx} className={`step-result ${stepResult.error ? 'error' : 'success'}`}>
                               <div className="step-result-header">
                                 <span className="step-id">{stepResult.stepId}</span>
                                 <span className="step-time">{new Date(stepResult.timestamp).toLocaleTimeString()}</span>
                               </div>
                               {stepResult.error ? (
                                  <div className="step-error">{stepResult.error}</div>
                               ) : (
                                  <details>
                                    <summary>Output</summary>
                                    <pre>{JSON.stringify(stepResult.output, null, 2)}</pre>
                                  </details>
                               )}
                            </div>
                         ))}
                      </div>
                    )}

                    {log.logs.length > 0 && (
                      <details>
                        <summary>Console Logs</summary>
                        <pre className="console-logs">
                            {log.logs.map((line, i) => (
                                <div key={i} className="log-line">{line}</div>
                            ))}
                        </pre>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
};
