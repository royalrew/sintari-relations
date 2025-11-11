import { SubjectCore } from "@/lib/memory/subject_memory";
import { buildSubjectContext, formatSubjectTokens, SubjectContext } from "@/lib/memory/subject_context";
import { subjectResolver } from "@/lib/memory/subject_resolver";

const NAME_REGEX = /[A-ZÅÄÖ][a-zåäö]+(?:-[A-ZÅÄÖ][a-zåäö]+)?/g;
const STOP_WORDS = new Set([
  'jag',
  'du',
  'hon',
  'han',
  'hen',
  'ni',
  'vi',
  'dom',
  'de',
]);

export type IntentHookInput = {
  user_text: string;
  hint_subject_id?: string;
  context_lang?: string;
  intro_note?: string | null;
  consent?: boolean;
};

export type IntentHookOutput = {
  active_subject_id?: string;
  inject_tokens?: string;
  confidence?: number;
  subject_ctx?: SubjectContext;
  warm_start?: string;
};

const DEFAULT_HINT_CONFIDENCE = 0.65;

export async function intentHook({
  user_text,
  hint_subject_id,
  intro_note,
  consent,
}: IntentHookInput): Promise<IntentHookOutput> {
  const text = user_text ?? "";

  const warm_start =
    intro_note && consent
      ? intro_note.trim().slice(0, 240)
      : undefined;

  if (!text.trim() && !hint_subject_id) {
    return {};
  }

  const names = extractNames(text);

  if (names.length > 0) {
    for (const name of names) {
      const existing = await SubjectCore.findByName(name);
      if (!existing) {
        await SubjectCore.create(name);
      }
    }
    subjectResolver.invalidate();
  }

  const resolved = await subjectResolver.resolve({
    text,
    hint_subject_id,
  });

  let subjectId = resolved?.subject_id;
  let confidence = resolved?.confidence ?? 0;

  if (!subjectId && hint_subject_id) {
    subjectId = hint_subject_id;
    confidence = Math.max(confidence, DEFAULT_HINT_CONFIDENCE);
  }

  if (!subjectId) {
    return {};
  }

  const subject = await SubjectCore.get(subjectId);
  if (!subject) {
    return {};
  }

  await SubjectCore.touch(subject.subject_id);

  const ctx = buildSubjectContext(subject);
  const tokens = formatSubjectTokens(ctx);

  return {
    active_subject_id: subject.subject_id,
    inject_tokens: tokens,
    confidence,
    subject_ctx: ctx,
    warm_start,
  };
}

function extractNames(text: string): string[] {
  const matches = text.match(NAME_REGEX) ?? [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of matches) {
    const normalized = capitalize(match.trim());
    const key = normalized.toLowerCase();
    if (STOP_WORDS.has(key)) continue;
    if (!seen.has(key)) {
      seen.add(key);
      names.push(normalized);
    }
  }
  return names;
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
