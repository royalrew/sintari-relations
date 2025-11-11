import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { GoalCard, GoalModel, GoalPatch } from "./GoalCard";
import { Button } from "@/components/ui/button";
import { goalCoach } from "@/lib/policy/goal_coach";

type GoalListProps = {
  subjectId: string | null;
  createdBy: string;
  contextFacts?: string[];
  focusSignal?: number;
};

export function GoalList({ subjectId, createdBy, contextFacts = [], focusSignal }: GoalListProps) {
  const [goals, setGoals] = useState<GoalModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGoalText, setNewGoalText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [coachNotice, setCoachNotice] = useState<string | null>(null);
  const [coachModal, setCoachModal] = useState<{
    goal: GoalModel;
    plan: { next_step?: string; checklist?: string[]; cautions?: string[] };
  } | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  const loadGoals = useCallback(async () => {
    if (!subjectId) {
      setGoals([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/memory/goals/list?subject=${encodeURIComponent(subjectId)}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { goals: GoalModel[] };
      setGoals(data.goals ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Kunde inte läsa mål.");
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  useEffect(() => {
    if (typeof focusSignal === "number" && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [focusSignal]);

  useEffect(() => {
    setCoachNotice(null);
    setCoachModal(null);
  }, [subjectId]);

  const activeGoals = useMemo(() => goals.filter((goal) => !goal.archived), [goals]);

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !newGoalText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/goals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subjectId,
          goal_text: newGoalText.trim(),
          created_by: createdBy,
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setNewGoalText("");
      setCoachNotice(null);
      await loadGoals();
    } catch (err: any) {
      setError(err?.message ?? "Kunde inte skapa målet.");
    } finally {
      setSubmitting(false);
    }
  }

  async function mutate(goalId: string, patch: GoalPatch) {
    setError(null);
    const prevGoals = goals.map((goal) => ({
      ...goal,
      blockers: Array.isArray(goal.blockers) ? [...goal.blockers] : [],
    }));
    const optimistic = goals.map((goal) =>
      goal.goal_id === goalId
        ? {
            ...goal,
            ...("goal_text" in patch ? { goal_text: patch.goal_text! } : {}),
            ...("progress" in patch ? { progress: patch.progress ?? goal.progress } : {}),
            ...("constraints" in patch ? { constraints: patch.constraints } : {}),
            ...("cadence" in patch ? { cadence: patch.cadence ?? goal.cadence } : {}),
            ...("due_ts" in patch ? { due_ts: patch.due_ts ?? undefined } : {}),
            ...("owner" in patch ? { owner: patch.owner ?? undefined } : {}),
            ...("blockers" in patch ? { blockers: patch.blockers ?? [] } : {}),
          }
        : goal,
    );
    setGoals(optimistic);
    try {
      const res = await fetch("/api/memory/goals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal_id: goalId, ...patch }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const updated = (await res.json()) as GoalModel;
      setGoals((prev) => prev.map((goal) => (goal.goal_id === goalId ? updated : goal)));
    } catch (err) {
      setGoals(prevGoals);
      throw err;
    }
  }

  async function archive(goalId: string) {
    setError(null);
    const res = await fetch("/api/memory/goals/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal_id: goalId }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const updated = (await res.json()) as GoalModel;
    setGoals((prev) => prev.map((goal) => (goal.goal_id === goalId ? updated : goal)));
  }

  function handleCoach(goal: GoalModel) {
    const plan = goalCoach({ goal_text: goal.goal_text, context_facts: contextFacts });
    if (!plan.ok) {
      setCoachNotice(plan.reason ?? "Ingen evidens — samla ett fakta först.");
      return;
    }
    setCoachNotice(null);
    setCoachModal({
      goal,
      plan: {
        next_step: plan.next_step,
        checklist: plan.checklist,
        cautions: plan.cautions,
      },
    });
  }

  if (!subjectId) {
    return <p className="text-xs text-muted-foreground">Välj ett subject för att se mål.</p>;
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mål</h3>
        <span className="text-xs text-muted-foreground">
          Aktiva: {activeGoals.length}/{goals.length}
        </span>
      </header>

      <form onSubmit={handleCreateGoal} className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={createInputRef}
          type="text"
          className="flex-1 rounded border px-3 py-2 text-sm"
          placeholder="Nytt mål…"
          value={newGoalText}
          onChange={(e) => setNewGoalText(e.target.value)}
          disabled={submitting}
        />
        <Button type="submit" size="sm" disabled={submitting || !newGoalText.trim()}>
          Lägg till
        </Button>
      </form>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading ? (
        <p className="text-xs text-muted-foreground">Laddar mål…</p>
      ) : goals.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inga mål ännu.</p>
      ) : (
        <div className="space-y-3">
          {goals
            .filter((goal) => !goal.archived)
            .map((goal) => (
              <GoalCard key={goal.goal_id} goal={goal} onUpdate={mutate} onArchive={archive} onCoach={handleCoach} />
            ))}
          {goals.filter((goal) => goal.archived).length > 0 && (
            <details className="rounded border px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer text-sm font-medium text-foreground">Arkiverade mål</summary>
              <div className="mt-2 space-y-2">
                {goals
                  .filter((goal) => goal.archived)
                  .map((goal) => (
                    <div key={goal.goal_id} className="rounded border px-3 py-2 text-xs">
                      {goal.goal_text}
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}

      {coachNotice && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {coachNotice}
        </div>
      )}

      {coachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Coach-plan</h3>
                <p className="text-xs text-muted-foreground">{coachModal.goal.goal_text}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setCoachModal(null)}>
                Stäng
              </Button>
            </div>
            {coachModal.plan.next_step && (
              <div>
                <p className="text-sm font-medium text-emerald-700">Nästa steg</p>
                <p className="mt-1 text-sm text-emerald-900">{coachModal.plan.next_step}</p>
              </div>
            )}
            {coachModal.plan.checklist && coachModal.plan.checklist.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Checklista</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {coachModal.plan.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {coachModal.plan.cautions && coachModal.plan.cautions.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {coachModal.plan.cautions.join(" ")}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCoachModal(null)}>
                OK
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

