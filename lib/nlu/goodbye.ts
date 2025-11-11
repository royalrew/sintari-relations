const BYE_PATTERNS = [
  /\bhej\s*då\b/i,
  /\bhejdå\b/i,
  /\bvi hörs\b/i,
  /\bvi ses\b/i,
  /\btack för idag\b(?!\?)/i,
  /\bnu rundar (vi|jag) av\b/i,
  /\bgtg\b|\bgotta go\b|\bgoodbye\b|\bbye\b/i,
];

const NEG_GUARDS = [
  /hej dåligt/i,
  /inte hejdå/i,
  /ska vi säga hejdå\?/i,
];

export function isGoodbye(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (NEG_GUARDS.some((rx) => rx.test(trimmed))) return false;
  if (/(^|\s)(👋|🙏)\s*$/.test(trimmed)) return true;
  return BYE_PATTERNS.some((rx) => rx.test(trimmed));
}
