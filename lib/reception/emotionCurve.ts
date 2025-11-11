export type EmotionCurve = "up" | "down" | "hold" | "flare";

/**
 * Detekterar emotionell kurva från en text
 */
export function detectEmotionCurve(text: string): EmotionCurve {
  const t = text.toLowerCase();

  // Flare: arg, förbannad, skrik, varför alltid
  if (/(arg|förbann|skrik|varför alltid|frustrer|irriter)/.test(t)) return "flare";

  // Down: trött, ork, ledsen, varför ens, inget spelar
  if (/(trött|ork|ledsen|varför ens|inget spelar|utmatt|uppgiven|depp)/.test(t)) return "down";

  // Hold: hm, jag vet inte, kanske, typ
  if (/(hm|jag vet inte|kanske|typ|tja|nja)/.test(t)) return "hold";

  // Up: tack, hjälpte, känns lite bättre, okej
  if (/(tack|hjälpte|känns lite bättre|okej|bra|känns bättre|hjälp)/.test(t)) return "up";

  return "hold";
}

/**
 * Sammanfattar emotionell kurva från historik
 */
export function summariseCurve(curves: EmotionCurve[]): EmotionCurve {
  const last = curves.slice(-6); // Senaste 6 kurvor
  const ups = last.filter((c) => c === "up").length;
  const downs = last.filter((c) => c === "down").length;
  const flares = last.filter((c) => c === "flare").length;

  if (flares > 0) return "flare";
  if (downs > ups) return "down";
  if (ups > downs) return "up";
  return "hold";
}

/**
 * Väljer TON-profil baserat på emotionell kurva
 */
export type ToneProfile = "mjuk-neutral" | "mjuk-varm" | "mjuk-sårbar" | "mjuk-stabiliserande" | "mjuk-bekräftande";

export function chooseToneBasedOnCurve(
  curve: EmotionCurve,
  isOpeningUp: boolean = false,
  hasGoal: boolean = false
): ToneProfile {
  if (curve === "down") return "mjuk-sårbar";
  if (curve === "flare") return "mjuk-stabiliserande";
  if (curve === "up" || hasGoal) return "mjuk-bekräftande";
  if (isOpeningUp) return "mjuk-varm";
  return "mjuk-neutral";
}

/**
 * Genererar svar baserat på TON-profil
 */
function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

type ToneTemplate = (ctx: { mirror: string; snippet: string }) => string;

const toneVariants: Record<ToneProfile, ToneTemplate[]> = {
  "mjuk-neutral": [
    ({ mirror }) => `${mirror} Ta den tid du behöver.`,
    () => "Jag är här och lyssnar – ingen stress överhuvudtaget.",
    () => "Vi kan bara vara här en stund. Du bestämmer tempot.",
  ],
  "mjuk-varm": [
    ({ snippet }) => `Tack för att du delar det där: “${snippet}”. Det betyder något.`,
    ({ mirror }) => `${mirror} Tack för att du delar, det känns viktigt.`,
    () => "Det värmer att du öppnar dig. Vi tar det i din takt.",
  ],
  "mjuk-sårbar": [
    () => "Det där låter tungt. Jag sitter kvar här med dig.",
    ({ mirror }) => `${mirror} Vi tar det steg för steg tillsammans.`,
    ({ snippet }) => `Jag hör hur mycket det rör upp i dig när du skriver “${snippet}”.`,
  ],
  "mjuk-stabiliserande": [
    () => "Vi landar tillsammans. Inget måste bestämmas just nu.",
    () => "Vi tar det lugnt, ett steg i taget. Jag finns vid din sida.",
    ({ mirror }) => `${mirror} Vi kan andas lite och låta det få ta plats.`,
  ],
  "mjuk-bekräftande": [
    () => "Det är fint att du sätter ord på vad som känns viktigt.",
    ({ snippet }) => `Jag hör din riktning i “${snippet}”. Vi kan fortsätta därifrån när du vill.`,
    () => "Tack för att du visar vart du vill. Vi utforskar det tillsammans.",
  ],
};

const optionalInvites: string[] = [
  "Vill du fortsätta berätta, eller ska vi bara sitta en stund?",
  "Vill du dela mer, eller är det okej att pausa här?",
  "Vill du fortsätta, eller ska vi ta en liten paus?",
];

function pickVariant(variants: ToneTemplate[], seed: number, ctx: { mirror: string; snippet: string }): string {
  if (variants.length === 0) return ctx.mirror;
  const template = variants[seed % variants.length];
  return template(ctx);
}

export function generateToneReply(
  profile: ToneProfile,
  userText: string,
  canAskQuestion: boolean
): string {
  const trimmed = userText.trim();
  const snippet = trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed || "";
  const mirror =
    trimmed.length > 160
      ? "Jag hör att det är mycket på en gång."
      : trimmed.length > 60
      ? "Jag hör att det rör sig i dig."
      : "Jag är med dig.";

  const variants = toneVariants[profile] ?? toneVariants["mjuk-neutral"];
  const seed = hashSeed(`${profile}:${trimmed || mirror}`);
  let reply = pickVariant(variants, seed, { mirror, snippet });

  if (canAskQuestion) {
    const inviteSeed = hashSeed(`invite:${trimmed || profile}`);
    const invite = optionalInvites[inviteSeed % optionalInvites.length];
    reply = `${reply} ${invite}`;
  }

  return reply;
}

