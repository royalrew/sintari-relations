/**
 * HR Router - Tunn wrapper runt router-core med HR-specifik konfiguration
 */

import { routeCore, RouterCoreParams } from '../../coach/engine/router';
import { HR_PERSONA } from './persona';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Läs JSON-filer dynamiskt för att undvika import-problem
function loadTemplates(): Record<string, string> {
  try {
    // Försök olika sökvägar för att hitta JSON-filen
    const possiblePaths = [
      join(process.cwd(), 'lib', 'hr', 'config', 'templates_hr.json'),
      join(process.cwd(), 'sintari-relations', 'lib', 'hr', 'config', 'templates_hr.json'),
    ];
    
    for (const templatesPath of possiblePaths) {
      if (existsSync(templatesPath)) {
        try {
          const templatesContent = readFileSync(templatesPath, 'utf-8');
          return JSON.parse(templatesContent);
        } catch {
          continue;
        }
      }
    }
    
    throw new Error('Could not find templates_hr.json');
  } catch (e) {
    console.warn('[HR Router] Failed to load templates, using defaults:', e);
    return {
      'hr.rumour.check': 'Det här rör arbetsklimat. När det händer, vad gör du oftast:\n1) blir tyst\n2) byter ämne\n3) markerar kort?\n(Svara 1/2/3)',
      'hr.boundary.ask': 'Vill du ha en mild eller tydlig markering?\n1) mild\n2) tydlig\n(Svara 1/2)',
      'hr.feedback.ask': 'Vill du be om tid för ett lugnt samtal eller ge en kort markör i stunden?\n1) be om tid\n2) kort markör\n(Svara 1/2)',
      'hr.stress.selfcare': 'Vi börjar med din del. Vad hjälper mest idag:\n1) kort återhämtning (5–10 min)\n2) en sak du kan säga nej till\n(Svara 1/2)',
    };
  }
}

function loadRules(): Array<{ id: string; match: string; template: string }> {
  try {
    // Försök olika sökvägar för att hitta JSON-filen
    const possiblePaths = [
      join(process.cwd(), 'lib', 'hr', 'config', 'rules_hr.json'),
      join(process.cwd(), 'sintari-relations', 'lib', 'hr', 'config', 'rules_hr.json'),
    ];
    
    for (const rulesPath of possiblePaths) {
      if (existsSync(rulesPath)) {
        try {
          const rulesContent = readFileSync(rulesPath, 'utf-8');
          return JSON.parse(rulesContent);
        } catch {
          continue;
        }
      }
    }
    
    throw new Error('Could not find rules_hr.json');
  } catch (e) {
    console.warn('[HR Router] Failed to load rules, using defaults:', e);
    return [
      { id: 'work_rumour', match: 'work_rumour', template: 'hr.rumour.check' },
      { id: 'work_boundary', match: 'work_boundary', template: 'hr.boundary.ask' },
      { id: 'work_feedback', match: 'work_feedback', template: 'hr.feedback.ask' },
      { id: 'work_stress', match: 'work_stress', template: 'hr.stress.selfcare' },
    ];
  }
}

const templates = loadTemplates();
const rules = loadRules();

export interface HRRouterParams {
  userMessage: string;
  conversation: Array<{ role: 'user' | 'assistant'; content: string; ts?: number }>;
  intent?: string;
  mood?: 'red' | 'yellow' | 'neutral' | 'plus';
  hints?: any;
}

export interface HRRouterResult {
  reply: string;
  intent: string;
  mood: 'red' | 'yellow' | 'neutral' | 'plus';
}

/**
 * HR-router som återanvänder core med HR-specifik konfiguration
 */
export function routeHR(params: HRRouterParams): HRRouterResult {
  try {
    return routeCore({
      ...params,
      persona: {
        warmth: HR_PERSONA.warmth,
        formality: HR_PERSONA.formality,
        tone: HR_PERSONA.tone,
        scope: HR_PERSONA.scope,
      },
      templatesOverride: templates,
      rulesOverride: rules,
      agent: 'hr',
    });
  } catch (e) {
    console.error('[HR Router] Error in routeHR:', e);
    throw e;
  }
}

