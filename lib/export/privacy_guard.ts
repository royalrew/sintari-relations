type Primitive = string | number | boolean | null | undefined;

type AnyRecord = Record<string, Primitive | AnyRecord | AnyRecord[]>;

const FORBIDDEN_KEYS = new Set([
  "subject_id",
  "aliases",
  "hearts_private",
  "debug_chips",
  "debug",
]);

export function privacyGuard<T extends AnyRecord>(input: T): T {
  const clone = JSON.parse(JSON.stringify(input)) as AnyRecord;

  if (Array.isArray(clone.subjects)) {
    clone.subjects = clone.subjects.map((subject: any) => sanitizeSubject(subject));
  }

  delete (clone as any).debug;

  return clone as T;
}

function sanitizeSubject(subject: AnyRecord): AnyRecord {
  const copy = { ...subject };
  FORBIDDEN_KEYS.forEach((key) => {
    if (key in copy) {
      delete copy[key];
    }
  });
  return copy;
}

export function assertNoForbiddenKeys(obj: any) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach(assertNoForbiddenKeys);
    return;
  }

  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Forbidden key detected in export: ${key}`);
    }
    const value = (obj as AnyRecord)[key];
    if (value && typeof value === "object") {
      assertNoForbiddenKeys(value);
    }
  }
}

