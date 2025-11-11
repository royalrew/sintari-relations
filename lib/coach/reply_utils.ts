/**
 * Reply Utils - Hjälpfunktioner för reply-hantering
 */

// Tagga svaret så nästa tur kan se vad som skickades
export function withReplyMeta(content: string, type: string, key?: string, mood?: string): string {
  const meta = `\n\n<!-- reply_meta:${JSON.stringify({ type, key, mood })} -->`;
  return content + meta;
}

export function lastReplyMeta(conversation?: Array<{ role: 'user'|'assistant'; content: string }>): {type?: string; key?: string} {
  const last = conversation?.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
  const m = last.match(/<!-- reply_meta:(.*?)-->/);
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch { return {}; }
}

// ---- Anti-repeat + 1-fråga-regel ----
export function stripQuestions(s: string): string { 
  return s.replace(/\?+/g, '?'); 
}

export function ensureSingleQuestion(s: string): string {
  const parts = s.split('?');
  return parts[0] + (parts.length > 1 ? '?' : '');
}

export function nonRepeatOk(prev?: string, next?: string): boolean {
  if (!prev || !next) return true;
  const p = prev.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  const n = next.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  return p !== n;
}

// ---- Mood-repair ----
export function lastMood(conv: Array<{role: 'user'|'assistant'; content: string}> = []): string | undefined {
  const m = conv.filter(x => x.role === 'assistant').slice(-1)[0]?.content || '';
  const k = m.match(/<!-- reply_meta:(.*?)-->/);
  try {
    return k ? JSON.parse(k[1]).mood : undefined;
  } catch {
    return undefined;
  }
}

// ---- Recap ----
import { extractSlots } from './detectors';

export function buildRecap(conv: Array<{role: 'user'|'assistant'; content: string}> = []): string {
  const user = conv.filter(m => m.role === 'user').map(m => m.content).join(' ');
  const s = extractSlots(user);
  const bits = [
    s.action ? `Mål: ${s.action}` : null,
    s.obstacle ? `Hinder: ${s.obstacle}` : null,
    s.target ? `Riktning: mot ${s.target}` : null
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'Mål/område ej tydligt än';
}

// ---- Soft domain-guard ----
export function isOffTopicSimple(t: string): boolean {
  return /^\s*\d+\s*([+\-*/x])\s*\d+\s*\??\s*$/.test(t);
}

export function quickAnswer(t: string): string | null {
  const m = t.match(/(\d+)\s*([+\-*/x])\s*(\d+)/i);
  if (!m) return null;
  const a = +m[1], op = m[2], b = +m[3];
  const r = op === '+' ? a + b : op === '-' ? a - b : op === '*' || op.toLowerCase() === 'x' ? a * b : b ? a / b : NaN;
  return isFinite(r) ? String(r) : 'Ogiltigt';
}

// ---- Utils för template-hantering ----
export function rotate<T>(arr: T[], seed: number): T {
  if (arr.length === 0) return '' as unknown as T;
  return arr[seed % arr.length];
}

export function containsAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some(n => h.includes(n.toLowerCase()));
}

export function shortInput(s?: string): boolean {
  if (!s) return true;
  const words = s.trim().split(/\s+/);
  return s.trim().length < 30 || words.length < 6;
}

