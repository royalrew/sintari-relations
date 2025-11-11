import { z } from "zod";

const SubjectFeelSchema = z.object({
  subject_id: z.string().min(1),
  value: z.number().int().min(1).max(5),
  updated_ts: z.string().datetime(),
});

export type SubjectFeel = z.infer<typeof SubjectFeelSchema>;

function clamp(value: number): number {
  if (Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

class InMemoryFeelStore {
  private readonly map = new Map<string, SubjectFeel>();

  get(id: string) {
    return this.map.get(id) ?? null;
  }

  set(record: SubjectFeel) {
    this.map.set(record.subject_id, record);
    return record;
  }

  delete(id: string) {
    return this.map.delete(id);
  }
}

const store = new InMemoryFeelStore();

function nowIso() {
  return new Date().toISOString();
}

export const feelRepo = {
  get(subjectId: string) {
    return store.get(subjectId);
  },
  set(subjectId: string, value: number) {
    const record: SubjectFeel = SubjectFeelSchema.parse({
      subject_id: subjectId,
      value: clamp(value),
      updated_ts: nowIso(),
    });
    return store.set(record);
  },
  remove(subjectId: string) {
    return store.delete(subjectId);
  },
};

