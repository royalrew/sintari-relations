// lib/coach/crisis_templates.ts

/**
 * Crisis Templates - Stabiliserade kris-svar som går genom coach-pipeline
 * Ton: Stödjande, närvarande, trygg
 */

export interface CrisisTemplateParams {
  country?: string;
  jurisdiction?: string;
  language?: string;
}

/**
 * Stabiliserad crisis-template för Sverige
 * Används när crisis_router detekterar akut risk
 */
export function crisisStabilize(params: CrisisTemplateParams = {}): string {
  const { country = 'SE', jurisdiction = 'SE', language = 'sv' } = params;
  
  // Sverige-specifik template
  if (country === 'SE' || jurisdiction === 'SE') {
    return crisisStabilizeSE();
  }
  
  // Generisk template för andra länder
  return `Jag är här med dig nu. Det du beskriver är väldigt tungt, och du ska inte bära det ensam.

Om du är i omedelbar fara – ring 112 direkt.

Om du behöver prata live med någon, kontakta din lokala krislinje eller vårdcentral.

Vi tar ett steg i taget här i chatten.

Just nu – känns det mest tryck, tomhet eller spänning i kroppen?`;
}

/**
 * Sverige-specifik kris-template
 * Undviker löften om ständig närvaro ("Jag lämnar dig inte")
 */
export const crisisStabilizeSE = () => `Jag är här med dig nu. Det du beskriver är väldigt tungt, och du ska inte bära det ensam.

Om du är i omedelbar fara – ring 112 direkt.

Om du behöver prata live med någon:
Sverige: 90101 (Mind Självmordslinjen)
Chat: https://mind.se

Vi tar ett steg i taget här i chatten.
Just nu – känns det mest tryck, tomhet eller spänning i kroppen?`;

/**
 * Extrahera jurisdiction från crisis_plan om tillgängligt
 */
export function extractJurisdiction(crisisPlan: any): string {
  if (crisisPlan?.jurisdiction) {
    return crisisPlan.jurisdiction;
  }
  if (crisisPlan?.resources && Array.isArray(crisisPlan.resources)) {
    // Försök hitta jurisdiction från resurser
    for (const resource of crisisPlan.resources) {
      if (resource?.country) {
        return resource.country;
      }
    }
  }
  return 'SE'; // Default
}

