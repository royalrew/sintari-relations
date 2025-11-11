"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { facetsKey, cooldownActive } from "@/lib/memory/need_more_ctx_util";

export type NeedMoreContextProps = {
  subjectId: string | null;
  honestyActive: boolean;
  missingFacets?: string[];
  onSaved?: () => void;
  cooldownMs?: number;
};

const STORAGE_PREFIX = "nmctx_last_";

export function NeedMoreContextChip({
  subjectId,
  honestyActive,
  missingFacets = [],
  onSaved,
  cooldownMs = 10 * 60 * 1000,
}: NeedMoreContextProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const key = useMemo(() => facetsKey(subjectId, missingFacets), [subjectId, missingFacets]);
  const storageKey = `${STORAGE_PREFIX}${key}`;

  useEffect(() => {
    if (!honestyActive) return;
    let active = true;
    const now = Date.now();
    const raw = sessionStorage.getItem(storageKey);
    const last = raw ? Number(raw) : null;
    const localSuppressed = cooldownActive(now, last, cooldownMs);
    if (localSuppressed) {
      setSuppressed(true);
      return;
    }

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/honesty/cooldown/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, ttlMs: cooldownMs }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!active) return;
        if (data?.suppressed) {
          setSuppressed(true);
          return;
        }
        setSuppressed(false);
        try {
          fetch("/api/telemetry/honesty_repair", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "shown",
              subject_id: subjectId,
              missing_facets: missingFacets,
              ts: now,
            }),
          });
          sessionStorage.setItem(storageKey, String(now));
        } catch {
          // ignore telemetry errors
        }
      } catch {
        if (!active) return;
        setSuppressed(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [honestyActive, storageKey, key, subjectId, missingFacets, cooldownMs]);

  useEffect(() => {
    if (honestyActive && !suppressed && !open) {
      setOpen(true);
    }
  }, [honestyActive, suppressed, open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => textareaRef.current?.focus(), 10);
    return () => clearTimeout(timer);
  }, [open]);

  if (!honestyActive || suppressed) return null;

  const hint =
    missingFacets.length > 0
      ? `Saknas: ${missingFacets.slice(0, 3).join(", ")}${missingFacets.length > 3 ? "…" : ""}`
      : "Saknar ett fakta för att ge råd.";

  async function saveWithRetry(payload: Record<string, unknown>) {
    const attempt = async () =>
      fetch("/api/memory/repair/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    let res = await attempt();
    if (!res.ok) {
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.floor(Math.random() * 450)));
      res = await attempt();
    }
    return res;
  }

  async function clearServerTtl() {
    try {
      await fetch("/api/honesty/cooldown/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
    } catch {
      // ignore
    }
  }

  async function save() {
    if (saving) return;
    if (!subjectId) {
      setError("Välj/identifiera vem det gäller först.");
      return;
    }
    if (!text.trim()) {
      setError("Beskriv vad som saknas.");
      return;
    }

    const now = Date.now();
    const lastShownRaw = sessionStorage.getItem(storageKey);
    const lastShown = lastShownRaw ? Number(lastShownRaw) : null;
    const duration = lastShown ? Math.max(0, now - lastShown) : null;
    const whenTs = when ? Date.parse(when) : null;

    try {
      setSaving(true);
      setError(null);
      setOpen(false);

      const res = await saveWithRetry({
        subject_id: subjectId,
        text: text.trim(),
        when_ts: Number.isFinite(whenTs) ? whenTs : null,
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }

      try {
        fetch("/api/telemetry/honesty_repair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "completed",
            subject_id: subjectId,
            missing_facets: missingFacets,
            ts: now,
            duration_ms: duration ?? undefined,
          }),
        });
      } catch {
        // ignore telemetry errors
      }

      sessionStorage.removeItem(storageKey);
      await clearServerTtl();

      setText("");
      setWhen("");
      window.dispatchEvent(new CustomEvent("repair:saved"));
      onSaved?.();
    } catch (err: any) {
      setOpen(true);
      setError(err?.message ?? "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-2xl border px-3 py-1 text-xs hover:shadow"
        onClick={() => setOpen((prev) => !prev)}
        title={hint}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        Behöver mer underlag
      </button>

      {open && (
        <Card className="space-y-2 p-3">
          <div className="text-xs text-muted-foreground">{hint}</div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Vad hände?</label>
            <textarea
              ref={textareaRef}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded border p-2 text-sm"
              placeholder="Kort faktameningen som saknades…"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">När? (valfritt)</label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Stäng
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !text.trim() || !subjectId}>
              {saving ? "Sparar…" : "Spara faktum (⌘/Ctrl+Enter)"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

