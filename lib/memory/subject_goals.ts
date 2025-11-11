import { z } from "zod";

export const GoalSchema = z.object({
  goal_id: z.string().min(1),
  subject_id: z.string().min(1),
  goal_text: z.string().min(1),
  valence: z.enum(["prosocial"]).default("prosocial"),
  cadence: z.enum(["daily", "weekly", "biweekly", "monthly"]).default("weekly"),
  due_ts: z.string().datetime().optional(),
  owner: z.string().optional(),
  blockers: z.array(z.string()).default([]),
  progress: z.number().min(0).max(1).default(0),
  constraints: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .default({})
    .optional(),
  created_by: z.string().min(1),
  created_ts: z.string().datetime(),
  updated_ts: z.string().datetime(),
  archived: z.boolean().default(false),
});

export type Goal = z.infer<typeof GoalSchema>;

export interface GoalStore {
  get(id: string): Promise<Goal | undefined>;
  set(id: string, goal: Goal): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<Goal[]>;
}

export class InMemoryGoalStore implements GoalStore {
  private map = new Map<string, Goal>();

  async get(id: string) {
    return this.map.get(id);
  }

  async set(id: string, goal: Goal) {
    this.map.set(id, goal);
  }

  async delete(id: string) {
    this.map.delete(id);
  }

  async list() {
    return [...this.map.values()];
  }
}

const nowIso = () => new Date().toISOString();

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function simpleId(prefix = "goal") {
  const rnd = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36);
  return `${prefix}_${t}_${rnd}`;
}

export class GoalRepository {
  constructor(private readonly store: GoalStore = new InMemoryGoalStore()) {}

  async create(input: {
    subject_id: string;
    goal_text: string;
    created_by: string;
    progress?: number;
    valence?: "prosocial";
    constraints?: Record<string, string | number | boolean>;
    cadence?: "daily" | "weekly" | "biweekly" | "monthly";
    due_ts?: string;
    owner?: string;
    blockers?: string[];
    id?: string;
  }): Promise<Goal> {
    const goal = GoalSchema.parse({
      goal_id: input.id ?? simpleId(),
      subject_id: input.subject_id,
      goal_text: input.goal_text.trim(),
      valence: input.valence ?? "prosocial",
      cadence: input.cadence ?? "weekly",
      due_ts: input.due_ts,
      owner: input.owner,
      blockers: input.blockers ?? [],
      progress: clamp01(input.progress ?? 0),
      constraints: input.constraints ?? {},
      created_by: input.created_by,
      created_ts: nowIso(),
      updated_ts: nowIso(),
      archived: false,
    });
    await this.store.set(goal.goal_id, goal);
    return goal;
  }

  async get(id: string) {
    const goal = await this.store.get(id);
    return goal ?? null;
  }

  async listBySubject(subjectId: string, opts: { includeArchived?: boolean } = {}) {
    const includeArchived = opts.includeArchived ?? false;
    const all = await this.store.list();
    return all.filter(
      (goal) => goal.subject_id === subjectId && (includeArchived || !goal.archived),
    );
  }

  async updateText(id: string, goal_text: string) {
    const goal = await this.getOrThrow(id);
    goal.goal_text = goal_text.trim();
    goal.updated_ts = nowIso();
    await this.store.set(id, goal);
    return goal;
  }

  async setProgress(id: string, value: number) {
    const goal = await this.getOrThrow(id);
    goal.progress = clamp01(value);
    goal.updated_ts = nowIso();
    await this.store.set(id, goal);
    return goal;
  }

  async setConstraints(id: string, patch: Record<string, string | number | boolean>) {
    const goal = await this.getOrThrow(id);
    goal.constraints = { ...(goal.constraints ?? {}), ...patch };
    goal.updated_ts = nowIso();
    await this.store.set(id, goal);
    return goal;
  }

  async setCadence(id: string, cadence: "daily" | "weekly" | "biweekly" | "monthly") {
    const goal = await this.getOrThrow(id);
    goal.cadence = cadence;
    goal.updated_ts = nowIso();
    await this.store.set(id, goal);
    return goal;
  }

  async setDueTs(id: string, due_ts: string | undefined) {
    const goal = await this.getOrThrow(id);
    goal.due_ts = due_ts;
    goal.updated_ts = nowIso();
    await this.store.set(id, goal);
    return goal;
  }

  async setOwner(id: string, owner: string | undefined) {
    const goal = await this.getOrThrow(id);
    goal.owner = owner;
    goal.updated_ts = nowIso();
    await this.store.set(id, goal);
    return goal;
  }

  async setBlockers(id: string, blockers: string[]) {
    const goal = await this.getOrThrow(id);
    goal.blockers = blockers;
    goal.updated_ts = nowIso();
    await this.store.set(id, goal);
    return goal;
  }

  async archive(id: string) {
    const goal = await this.getOrThrow(id);
    goal.archived = true;
    goal.updated_ts = nowIso();
    await this.store.set(id, goal);
    return goal;
  }

  async remove(id: string) {
    await this.store.delete(id);
  }

  private async getOrThrow(id: string) {
    const goal = await this.store.get(id);
    if (!goal) {
      throw new Error(`Goal not found: ${id}`);
    }
    return goal;
  }
}

export const goalRepo = new GoalRepository();

