import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type GoalModel = {
  goal_id: string;
  subject_id: string;
  goal_text: string;
  progress: number;
  cadence: "daily" | "weekly" | "biweekly" | "monthly";
  due_ts?: string;
  owner?: string;
  blockers: string[];
  valence: string;
  constraints?: Record<string, string | number | boolean>;
  created_by: string;
  created_ts: string;
  updated_ts: string;
  archived: boolean;
};

type GoalCardProps = {
  goal: GoalModel;
  onUpdate(goalId: string, patch: GoalPatch): Promise<void> | void;
  onArchive(goalId: string): Promise<void> | void;
  onCoach?(goal: GoalModel): void;
  disabled?: boolean;
};

export type GoalPatch = {
  goal_text?: string;
  progress?: number;
  constraints?: Record<string, string | number | boolean>;
  cadence?: "daily" | "weekly" | "biweekly" | "monthly";
  due_ts?: string | null;
  owner?: string | null;
  blockers?: string[];
};

export function GoalCard({ goal, onUpdate, onArchive, onCoach, disabled }: GoalCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal.goal_text);
  const [progressPercent, setProgressPercent] = useState(() => Math.round(goal.progress * 100));
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cadence, setCadence] = useState<GoalModel["cadence"]>(goal.cadence ?? "weekly");
  const [dueInput, setDueInput] = useState(goal.due_ts ? goal.due_ts.slice(0, 16) : "");
  const [owner, setOwner] = useState(goal.owner ?? "");
  const [blockers, setBlockers] = useState(goal.blockers?.join(", ") ?? "");

  useEffect(() => {
    setDraft(goal.goal_text);
    setProgressPercent(Math.round(goal.progress * 100));
    setCadence(goal.cadence ?? "weekly");
    setDueInput(goal.due_ts ? goal.due_ts.slice(0, 16) : "");
    setOwner(goal.owner ?? "");
    setBlockers(goal.blockers?.join(", ") ?? "");
  }, [goal.goal_text, goal.progress, goal.cadence, goal.due_ts, goal.owner, goal.blockers]);

  const updatedInfo = useMemo(() => {
    const dt = new Date(goal.updated_ts);
    return Number.isNaN(dt.getTime()) ? goal.updated_ts : dt.toLocaleString();
  }, [goal.updated_ts]);

  async function updateGoal(patch: GoalPatch) {
    try {
      setSaving(true);
      setLocalError(null);
      await onUpdate(goal.goal_id, patch);
    } catch (error: any) {
      setLocalError(error?.message ?? "Kunde inte uppdatera målet.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function saveText() {
    if (!draft.trim() || draft.trim() === goal.goal_text) {
      setEditing(false);
      setDraft(goal.goal_text);
      return;
    }

    try {
      await updateGoal({ goal_text: draft.trim() });
      setEditing(false);
    } catch {
      // handled in updateGoal
    }
  }

  async function commitProgress(value: number) {
    try {
      await updateGoal({ progress: value / 100 });
    } catch {
      setProgressPercent(Math.round(goal.progress * 100));
    }
  }

  return (
    <article className="rounded-lg border p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mål</p>
          {editing ? (
            <textarea
              className="w-full rounded border px-3 py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              disabled={disabled || saving}
            />
          ) : (
            <p className="text-sm leading-relaxed">{goal.goal_text}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-600">
            {progressPercent}%
          </span>
        </div>
      </header>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase text-muted-foreground">Progress</label>
          <input
            type="range"
            min={0}
            max={100}
            value={progressPercent}
            disabled={disabled || saving}
            onChange={(e) => setProgressPercent(Number(e.target.value))}
            onMouseUp={(e) => commitProgress(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) =>
              commitProgress(Number((e.target as HTMLInputElement).value))
            }
            onBlur={(e) => commitProgress(Number((e.target as HTMLInputElement).value))}
            className="w-full"
          />
        </div>

        {localError && <p className="text-xs text-red-600">{localError}</p>}
        <p className="text-xs text-muted-foreground">Uppdaterad: {updatedInfo}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Frekvens</label>
          <select
            className="h-9 w-full rounded border px-2 text-sm"
            value={cadence}
            disabled={disabled || saving}
            onChange={async (e) => {
              const next = e.target.value as GoalModel["cadence"];
              setCadence(next);
              try {
                await updateGoal({ cadence: next });
              } catch {
                setCadence(goal.cadence ?? "weekly");
              }
            }}
          >
            <option value="daily">Dagligen</option>
            <option value="weekly">Veckovis</option>
            <option value="biweekly">Varannan vecka</option>
            <option value="monthly">Månadsvis</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Deadline</label>
          <Input
            type="datetime-local"
            value={dueInput}
            disabled={disabled || saving}
            onChange={(e) => setDueInput(e.target.value)}
            onBlur={async (e) => {
              const value = e.target.value;
              try {
                if (!value) {
                  await updateGoal({ due_ts: null });
                } else {
                  await updateGoal({ due_ts: new Date(value).toISOString() });
                }
              } catch {
                setDueInput(goal.due_ts ? goal.due_ts.slice(0, 16) : "");
              }
            }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Ägare</label>
          <Input
            placeholder="Ägare"
            value={owner}
            disabled={disabled || saving}
            onChange={(e) => setOwner(e.target.value)}
            onBlur={async (e) => {
              const value = e.target.value.trim();
              try {
                await updateGoal({ owner: value.length ? value : null });
              } catch {
                setOwner(goal.owner ?? "");
              }
            }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Blockers</label>
          <Input
            placeholder="Blockers (kommaseparerat)"
            value={blockers}
            disabled={disabled || saving}
            onChange={(e) => setBlockers(e.target.value)}
            onBlur={async (e) => {
              const parts = e.target.value
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
              try {
                await updateGoal({ blockers: parts });
              } catch {
                setBlockers(goal.blockers?.join(", ") ?? "");
              }
            }}
          />
        </div>
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button size="sm" onClick={saveText} disabled={disabled || saving}>
              Spara
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(goal.goal_text);
              }}
              disabled={disabled || saving}
            >
              Avbryt
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={disabled}>
            Redigera
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onArchive(goal.goal_id)} disabled={disabled || saving}>
          Arkivera
        </Button>
        {onCoach && (
          <Button size="sm" onClick={() => onCoach(goal)} disabled={disabled || saving}>
            Coach
          </Button>
        )}
      </footer>
    </article>
  );
}

