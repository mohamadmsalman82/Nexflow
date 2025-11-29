import React, { useEffect, useRef, useState } from "react";
import type { ChatMessage, FlowRecord } from "../app";

interface FlowCoachProps {
  flow: FlowRecord | null;
  flowKey: string;
  messages: ChatMessage[];
  seedMessages: ChatMessage[];
  onMessagesChange: (key: string, messages: ChatMessage[]) => void;
}

const API_ENDPOINT = "/api/chat";

export const FlowCoach: React.FC<FlowCoachProps> = ({
  flow,
  flowKey,
  messages,
  seedMessages,
  onMessagesChange
}) => {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;

    const hasOverflow = thread.scrollHeight > thread.clientHeight;
    if (!hasOverflow) {
      thread.scrollTop = 0;
      return;
    }

    const distanceFromBottom = thread.scrollHeight - thread.clientHeight - thread.scrollTop;
    const isNearBottom = distanceFromBottom < 60;

    if (isNearBottom) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    setError(null);
    setInput("");
  }, [flowKey]);

  const placeholder = flow
    ? `Ask how to adjust “${flow.name}” using the Flow Editor fields on the left...`
    : "Ask how to start a new flow using the Flow Editor on the left...";

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setInput("");
    setError(null);
    setSending(true);

    const prior = messages;
    const optimistic: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    onMessagesChange(flowKey, optimistic);

    try {
      const resp = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: flow?.id,
          messages: optimistic
        })
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Chat request failed");
      }

      const data = (await resp.json()) as { reply: string };
      onMessagesChange(flowKey, [
        ...optimistic,
        { role: "assistant", content: data.reply }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach Flow Coach.");
      onMessagesChange(flowKey, prior);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function handleReset() {
    onMessagesChange(flowKey, [...seedMessages]);
    setError(null);
  }

  const safeMessages = messages.length ? messages : seedMessages;

  function renderContent(content: string) {
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const bolded = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const withBreaks = bolded
      .replace(/\n{2,}/g, "<br><br>")
      .replace(/\n/g, "<br>");

    return { __html: withBreaks };
  }

  return (
    <div className="pane coach-pane">
      <div className="pane-header">
        <div>
          <p className="eyebrow">AI Flow Coach</p>
          <h2>{flow ? `Working on “${flow.name}”` : "Need a second brain?"}</h2>
          <p className="muted">
            Ask for advice on cron expressions, branching logic, error handling, or notification
            strategy. The coach responds with natural language tips only.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" type="button" onClick={handleReset} disabled={sending}>
            Reset chat
          </button>
        </div>
      </div>

      <div className="chat-thread" ref={threadRef}>
        {safeMessages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
            <div className="chat-role">{message.role === "assistant" ? "Coach" : "You"}</div>
            <p dangerouslySetInnerHTML={renderContent(message.content)} />
          </div>
        ))}
      </div>

      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          disabled={sending}
        />
        <div className="chat-actions">
          {error && <span className="chat-error">{error}</span>}
          <button type="submit" disabled={sending || !input.trim()}>
            {sending ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
};
