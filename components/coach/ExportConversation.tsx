"use client";

import { useMemo, useState } from "react";

type Turn = { role: "user" | "coach"; text: string; ts?: number };

type Props = { threadId: string; conversation: Turn[] };

function formatExport(threadId: string, conversation: Turn[]) {
  const turnCount = conversation.length;
  const first = conversation[0]?.ts ?? Date.now();
  const last = conversation[turnCount - 1]?.ts ?? Date.now();
  const durationMs = Math.max(0, Number(last) - Number(first));
  return JSON.stringify(
    {
      threadId,
      timestamp: new Date().toISOString(),
      conversation,
      metadata: {
        turnCount,
        durationMs,
        durationHuman: `${Math.round(durationMs / 1000)}s`,
        version: "coach-export-v1",
      },
    },
    null,
    2
  );
}

export default function ExportConversation({ threadId, conversation }: Props) {
  const [open, setOpen] = useState(false);
  const payload = useMemo(() => formatExport(threadId, conversation), [threadId, conversation]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      alert("Konversationen kopierad till clipboard!");
    } catch {
      // Fallback om clipboard API inte fungerar
      const textarea = document.createElement("textarea");
      textarea.value = payload;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      alert("Konversationen kopierad till clipboard!");
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(s => !s)}
        className="text-sm underline text-gray-600 hover:text-gray-900"
      >
        📄 Exportera konversation (JSON)
      </button>
      {open && (
        <div className="mt-2 rounded-lg border p-2 bg-white">
          <textarea
            className="w-full h-48 font-mono text-xs bg-gray-50 p-2 rounded border"
            readOnly
            value={payload}
          />
          <div className="mt-2 flex gap-2">
            <button onClick={copy} className="px-3 py-1 text-sm rounded bg-black text-white hover:bg-gray-800">
              Kopiera
            </button>
            <button onClick={() => setOpen(false)} className="px-3 py-1 text-sm rounded border hover:bg-gray-50">
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

