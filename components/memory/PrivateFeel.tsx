import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PrivateFeelProps = {
  subjectId: string;
};

type FeelResponse =
  | {
      subject_id: string;
      value: number;
      updated_ts: string;
    }
  | {
      subject_id: string;
      value: null;
      updated_ts: null;
    };

function clampValue(value: number) {
  if (Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function formatRelativeTime(iso: string | null) {
  if (!iso) return "Inte satt ännu";
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "Okänd tid";

  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "Just nu";
  if (diffSec < 60) return `${diffSec}s sedan`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m sedan`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h sedan`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d sedan`;
  return new Date(timestamp).toLocaleString();
}

export function PrivateFeel({ subjectId }: PrivateFeelProps) {
  const [value, setValue] = useState<number | null>(null);
  const [serverValue, setServerValue] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/memory/feel/${subjectId}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data: FeelResponse = await res.json();
      if (data.value == null) {
        setValue(null);
        setServerValue(null);
        setUpdatedAt(null);
      } else {
        const clamped = clampValue(data.value);
        setValue(clamped);
        setServerValue(clamped);
        setUpdatedAt(data.updated_ts);
      }
    } catch (err: any) {
      setError(err?.message ?? "Kunde inte läsa hjärtan.");
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function commit(next: number) {
    const clamped = clampValue(next);
    if (clamped === serverValue && !error) {
      setValue(clamped);
      return;
    }
    const previousValue = serverValue;
    const previousUpdated = updatedAt;
    setValue(clamped);
    setServerValue(clamped);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/feel/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_id: subjectId, value: clamped }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { value: number; updated_ts: string };
      setServerValue(clampValue(data.value));
      setValue(clampValue(data.value));
      setUpdatedAt(data.updated_ts);
    } catch (err: any) {
      setServerValue(previousValue);
      setValue(previousValue);
      setUpdatedAt(previousUpdated);
      setError(err?.message ?? "Kunde inte spara hjärtan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (serverValue == null) return;
    const previousValue = serverValue;
    const previousUpdated = updatedAt;
    setValue(null);
    setServerValue(null);
    setUpdatedAt(null);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/memory/feel/${subjectId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setServerValue(null);
      setValue(null);
      setUpdatedAt(null);
    } catch (err: any) {
      setServerValue(previousValue);
      setValue(previousValue);
      setUpdatedAt(previousUpdated);
      setError(err?.message ?? "Kunde inte rensa hjärtan.");
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = useMemo(() => formatRelativeTime(updatedAt), [updatedAt]);
  const displayValue = value ?? 3;

  return (
    <Card className="space-y-3 rounded-2xl border p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase text-muted-foreground">Privat känsla</div>
      <div className="text-[11px] text-muted-foreground">
        Sätt 1–5 hjärtan (privat – aldrig i export).
      </div>
      <div className="flex items-center gap-3">
        <span className="w-4 text-center text-xs">1</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={displayValue}
          disabled={loading || saving}
          onChange={(e) => setValue(Number(e.target.value))}
          onMouseUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => commit(Number((e.target as HTMLInputElement).value))}
          className="flex-1"
        />
        <span className="w-4 text-center text-xs">5</span>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((option) => (
          <Button
            key={option}
            size="sm"
            variant={displayValue === option ? "default" : "outline"}
            onClick={() => commit(option)}
            disabled={saving}
          >
            {option}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleClear}
          disabled={saving || serverValue == null}
          className="text-xs text-muted-foreground"
        >
          Rensa
        </Button>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Uppdaterad: {loading ? "—" : statusLabel}
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {error}
        </div>
      )}
    </Card>
  );
}

