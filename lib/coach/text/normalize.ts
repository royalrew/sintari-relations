/**
 * Text Normalization Utilities
 * 
 * SINGLE-SOURCE: ändra bara i denna modul. Om du läser detta i en annan fil är det en bugg.
 * 
 * Normaliserar text för robust matching, hanterar diakritik och lemma-variationer.
 */

/* SINGLE-SOURCE: ändra bara i modulen. Om du läser detta i en annan fil är det en bugg. */

/**
 * Normalisera text för robust matching
 * - Konverterar till lowercase
 * - Tar bort diakritik (ä→a, ö→o, etc.)
 * - Normaliserar whitespace
 * - Trimmar
 */
export function norm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // ta bort diakritik: ä→a, ö→o
    .replace(/\s+/g, " ")
    .trim();
}

