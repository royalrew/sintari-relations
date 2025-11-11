import { Subject, SubjectCore } from "./subject_memory";

const relationHints = ["chef", "mamma", "pappa", "partner", "vän", "kompis", "kollega", "coach", "mentor"];

type TrieNode = {
  children: Map<string, TrieNode>;
  ids: Set<string>;
};

type PhoneticCandidate = {
  id: string;
  norm: string;
};

type CandidateEntry = {
  subject: Subject;
  normPrimary: string;
  aliasNorms: string[];
  tokens: string[];
};

export type SubjectIndex = {
  trie: TrieNode;
  byPrimary: Map<string, string>;
  byAlias: Map<string, string>;
  phoneticMap: Map<string, PhoneticCandidate[]>;
  bigramIndex: Map<string, Set<string>>;
  candidates: Map<string, CandidateEntry>;
};

export type ResolverInput = {
  text: string;
  hint_subject_id?: string;
  context_lang?: string;
  context_key?: string;
};

export type ResolverResult = {
  subject_id: string;
  confidence: number;
};

function createTrie(): TrieNode {
  return { children: new Map<string, TrieNode>(), ids: new Set<string>() };
}

function insertToken(root: TrieNode, token: string, subjectId: string) {
  if (!token) return;
  let node = root;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    let child = node.children.get(ch);
    if (!child) {
      child = createTrie();
      node.children.set(ch, child);
    }
    node = child;
  }
  node.ids.add(subjectId);
}

function collectFromTrie(root: TrieNode, token: string): string[] {
  let node: TrieNode | undefined = root;
  for (let i = 0; i < token.length && node; i += 1) {
    node = node.children.get(token[i]);
  }
  if (!node) return [];
  return Array.from(node.ids);
}

const diacriticsRegexp = /[\u0300-\u036f]/g;
const stripNonLetters = /[^a-z0-9åäöæøüéèêàáïçñœ\s-]/g;
const whitespaceCollapse = /\s+/g;

export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(diacriticsRegexp, "")
    .toLowerCase()
    .replace(stripNonLetters, " ")
    .replace(whitespaceCollapse, " ")
    .trim();
}

export function phonex(value: string): string {
  const norm = normalizeName(value);
  if (!norm) return "";
  const vowels = /[aeiouyäåöaeiouy]/;
  const map: Record<string, string> = {
    b: "1",
    f: "1",
    p: "1",
    v: "1",
    c: "2",
    g: "2",
    j: "2",
    k: "2",
    q: "2",
    s: "2",
    x: "2",
    z: "2",
    d: "3",
    t: "3",
    l: "4",
    m: "5",
    n: "5",
    r: "6",
  };
  const head = norm[0];
  let out = head;
  let last = map[head] ?? "";
  for (let i = 1; i < norm.length && out.length < 4; i += 1) {
    const ch = norm[i];
    if (vowels.test(ch) || ch === "h" || ch === "y" || ch === "w") {
      last = "";
      continue;
    }
    const code = map[ch];
    if (code && code !== last) {
      out += code;
      last = code;
    }
  }
  return (out + "0000").slice(0, 4);
}

export function levDistLe1or2(aInput: string, bInput: string, max = 2): number {
  let a = aInput;
  let b = bInput;
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }
  const n = a.length;
  const m = b.length;
  if (m - n > max) return max + 1;
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);
  for (let i = 0; i <= n; i += 1) prev[i] = i;
  for (let j = 1; j <= m; j += 1) {
    const bj = b.charCodeAt(j - 1);
    curr[0] = j;
    const iStart = Math.max(1, j - max);
    const iEnd = Math.min(n, j + max);
    let rowMin = curr[0];
    for (let i = iStart; i <= iEnd; i += 1) {
      const cost = a.charCodeAt(i - 1) === bj ? 0 : 1;
      const del = prev[i] + 1;
      const ins = curr[i - 1] + 1;
      const sub = prev[i - 1] + cost;
      let v = del < ins ? del : ins;
      if (sub < v) v = sub;
      curr[i] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let k = 0; k < iStart; k += 1) curr[k] = max + 1;
    for (let k = iEnd + 1; k <= n; k += 1) curr[k] = max + 1;
    for (let k = 0; k <= n; k += 1) {
      const t = prev[k];
      prev[k] = curr[k];
      curr[k] = t;
    }
  }
  return prev[n];
}

