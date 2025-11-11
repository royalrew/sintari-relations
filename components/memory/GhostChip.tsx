'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

type GhostChipProps = {
  text: string;
  activeSubjectId?: string;
  onPin?: (subjectId: string, prevPrimary?: string) => void;
  onAlias?: (subjectId: string, alias: string) => void;
};

type Status = { type: 'success' | 'error'; message: string } | null;

type UndoState = { subjectId: string; prevPrimary?: string } | null;

const NAME_REGEX = /[A-ZÅÄÖ][a-zåäö]+(?:-[A-ZÅÄÖ][a-zåäö]+)?/g;

type Chip = {
  name: string;
  occurrences: number;
};

function extractNames(text: string): Chip[] {
  const matches = text.match(NAME_REGEX) ?? [];
  const map = new Map<string, number>();
  for (const match of matches) {
    const normalized = match.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({
    name: capitalize(key),
    occurrences: count,
  }));
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function GhostChip({ text, activeSubjectId, onPin, onAlias }: GhostChipProps) {
  const chips = useMemo(() => extractNames(text), [text]);
  const [status, setStatus] = useState<Status>(null);
  const [undo, setUndo] = useState<UndoState>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function handlePin(name: string) {
    setPending(name + ':pin');
    setStatus(null);
    try {
      const res = await fetch('/api/memory/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subjectId: activeSubjectId }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { subjectId: string; prevPrimary?: string };
      setUndo(data.prevPrimary ? { subjectId: data.subjectId, prevPrimary: data.prevPrimary } : { subjectId: data.subjectId });
      setStatus({ type: 'success', message: `${name} pinnades som primary.` });
      onPin?.(data.subjectId, data.prevPrimary);
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message ?? 'Misslyckades med att pinna.' });
    } finally {
      setPending(null);
    }
  }

  async function handleAlias(name: string) {
    if (!activeSubjectId) return;
    const key = name + ':alias';
    setPending(key);
    setStatus(null);
    try {
      const res = await fetch('/api/memory/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: activeSubjectId, alias: name }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setStatus({ type: 'success', message: `${name} lades till som alias.` });
      onAlias?.(activeSubjectId, name);
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message ?? 'Misslyckades med att lägga alias.' });
    } finally {
      setPending(null);
    }
  }

  async function handleUndo() {
    if (!undo?.prevPrimary) {
      setUndo(null);
      setStatus(null);
      return;
    }
    setPending('undo');
    setStatus(null);
    try {
      const res = await fetch('/api/memory/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: undo.prevPrimary, subjectId: undo.subjectId }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { subjectId: string; prevPrimary?: string };
      setStatus({ type: 'success', message: `Återställde primary till ${undo.prevPrimary}.` });
      setUndo(data.prevPrimary ? { subjectId: data.subjectId, prevPrimary: data.prevPrimary } : null);
      onPin?.(data.subjectId, data.prevPrimary);
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message ?? 'Undo misslyckades.' });
    } finally {
      setPending(null);
    }
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <div key={chip.name} className="flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-sm">
            <div>
              <div className="text-sm font-semibold">{chip.name}</div>
              {chip.occurrences > 1 && (
                <div className="text-xs text-muted-foreground">{chip.occurrences} träffar</div>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={() => handlePin(chip.name)}
                disabled={pending !== null && pending !== `${chip.name}:pin`}
              >
                Pin
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAlias(chip.name)}
                disabled={!activeSubjectId || (pending !== null && pending !== `${chip.name}:alias`)}
              >
                Alias
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {undo?.prevPrimary && (
          <Button size="sm" variant="ghost" onClick={handleUndo} disabled={pending === 'undo'}>
            Undo primary
          </Button>
        )}
        {status && (
          <span
            className={`text-sm ${status.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
