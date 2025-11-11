import { SHOW_INTERJECTION } from "@/lib/copy/warm_config";
import { allowInterjection } from "@/lib/state/interjection_store";
import { resolveTod } from "@/lib/time/tod";
import { logWarm } from "@/lib/telemetry/warm_log";

const openings = [
  "Hej och välkommen in i värmen.",
  "Hej, fint att du är här.",
  "Varmt välkommen in. Ta din tid.",
  "Hej! Skönt att du hittade hit.",
  "Hej, jag är här med dig.",
  "Hej {namn}, välkommen tillbaka.",
  "God {tod}, kom in i värmen.",
  "Hej, vi tar det lugnt och tryggt här.",
] as const;

const hrOpening = "Hej och välkommen. Jag är här för att stötta er på jobbet – tryggt och respektfullt.";

const interjections = [
  "Hmm… jag tänker att",
  "Okej… jag hör dig, och jag funderar på",
  "Mmm… det låter som att",
  "Jag vill bara känna in:",
] as const;

const softQuestions = [
  "Hur känns det just nu, på riktigt?",
  "Vad skulle vara skönt att börja med?",
  "Vill du berätta lite om vad som hänt?",
  "Vad hoppas du få ut av samtalet idag?",
] as const;

const farewells = [
  "Tack för denna gången. Jag finns alltid här för dig.",
  "Tack för att du delade. Du är alltid välkommen tillbaka.",
  "Vi rundar av här. Ta hand om dig – jag finns kvar när du vill.",
  "Tack. När du vill fortsätta, skriv bara ‘hej’ igen.",
] as const;

const hrFarewell = "Tack för idag. Jag finns här för er och kan hjälpa med nästa steg när ni vill.";

const crisisFarewell =
  "Tack för att du berättar. Det här låter allvarligt. Om du är i akut fara – ring 112. Jag kan även lista stödresurser om du vill.";

export type WarmCopyCtx = {
  name?: string;
  isReturn?: boolean;
  tod?: "morgon" | "eftermiddag" | "kväll";
  mode?: "personal" | "hr";
  risk?: "SAFE" | "RED";
  lastInterjectionAt?: number;
  turn?: number;
};

function fill(template: string, ctx: WarmCopyCtx) {
  return template
    .replace("{namn}", ctx.name ?? "")
    .replace("{tod}", ctx.tod ?? "dag");
}

function randomPick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function summarize(text?: string): string {
  if (!text) return "";
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > 160 ? `${normalized.slice(0, 157)}…` : normalized;
}

export function pickOpening(ctx: WarmCopyCtx) {
  if (ctx.mode === "hr") return hrOpening;

  if (ctx.isReturn && ctx.name) {
    return fill(openings[5], ctx);
  }

  if (ctx.tod) {
    return fill(openings[6], ctx);
  }

  return randomPick(openings.map((s) => fill(s, ctx)));
}

export function maybeInterjection(ctx: WarmCopyCtx) {
  if (!SHOW_INTERJECTION) return "";
  const turn = ctx.turn ?? 1;
  if (turn < 2) return "";

  const last = ctx.lastInterjectionAt ?? -Infinity;
  if (turn - last < 6) return "";
  if (!allowInterjection(turn)) return "";

  const chosen = randomPick(interjections);
  return `${chosen}…`;
}

export function pickSoftQuestion() {
  return randomPick(softQuestions);
}

export function pickFarewell(ctx: WarmCopyCtx) {
  const enriched = { ...ctx };
  if (!enriched.tod) enriched.tod = resolveTod();

  let text: string;
  if (enriched.mode === "hr") text = hrFarewell;
  else if (enriched.risk === "RED") text = crisisFarewell;
  else text = randomPick(farewells);

  logWarm({
    ts: new Date().toISOString(),
    kind: "farewell",
    mode: enriched.mode,
    risk: enriched.risk,
    tod: enriched.tod,
    usedInterjection: false,
  });

  return text;
}

export function buildGreeting(ctx: WarmCopyCtx & { turn?: number; lastInterjectionAt?: number }) {
  const enriched: WarmCopyCtx & { tod?: "morgon" | "eftermiddag" | "kväll" } = { ...ctx };
  if (!enriched.tod) enriched.tod = resolveTod();

  const intro = pickOpening(enriched);
  const think = maybeInterjection(enriched);
  const question = pickSoftQuestion();
  const secondLine = think ? `${think} ${question}` : question;
  const text = `${intro}\n${secondLine}`.trim();

  logWarm({
    ts: new Date().toISOString(),
    kind: "greeting",
    mode: enriched.mode,
    risk: enriched.risk,
    tod: enriched.tod,
    usedInterjection: Boolean(think),
  });

  return text;
}

export function buildFollowup(
  ctx: WarmCopyCtx & { turn?: number; lastInterjectionAt?: number },
  userText?: string,
): { text: string; usedInterjection: boolean } {
  const enriched: WarmCopyCtx & { turn?: number } = { ...ctx };
  if (!enriched.tod) enriched.tod = resolveTod();

  const interjection = maybeInterjection(enriched);
  const snippet = summarize(userText);
  const ack = snippet ? `Jag hör dig när du säger "${snippet}".` : "Jag hör dig.";
  const question = pickSoftQuestion();
  const parts = [] as string[];
  if (interjection) parts.push(interjection);
  parts.push(ack);
  parts.push(question);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return { text, usedInterjection: Boolean(interjection) };
}