function createCandidateEntry(subject: Subject): CandidateEntry {
  const normPrimary = normalizeName(subject.primary_name);
  const aliasNorms = subject.aliases.map((alias) => normalizeName(alias.value)).filter(Boolean);
  const tokens = [...new Set(normPrimary.split(" ").filter(Boolean))];
  aliasNorms.forEach((alias) => {
    alias.split(" ").forEach((token) => {
      if (token) tokens.push(token);
    });
  });
  return {
    subject,
    normPrimary,
    aliasNorms,
    tokens: [...new Set(tokens)],
  };
}

function computeBigrams(value: string): string[] {
  const trimmed = value.replace(/\s+/g, " ");
  if (trimmed.length < 2) return [trimmed];
  const grams: string[] = [];
  for (let i = 0; i < trimmed.length - 1; i += 1) {
    grams.push(trimmed.slice(i, i + 2));
  }
  return grams;
}

export function buildIndex(subjects: Subject[]): SubjectIndex {
  const trie = createTrie();
  const byPrimary = new Map<string, string>();
  const byAlias = new Map<string, string>();
  const phoneticMap = new Map<string, PhoneticCandidate[]>();
  const bigramIndex = new Map<string, Set<string>>();
  const candidates = new Map<string, CandidateEntry>();

  for (const subject of subjects) {
    const entry = createCandidateEntry(subject);
    candidates.set(subject.subject_id, entry);

    if (entry.normPrimary) {
      byPrimary.set(entry.normPrimary, subject.subject_id);
      insertToken(trie, entry.normPrimary, subject.subject_id);
      const code = phonex(entry.normPrimary);
      if (code) {
        const list = phoneticMap.get(code) ?? [];
        list.push({ id: subject.subject_id, norm: entry.normPrimary });
        phoneticMap.set(code, list);
      }
      for (const bigram of computeBigrams(entry.normPrimary)) {
        const set = bigramIndex.get(bigram) ?? new Set<string>();
        set.add(subject.subject_id);
        bigramIndex.set(bigram, set);
      }
    }

    for (const alias of entry.aliasNorms) {
      if (!alias) continue;
      byAlias.set(alias, subject.subject_id);
      insertToken(trie, alias, subject.subject_id);
      const code = phonex(alias);
      if (code) {
        const list = phoneticMap.get(code) ?? [];
        list.push({ id: subject.subject_id, norm: alias });
        phoneticMap.set(code, list);
      }
      for (const bigram of computeBigrams(alias)) {
        const set = bigramIndex.get(bigram) ?? new Set<string>();
        set.add(subject.subject_id);
        bigramIndex.set(bigram, set);
      }
    }
  }

  for (const list of phoneticMap.values()) {
    list.sort((a, b) => a.norm.localeCompare(b.norm));
  }

  return {
    trie,
    byPrimary,
    byAlias,
    phoneticMap,
    bigramIndex,
    candidates,
  };
}

type ResolveMatchType = "primary" | "alias" | "phonetic" | "fuzzy" | "context";

function confidenceFrom(distance: number, type: ResolveMatchType): number {
  if (distance <= 0) {
    if (type === "primary") return 1;
    if (type === "alias") return 0.95;
    return 0.9;
  }
  if (distance === 1) {
    if (type === "primary") return 0.92;
    if (type === "alias") return 0.9;
    return 0.85;
  }
  if (distance === 2) {
    return type === "primary" ? 0.85 : 0.8;
  }
  return 0.7;
}

type ResolveOptions = {
  maxEditDistance?: number;
  hintSubjectId?: string;
  contextSubjectId?: string;
  hasRelationHint?: boolean;
};

type ResolveCandidate = {
  subject_id: string;
  confidence: number;
  distance: number;
  type: ResolveMatchType;
};

