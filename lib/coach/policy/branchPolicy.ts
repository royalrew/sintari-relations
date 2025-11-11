/**
 * Branch Policy - Forbidden Phrases per Branch
 * 
 * SINGLE-SOURCE: ändra bara i denna modul. Om du läser detta i en annan fil är det en bugg.
 * 
 * Definierar vilka fraser som ALDRIG ska förekomma i varje branch.
 * Detta förhindrar att generiska reset-fraser läcker in i känsliga konversationsflöden.
 */

/* SINGLE-SOURCE: ändra bara i modulen. Om du läser detta i en annan fil är det en bugg. */

export interface BranchPolicy {
  forbid: readonly string[];
  description?: string;
}

/**
 * Branch policies - forbidden phrases per branch
 */
export const BRANCH_POLICY: Record<string, BranchPolicy> = {
  anger: {
    forbid: [
      "vad vill du börja med?",
      "det känns oklart nu, jag är med.",
      "vill du att vi tar fram ett första mini-steg",
      "härligt! det här betyder något för dig.",
    ],
    description: "Ilska-grenen: ALDRIG generiska reset-fraser innan känslan har landat",
  },
  longing: {
    forbid: [
      "vad vill du börja med?",
      "det känns oklart nu, jag är med.",
      "vill du ta fram ett första mini-steg",
      "vad händer oftast precis innan",
      "vill du fokusera på kommunikation, gränser eller närvaro",
    ],
    description: "Längtan-grenen: ALDRIG generiska reset-fraser som bryter anknytning",
  },
} as const;

/**
 * Enforce branch policy - kastar error om forbidden phrase hittas
 * 
 * @param out - Det genererade svaret
 * @param branch - Vilken branch vi är i ('anger' | 'longing' | undefined)
 * @returns Det ursprungliga svaret om inga förbjudna fraser hittas
 * @throws Error om forbidden phrase hittas
 */
export function enforceBranchPolicy(out: string, branch?: string): string {
  if (!branch) {
    return out;
  }
  
  const rules = BRANCH_POLICY[branch];
  if (!rules) {
    return out;
  }
  
  const low = out.toLowerCase();
  const forbiddenFound = rules.forbid.some(f => low.includes(f.toLowerCase()));
  
  if (forbiddenFound) {
    const foundPhrase = rules.forbid.find(f => low.includes(f.toLowerCase()));
    throw new Error(
      `Forbidden reset phrase detected in branch=${branch}: "${foundPhrase}". ` +
      `Must use CSV flow instead of generic fallback.`
    );
  }
  
  return out;
}

/**
 * Kontrollera om text innehåller förbjudna fraser för en specifik branch
 */
export function containsForbiddenPhrase(text: string, branch?: string): boolean {
  if (!branch) {
    return false;
  }
  
  const rules = BRANCH_POLICY[branch];
  if (!rules) {
    return false;
  }
  
  const low = text.toLowerCase();
  return rules.forbid.some(f => low.includes(f.toLowerCase()));
}

