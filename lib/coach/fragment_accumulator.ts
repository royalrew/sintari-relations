// lib/coach/fragment_accumulator.ts

type Frag = { text: string; ts: number };

type Acc = { frags: Frag[]; startedAt: number };

const MAX_WINDOW_MS = 5 * 60 * 1000; // 5 min
const MAX_FRAGS = 12;

const STOP = new Set([
  "och", "att", "det", "som", "men", "för", "är", "på", "i", "en", "ett",
  "har", "hade", "den", "detta", "där", "var", "vara", "med", "till", "av",
  "om", "inte", "kan", "ska", "vill", "får", "måste", "bör", "skulle"
]);

const G = ((): Map<string, Acc> => {
  // För Node.js/Next.js: använd globalThis eller en modul-scoped Map
  if (typeof globalThis !== 'undefined') {
    // @ts-ignore
    if (!globalThis.__frag) {
      // @ts-ignore
      globalThis.__frag = new Map<string, Acc>();
    }
    // @ts-ignore
    return globalThis.__frag as Map<string, Acc>;
  }
  // Fallback: modul-scoped Map (resettas vid hot reload)
  return new Map<string, Acc>();
})();

export const FragAcc = {
  get(threadId: string): Acc {
    if (!G.has(threadId)) {
      G.set(threadId, { frags: [], startedAt: Date.now() });
    }
    return G.get(threadId)!;
  },

  push(threadId: string, text: string) {
    const acc = FragAcc.get(threadId);
    const now = Date.now();
    
    // Reset om tidsfönstret har passerat
    if (now - acc.startedAt > MAX_WINDOW_MS) {
      acc.frags = [];
      acc.startedAt = now;
    }
    
    const t = text.trim();
    if (!t) return;
    
    acc.frags.push({ text: t, ts: now });
    
    // Håll max antal fragment
    if (acc.frags.length > MAX_FRAGS) {
      acc.frags.shift();
    }
  },

  clear(threadId: string) {
    const acc = FragAcc.get(threadId);
    acc.frags = [];
    acc.startedAt = Date.now();
  },

  getAll(threadId: string): Frag[] {
    return FragAcc.get(threadId).frags;
  }
};

export const isShortUtterance = (s: string): boolean => {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return s.length < 25 || words.length < 5;
};

const kw = (s: string): Set<string> => {
  return new Set(
    s.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
  );
};

export function shouldAccumulate(threadId: string, latestUser: string): boolean {
  if (!isShortUtterance(latestUser)) return false;
  const acc = FragAcc.get(threadId);
  return Date.now() - acc.startedAt <= MAX_WINDOW_MS;
}

export function readyToAggregate(threadId: string): boolean {
  const acc = FragAcc.get(threadId);
  if (acc.frags.length < 4) return false;
  
  // Enkel sammanhållningscheck mot första fragmentet
  const base = kw(acc.frags[0].text);
  let overlaps = 0;
  
  for (let i = 1; i < acc.frags.length; i++) {
    const set = kw(acc.frags[i].text);
    const inter = [...set].filter(x => base.has(x)).length;
    const uni = new Set([...set, ...base]).size || 1;
    const j = inter / uni;
    
    if (j >= 0.2) overlaps++;
  }
  
  const densityOk = overlaps >= Math.max(1, Math.floor(acc.frags.length / 3));
  return densityOk;
}

export function extractThemeKeywords(texts: string[]): Set<string> {
  const freq: Record<string, number> = {};
  
  for (const t of texts) {
    for (const w of kw(t)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  
  return new Set(
    Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(x => x[0])
  );
}

export function filterIrrelevant(texts: string[], themeKw: Set<string>): string[] {
  return texts.filter(t => {
    const words = [...kw(t)];
    if (!words.length) return false;
    
    const overlap = words.filter(w => themeKw.has(w)).length / words.length;
    return overlap >= 0.2;
  });
}

export function aggregateSummary(
  texts: string[],
  maxLen = 300
): { summary: string; theme: string } {
  const uniq = Array.from(new Set(texts));
  const themeKw = extractThemeKeywords(uniq);
  const filtered = filterIrrelevant(uniq, themeKw);
  const theme = [...themeKw].slice(0, 3).join(", ");
  const summary = filtered.join(" · ").slice(0, maxLen);
  
  return { summary, theme };
}

