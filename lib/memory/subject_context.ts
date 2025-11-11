import { Subject } from "./subject_memory";

export type SubjectContext = {
  subject_id: string;
  primary_name: string;
  pronouns?: string;
  trust_score?: number;
  last_seen_ts: string;
  aliases: string[];
};

export function buildSubjectContext(subject: Subject): SubjectContext {
  return {
    subject_id: subject.subject_id,
    primary_name: subject.primary_name,
    pronouns: subject.pronouns,
    trust_score: subject.trust_score,
    last_seen_ts: subject.last_seen_ts,
    aliases: subject.aliases.map((alias) => alias.value),
  };
}

export function formatSubjectTokens(ctx: SubjectContext): string {
  const fields: string[] = [
    `subject_id:${ctx.subject_id}`,
    `namn:${ctx.primary_name}`,
  ];

  if (ctx.pronouns) {
    fields.push(`pronomen:${ctx.pronouns}`);
  }

  if (typeof ctx.trust_score === "number") {
    fields.push(`trust:${Math.round(ctx.trust_score * 100)}`);
  }

  if (ctx.aliases.length > 0) {
    fields.push(`alias:${ctx.aliases.join("|")}`);
  }

  return `[[CTX:${fields.join(";")}]]`;
}
