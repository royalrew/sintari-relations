import { randomUUID } from "crypto";

export type QuickRepairRecord = {
  fact_id: string;
  subject_id: string;
  text: string;
  when_ts: string | null;
  created_ts: string;
};

type SaveInput = {
  subject_id: string;
  text: string;
  when_ts?: number | null;
};

class QuickRepairStore {
  private map = new Map<string, QuickRepairRecord[]>();

  list(subjectId: string): QuickRepairRecord[] {
    return this.map.get(subjectId) ?? [];
  }

  save(record: QuickRepairRecord): QuickRepairRecord {
    const current = this.map.get(record.subject_id) ?? [];
    this.map.set(record.subject_id, [record, ...current]);
    return record;
  }

  remove(subjectId: string, factId: string): boolean {
    const current = this.map.get(subjectId);
    if (!current) return false;
    const next = current.filter((rec) => rec.fact_id !== factId);
    this.map.set(subjectId, next);
    return next.length !== current.length;
  }
}

const store = new QuickRepairStore();

function nowIso() {
  return new Date().toISOString();
}

export const quickRepair = {
  saveFacet(input: SaveInput): QuickRepairRecord {
    const text = (input.text ?? "").trim();
    if (!text) {
      throw new Error("text krävs");
    }
    const record: QuickRepairRecord = {
      fact_id: randomUUID(),
      subject_id: input.subject_id,
      text,
      when_ts: typeof input.when_ts === "number" && Number.isFinite(input.when_ts) ? new Date(input.when_ts).toISOString() : null,
      created_ts: nowIso(),
    };
    return store.save(record);
  },

  list(subjectId: string): QuickRepairRecord[] {
    return store.list(subjectId);
  },

  remove(subjectId: string, factId: string): boolean {
    return store.remove(subjectId, factId);
  },
};