function evaluateCandidate(
  query: string,
  entry: CandidateEntry,
  opts: ResolveOptions,
): ResolveCandidate | null {
  const max = opts.maxEditDistance ?? 2;
  let bestDistance = levDistLe1or2(query, entry.normPrimary, max);
  let matchType: ResolveMatchType = "primary";

  if (bestDistance > max) bestDistance = max + 1;

  for (const alias of entry.aliasNorms) {
    const dist = levDistLe1or2(query, alias, max);
    if (dist < bestDistance) {
      bestDistance = dist;
      matchType = "alias";
      if (dist === 0) break;
    }
  }

  if (bestDistance > max) return null;
  let confidence = confidenceFrom(bestDistance, matchType);

  if (opts.hintSubjectId && opts.hintSubjectId === entry.subject.subject_id) {
    confidence = Math.max(confidence, 0.78);
    matchType = "context";
  }

  if (opts.contextSubjectId && opts.contextSubjectId === entry.subject.subject_id) {
    confidence = Math.max(confidence, 0.76);
  }

  if (opts.hasRelationHint) {
    confidence = Math.max(confidence, 0.6);
  }

  return {
    subject_id: entry.subject.subject_id,
    confidence: Math.min(1, confidence),
    distance: bestDistance,
    type: matchType,
  };
}

const MAX_CANDIDATES = 40;

