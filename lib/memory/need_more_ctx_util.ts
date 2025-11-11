export function facetsKey(subjectId: string | null | undefined, facets: string[] = []) {
  const id = subjectId ?? "_none";
  const norm = facets
    .map((item) => (item ?? "").trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
  return `${id}:${norm}`;
}

export function cooldownActive(nowMs: number, lastMs: number | null, windowMs: number) {
  if (!lastMs) return false;
  return nowMs - lastMs < windowMs;
}

