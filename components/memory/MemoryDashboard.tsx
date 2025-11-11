'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GoalList } from '@/components/memory/GoalList';
import { PrivateFeel } from '@/components/memory/PrivateFeel';

type SubjectAlias = {
  value: string;
  added_ts: string;
};

type SubjectPayload = {
  subject_id: string;
  primary_name: string;
  pronouns?: string;
  trust_score?: number;
  last_seen_ts: string;
  aliases: SubjectAlias[];
};

type MemoryDashboardProps = {
  subjectId: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  recentQuotes?: string[];
  onAddGoal?: (subjectId: string) => void;
  authorEmail?: string;
  contextFacts?: string[];
};

type Status = { type: 'success' | 'error'; message: string } | null;

export default function MemoryDashboard({
  subjectId,
  open,
  onOpenChange,
  recentQuotes = [],
  onAddGoal,
  authorEmail,
  contextFacts,
}: MemoryDashboardProps) {
  const [subject, setSubject] = useState<SubjectPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasSubmitting, setAliasSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [goalFocusSignal, setGoalFocusSignal] = useState(0);

  useEffect(() => {
    if (!open) {
      setStatus(null);
      setError(null);
      setAliasInput('');
      return;
    }
    if (!subjectId) {
      setSubject(null);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/memory/subject/${subjectId}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = (await res.json()) as SubjectPayload;
        if (!cancelled) {
          setSubject(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Kunde inte läsa subject.');
          setSubject(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [subjectId, open]);

  const trustPercent = useMemo(() => {
    if (!subject?.trust_score && subject?.trust_score !== 0) return '—';
    return `${Math.round(subject.trust_score * 100)}%`;
  }, [subject?.trust_score]);

  const goalAuthor = authorEmail ?? 'coach@sintari.ai';
  const facts = contextFacts ?? recentQuotes;

  async function handleAliasSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aliasInput.trim() || !subject?.subject_id) {
      return;
    }
    setAliasSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch('/api/memory/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: subject.subject_id, alias: aliasInput.trim() }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setAliasInput('');
      setStatus({ type: 'success', message: 'Alias tillagt.' });
      // Refresh subject
      const updated = await fetch(`/api/memory/subject/${subject.subject_id}`);
      if (updated.ok) {
        setSubject((await updated.json()) as SubjectPayload);
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message ?? 'Misslyckades med att lägga alias.' });
    } finally {
      setAliasSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-40 flex"
    >
      <div
        className="fixed inset-0 bg-black/40"
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Memory Dashboard</h2>
            {subjectId ? (
              <p className="text-xs text-muted-foreground">Subject ID: {subjectId}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Ingen subject vald ännu</p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Laddar subject…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && subject && (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Översikt</h3>
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="text-base font-semibold">{subject.primary_name}</div>
                  {subject.pronouns && <div>Pronomen: {subject.pronouns}</div>}
                  <div>Trust score: {trustPercent}</div>
                  <div>Senast sedd: {new Date(subject.last_seen_ts).toLocaleString()}</div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Alias</h3>
                {subject.aliases.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Inga alias ännu.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {subject.aliases.map((alias) => (
                      <li key={`${alias.value}_${alias.added_ts}`} className="flex items-center justify-between rounded border px-3 py-1">
                        <span>{alias.value}</span>
                        <span className="text-xs text-muted-foreground">{new Date(alias.added_ts).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <form className="flex gap-2" onSubmit={handleAliasSubmit}>
                  <input
                    type="text"
                    className="flex-1 rounded border px-3 py-2 text-sm"
                    placeholder="Lägg till alias"
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    disabled={aliasSubmitting}
                  />
                  <Button size="sm" type="submit" disabled={aliasSubmitting || !aliasInput.trim()}>
                    Spara
                  </Button>
                </form>
                {status && (
                  <div className={`text-xs ${status.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{status.message}</div>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Senaste citat</h3>
                {recentQuotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Inga sparade citat ännu.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {recentQuotes.map((quote, idx) => (
                      <li key={idx} className="rounded border px-3 py-2">“{quote}”</li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <PrivateFeel subjectId={subject.subject_id} />
              </section>

              <GoalList subjectId={subject.subject_id} createdBy={goalAuthor} contextFacts={facts} focusSignal={goalFocusSignal} />
            </>
          )}
        </div>

        <footer className="border-t px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Stäng
            </Button>
            <Button
              size="sm"
              disabled={!subject?.subject_id}
              onClick={() => {
                if (!subject?.subject_id) return;
                onAddGoal?.(subject.subject_id);
                setGoalFocusSignal((v) => v + 1);
              }}
            >
              Lägg till mål
            </Button>
            <Button
              size="sm"
              disabled={!subject?.subject_id}
              onClick={() => {
                setGoalFocusSignal((v) => v + 1);
              }}
            >
              Nytt mål
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