export function resolveNameFast(
  query: string,
  index: SubjectIndex,
  opts: ResolveOptions = {},
): ResolveCandidate | null {
  const normQuery = normalizeName(query);
  if (!normQuery) return null;

  const exactPrimary = index.byPrimary.get(normQuery);
  if (exactPrimary) {
    return {
      subject_id: exactPrimary,
      confidence: 1,
      distance: 0,
      type: "primary",
    };
  }

  const exactAlias = index.byAlias.get(normQuery);
  if (exactAlias) {
    return {
      subject_id: exactAlias,
      confidence: 0.95,
      distance: 0,
      type: "alias",
    };
  }

  const candidateIds = new Set<string>();
  const tokens = normQuery.split(" ").filter(Boolean);
  for (const token of tokens) {
    const ids = collectFromTrie(index.trie, token);
    for (const id of ids) {
      candidateIds.add(id);
      if (candidateIds.size >= MAX_CANDIDATES) break;
    }
    if (candidateIds.size >= MAX_CANDIDATES) break;
  }

  if (opts.hintSubjectId) candidateIds.add(opts.hintSubjectId);
  if (opts.contextSubjectId) candidateIds.add(opts.contextSubjectId);

  if (candidateIds.size < 8) {
    const code = phonex(normQuery);
    if (code) {
      const bucket = index.phoneticMap.get(code);
      if (bucket) {
        for (const candidate of bucket) {
          candidateIds.add(candidate.id);
          if (candidateIds.size >= MAX_CANDIDATES) break;
        }
      }
    }
  }

  if (candidateIds.size < 8) {
    const counts = new Map<string, number>();
    for (const bigram of computeBigrams(normQuery)) {
      const set = index.bigramIndex.get(bigram);
      if (!set) continue;
      for (const id of set) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    for (const [id] of top) {
      candidateIds.add(id);
      if (candidateIds.size >= MAX_CANDIDATES) break;
    }
  }

  if (candidateIds.size === 0) {
    const fallback = Array.from(index.candidates.keys()).slice(0, 10);
    fallback.forEach((id) => candidateIds.add(id));
  }

  const options: ResolveOptions = {
    maxEditDistance: opts.maxEditDistance ?? 2,
    hintSubjectId: opts.hintSubjectId,
    contextSubjectId: opts.contextSubjectId,
    hasRelationHint: opts.hasRelationHint,
  };

  let best: ResolveCandidate | null = null;
  for (const id of candidateIds) {
    const entry = index.candidates.get(id);
    if (!entry) continue;
    const evaluated = evaluateCandidate(normQuery, entry, options);
    if (!evaluated) continue;
    if (!best || evaluated.distance < best.distance || evaluated.confidence > best.confidence) {
      best = evaluated;
      if (evaluated.distance === 0 && evaluated.confidence >= 0.95) break;
    }
  }

  return best;
}

export function resolveSubject(
  input: ResolverInput,
  index: SubjectIndex,
  extra?: { contextSubjectId?: string },
): ResolverResult | null {
  if (!input.text.trim()) return null;

  const hasRelationHint = relationHints.some((hint) =>
    input.text.toLowerCase().includes(hint),
  );

  const candidate = resolveNameFast(input.text, index, {
    hintSubjectId: input.hint_subject_id,
    contextSubjectId: extra?.contextSubjectId,
    hasRelationHint,
  });

  if (!candidate) return null;

  return {
    subject_id: candidate.subject_id,
    confidence: candidate.confidence,
  };
}

type CacheEntry = {
  value: ResolverResult | null;
  ts: number;
};

class LruCache {
  private map = new Map<string, CacheEntry>();
  constructor(private readonly limit: number, private readonly ttlMs: number) {}

  get(key: string) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.map.delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: ResolverResult | null) {
    if (this.map.size >= this.limit) {
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
    this.map.set(key, { value, ts: Date.now() });
  }

  clear() {
    this.map.clear();
  }
}

const DEFAULT_HEAT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_HEAT_MAX = 64;

type HeatEntry = {
  subjectIds: string[];
  ts: number;
};

export class SubjectResolver {
  private index: SubjectIndex | null = null;
  private fetchedAt = 0;
  private cache: LruCache;
  private contextCache = new Map<string, { subjectId: string; ts: number }>();
  private heatCache = new Map<string, HeatEntry>();

  constructor(
    private ttlMs = 60_000,
    private heatTtlMs = DEFAULT_HEAT_TTL_MS,
    private heatMax = DEFAULT_HEAT_MAX,
  ) {
    this.cache = new LruCache(64, ttlMs);
  }

  private async ensureIndex() {
    const now = Date.now();
    if (!this.index || now - this.fetchedAt > this.ttlMs) {
      const list = await SubjectCore.list();
      this.index = buildIndex(list);
      this.fetchedAt = now;
      this.cache.clear();
      this.contextCache.clear();
      this.heatCache.clear();
    }
  }

  private contextCandidateId(contextKey: string | undefined) {
    if (!contextKey) return undefined;
    const entry = this.contextCache.get(contextKey);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.contextCache.delete(contextKey);
      return undefined;
    }
    return entry.subjectId;
  }

  private setContext(contextKey: string | undefined, subjectId: string | null) {
    if (!contextKey || !subjectId) return;
    this.contextCache.set(contextKey, { subjectId, ts: Date.now() });
  }

  invalidateContext(contextKey: string | undefined) {
    if (!contextKey) return;
    this.contextCache.delete(contextKey);
    this.heatCache.delete(contextKey);
  }

  private getHeatCandidates(contextKey: string | undefined) {
    if (!contextKey) return [];
    const entry = this.heatCache.get(contextKey);
    if (!entry) return [];
    if (Date.now() - entry.ts > this.heatTtlMs) {
      this.heatCache.delete(contextKey);
      return [];
    }
    return entry.subjectIds;
  }

  private updateHeat(contextKey: string | undefined, subjectId: string | null) {
    if (!contextKey || !subjectId) return;
    const entry = this.heatCache.get(contextKey);
    if (!entry) {
      this.heatCache.set(contextKey, { subjectIds: [subjectId], ts: Date.now() });
      if (this.heatCache.size > this.heatMax) {
        const firstKey = this.heatCache.keys().next().value;
        if (firstKey) this.heatCache.delete(firstKey);
      }
      return;
    }
    const list = entry.subjectIds.filter((id) => id !== subjectId);
    list.unshift(subjectId);
    entry.subjectIds = list.slice(0, 5);
    entry.ts = Date.now();
  }

  async resolve(input: ResolverInput) {
    await this.ensureIndex();
    if (!this.index) return null;

    const cacheKey = JSON.stringify([
      input.text,
      input.hint_subject_id,
      input.context_lang,
      input.context_key,
    ]);
    const cached = this.cache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const contextSubjectId = this.contextCandidateId(input.context_key);
    const hasRelationHint = relationHints.some((hint) =>
      input.text.toLowerCase().includes(hint),
    );

    let result =
      this.tryHeatCandidates(
        input.text,
        contextSubjectId,
        hasRelationHint,
        input.context_key,
      ) ??
      resolveSubject(input, this.index, {
        contextSubjectId,
      }) ??
      null;

    this.cache.set(cacheKey, result);
    this.setContext(input.context_key, result?.subject_id ?? null);
    if (result?.subject_id) {
      this.updateHeat(input.context_key, result.subject_id);
    }
    return result;
  }

  invalidate() {
    this.index = null;
    this.fetchedAt = 0;
    this.cache.clear();
    this.contextCache.clear();
    this.heatCache.clear();
  }
}

export const subjectResolver = new SubjectResolver();
