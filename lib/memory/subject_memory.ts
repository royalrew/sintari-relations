import { z } from "zod";

export const SubjectAliasSchema = z.object({
  value: z.string().min(1),
  added_ts: z.string().datetime(),
});

export const SubjectSchema = z.object({
  subject_id: z.string().min(1),
  primary_name: z.string().min(1),
  aliases: z.array(SubjectAliasSchema).default([]),
  pronouns: z.string().optional(),
  trust_score: z.number().min(0).max(1).default(0.5),
  last_seen_ts: z.string().datetime(),
});

export type Subject = z.infer<typeof SubjectSchema>;
export type SubjectAlias = z.infer<typeof SubjectAliasSchema>;

export interface SubjectStore {
  get(id: string): Promise<Subject | undefined>;
  set(id: string, subj: Subject): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<Subject[]>;
}

export class InMemorySubjectStore implements SubjectStore {
  private map = new Map<string, Subject>();

  async get(id: string) {
    return this.map.get(id);
  }

  async set(id: string, subj: Subject) {
    this.map.set(id, subj);
  }

  async delete(id: string) {
    this.map.delete(id);
  }

  async list() {
    return [...this.map.values()];
  }
}

const nowIso = () => new Date().toISOString();
const norm = (value: string) => value.trim().toLowerCase();
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function simpleId(prefix = "subj") {
  const rnd = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}_${t}_${rnd}`;
}

function cloneSubject(subj: Subject): Subject {
  return JSON.parse(JSON.stringify(subj)) as Subject;
}

export class SubjectRepository {
  constructor(private readonly store: SubjectStore = new InMemorySubjectStore()) {}

  async create(
    primary_name: string,
    opts?: { pronouns?: string; trust_score?: number; id?: string },
  ): Promise<Subject> {
    const id = opts?.id ?? simpleId();
    const subject = SubjectSchema.parse({
      subject_id: id,
      primary_name: primary_name.trim(),
      aliases: [],
      pronouns: opts?.pronouns?.trim() || undefined,
      trust_score: clamp01(opts?.trust_score ?? 0.5),
      last_seen_ts: nowIso(),
    });
    await this.store.set(id, subject);
    return cloneSubject(subject);
  }

  async get(id: string) {
    const subj = await this.store.get(id);
    return subj ? cloneSubject(subj) : undefined;
  }

  async list() {
    const items = await this.store.list();
    return items.map(cloneSubject);
  }

  async remove(id: string) {
    await this.store.delete(id);
  }

  async touch(id: string, ts?: string) {
    const subject = await this.getOrThrow(id);
    subject.last_seen_ts = ts ?? nowIso();
    await this.store.set(id, subject);
    return cloneSubject(subject);
  }

  async setPronouns(id: string, pronouns?: string) {
    const subject = await this.getOrThrow(id);
    subject.pronouns = pronouns?.trim() || undefined;
    await this.store.set(id, subject);
    return cloneSubject(subject);
  }

  async setTrustScore(id: string, trust_score: number) {
    const subject = await this.getOrThrow(id);
    subject.trust_score = clamp01(trust_score);
    await this.store.set(id, subject);
    return cloneSubject(subject);
  }

  async addAlias(id: string, alias: string) {
    const subject = await this.getOrThrow(id);
    const value = alias.trim();
    if (!value) return cloneSubject(subject);
    const normalized = norm(value);
    const primaryNorm = norm(subject.primary_name);
    const hasAlias = subject.aliases.some((entry) => norm(entry.value) === normalized);
    if (!hasAlias && normalized !== primaryNorm) {
      subject.aliases.push({ value, added_ts: nowIso() });
      await this.store.set(id, subject);
    }
    return cloneSubject(subject);
  }

  async pinAsPrimary(id: string, aliasOrName: string) {
    const subject = await this.getOrThrow(id);
    const newPrimary = aliasOrName.trim();
    if (!newPrimary) return cloneSubject(subject);
    if (norm(subject.primary_name) === norm(newPrimary)) {
      return cloneSubject(subject);
    }

    const normalizedTarget = norm(newPrimary);
    const now = nowIso();

    if (!subject.aliases.some((alias) => norm(alias.value) === norm(subject.primary_name))) {
      subject.aliases.push({ value: subject.primary_name, added_ts: now });
    }

    subject.primary_name = newPrimary;
    subject.aliases = subject.aliases.filter((alias) => norm(alias.value) !== normalizedTarget);
    await this.store.set(id, subject);
    return cloneSubject(subject);
  }

  async mergeAliases(targetId: string, sourceId: string) {
    if (targetId === sourceId) {
      return this.getOrThrow(targetId);
    }

    const target = await this.getOrThrow(targetId);
    const source = await this.getOrThrow(sourceId);

    const aliasMap = new Map<string, SubjectAlias>();
    for (const alias of target.aliases) {
      aliasMap.set(norm(alias.value), { ...alias });
    }

    const targetPrimaryNorm = norm(target.primary_name);

    if (norm(source.primary_name) !== targetPrimaryNorm) {
      const key = norm(source.primary_name);
      if (!aliasMap.has(key)) {
        aliasMap.set(key, { value: source.primary_name, added_ts: nowIso() });
      }
    }

    for (const alias of source.aliases) {
      const key = norm(alias.value);
      if (key === targetPrimaryNorm) continue;
      if (!aliasMap.has(key)) {
        aliasMap.set(key, { value: alias.value, added_ts: alias.added_ts });
      }
    }

    target.aliases = [...aliasMap.values()];
    target.trust_score = clamp01(Math.max(target.trust_score, source.trust_score, 0.6));
    target.last_seen_ts = nowIso();

    await this.store.set(target.subject_id, target);
    await this.store.delete(source.subject_id);
    return cloneSubject(target);
  }

  async findByName(name: string) {
    const search = norm(name);
    const items = await this.list();
    return items.find(
      (item) =>
        norm(item.primary_name) === search ||
        item.aliases.some((alias) => norm(alias.value) === search),
    );
  }

  private async getOrThrow(id: string) {
    const subj = await this.store.get(id);
    if (!subj) {
      throw new Error(`Subject not found: ${id}`);
    }
    return subj;
  }
}

export const subjectRepo = new SubjectRepository();

// Convenience exports; SubjectResolver relies on SubjectCore.list()
export const SubjectCore = {
  create: (name: string, opts?: { pronouns?: string; trust_score?: number; id?: string }) =>
    subjectRepo.create(name, opts),
  get: (id: string) => subjectRepo.get(id),
  list: () => subjectRepo.list(),
  remove: (id: string) => subjectRepo.remove(id),
  touch: (id: string, ts?: string) => subjectRepo.touch(id, ts),
  addAlias: (id: string, alias: string) => subjectRepo.addAlias(id, alias),
  pinAsPrimary: (id: string, name: string) => subjectRepo.pinAsPrimary(id, name),
  mergeAliases: (targetId: string, sourceId: string) => subjectRepo.mergeAliases(targetId, sourceId),
  setPronouns: (id: string, pronouns?: string) => subjectRepo.setPronouns(id, pronouns),
  setTrustScore: (id: string, trust: number) => subjectRepo.setTrustScore(id, trust),
  findByName: (name: string) => subjectRepo.findByName(name),
};
