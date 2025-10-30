// Explain utils: advanced span extraction for better explain_coverage

export interface RawSpan {
  start: number;
  end: number;
  flag: string;
  cue: string;
  type: 'PHRASE' | 'LEXICON';
  lang?: string;
}

const NOISE_BLOCK = ["alltid", "du är", "köp", "response"]; // Extendable

function inNoiseBlock(text: string): boolean {
  return NOISE_BLOCK.includes(text.toLowerCase().trim());
}

// Sentence boundary expansion
export function expandToSentence(text: string, start: number, end: number): [number, number] {
  let s = start, e = end;
  // Look left for ., !, ? or start
  while (s > 0 && !'.!?\n'.includes(text[s - 1])) s--;
  // Look right for .!? or end
  while (e < text.length && !'.!?\n'.includes(text[e])) e++;
  // Trim whitespace
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e-1])) e--;
  return [s, e];
}

// Merge overlapping/nearby with same flag
export function mergeOverlaps(spans: RawSpan[], text: string): RawSpan[] {
  if (!spans.length) return [];
  const sorted = spans.slice().sort((a, b) => a.start - b.start);
  const merged: RawSpan[] = [];
  let cur = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (
      s.flag === cur.flag &&
      s.start <= cur.end + 2 // allow small gap
    ) {
      cur.end = Math.max(cur.end, s.end);
      cur.cue += '|' + s.cue;
    } else {
      merged.push(cur);
      cur = { ...s };
    }
  }
  merged.push(cur);
  return merged;
}

// Prefer PHRASE over LEXICON for same flag in same sentence
export function preferPhrase(spans: RawSpan[], text: string): RawSpan[] {
  // Group by sentence
  const results: RawSpan[] = [];
  const seen = new Set<string>();
  for (const s of spans) {
    const [senStart, senEnd] = expandToSentence(text, s.start, s.end);
    const key = `${s.flag}:${senStart}:${senEnd}`;
    // Pick PHRASE span for a flag+sentence, else keep first
    if (seen.has(key)) continue;
    if (
      s.type === 'PHRASE' ||
      !spans.some(
        other =>
          other !== s &&
          other.flag === s.flag &&
          other.type === 'PHRASE' &&
          expandToSentence(text, other.start, other.end).toString() === [senStart, senEnd].toString()
      )
    ) {
      results.push({ ...s, start: senStart, end: senEnd });
      seen.add(key);
    }
  }
  return results;
}

// Noise filter: block short singleton cues for blocklist unless PHRASE
export function blockNoise(spans: RawSpan[]): RawSpan[] {
  return spans.filter(s =>
    s.type === 'PHRASE' ||
    (s.cue && s.cue.length >= 5 && !inNoiseBlock(s.cue))
  );
}

// Language-gate (sv/en): Give language, filter out spans not matching lang
export function langGate(spans: RawSpan[], lang: string, langKeys: Record<string, string[]>): RawSpan[] {
  // Accept span only if its cue exists in the lang's cue set.
  const cues = langKeys[lang] || [];
  return spans.filter(s => cues.some(cue => s.cue.toLowerCase().includes(cue)));
}

// All-in-one prioritized pipeline
export function prioritizedSpans(raw: RawSpan[], text: string, lang?: string, langCues?: Record<string, string[]>): RawSpan[] {
  let spans = blockNoise(raw);
  spans = preferPhrase(spans, text);
  spans = mergeOverlaps(spans, text);
  // Language filter if supplied
  if (lang && langCues) {
    spans = langGate(spans, lang, langCues);
  }
  return spans;
}
