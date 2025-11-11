/**
 * Router Core - Generisk router som stödjer overrides för templates/rules/persona
 * Återanvänds av både coach och HR-agent
 */

import { extractSlots, detectMood, detectChoice, detectIntent, Slots } from '../detectors';
import { reply } from '../reply_core';
import { withReplyMeta, lastReplyMeta, stripQuestions, ensureSingleQuestion, nonRepeatOk, lastMood } from '../reply_utils';

export interface RouterCoreParams {
  userMessage: string;
  conversation: Array<{ role: 'user' | 'assistant'; content: string; ts?: number }>;
  intent?: string;
  mood?: 'red' | 'yellow' | 'neutral' | 'plus';
  hints?: any;
  persona?: {
    warmth?: number;
    formality?: number;
    tone?: string;
    scope?: string;
  };
  agent?: 'coach' | 'hr';
  templatesOverride?: Record<string, string>;
  rulesOverride?: Array<{ id: string; match: string; template: string }>;
}

export interface RouterCoreResult {
  reply: string;
  intent: string;
  mood: 'red' | 'yellow' | 'neutral' | 'plus';
}

/**
 * Generisk router-core som kan användas av både coach och HR
 */
export function routeCore(params: RouterCoreParams): RouterCoreResult {
  const { userMessage, conversation, intent, mood, hints, persona, agent = 'coach', templatesOverride, rulesOverride } = params;
  
  const msg = userMessage || '';
  const conv = conversation || [];
  
  // Om HR-agent och rulesOverride finns, kontrollera HR-specifika matchers först
  if (agent === 'hr' && rulesOverride) {
    try {
      const hrMatchers = require('../../hr/engine/matchers');
      const { workRumour, workBoundary, workFeedback, workStress } = hrMatchers || {};
      
      if (workRumour) {
        // Testa HR-matchers i prioritetsordning
        const hrRumour = workRumour(msg);
        if (hrRumour) {
          const template = templatesOverride?.['hr.rumour.check'];
          if (template) {
            return {
              reply: template,
              intent: 'work_rumour',
              mood: detectMood(msg),
            };
          }
        }
        
        const hrBoundary = workBoundary(msg);
        if (hrBoundary) {
          const template = templatesOverride?.['hr.boundary.ask'];
          if (template) {
            return {
              reply: template,
              intent: 'work_boundary',
              mood: detectMood(msg),
            };
          }
        }
        
        const hrFeedback = workFeedback(msg);
        if (hrFeedback) {
          const template = templatesOverride?.['hr.feedback.ask'];
          if (template) {
            return {
              reply: template,
              intent: 'work_feedback',
              mood: detectMood(msg),
            };
          }
        }
        
        const hrStress = workStress(msg);
        if (hrStress) {
          const template = templatesOverride?.['hr.stress.selfcare'];
          if (template) {
            return {
              reply: template,
              intent: 'work_stress',
              mood: detectMood(msg),
            };
          }
        }
      }
    } catch (e) {
      // Om HR-matchers inte finns eller kraschar, fortsätt med standard routing
      console.warn('[Router Core] HR matchers failed, using standard routing:', e);
    }
  }
  
  // Standard routing (återanvänd kärnan)
  const slots = extractSlots(msg);
  const detectedMood = detectMood(msg);
  const choice = detectChoice(msg);
  const meta = lastReplyMeta(conversation);
  const detectedIntent = detectIntent(msg, meta);
  
  let finalMood = mood || detectedMood;
  const finalIntent = intent || detectedIntent;
  
  // Generera svar med den generella reply-funktionen
  let out = reply({ intent: finalIntent, mood: finalMood, slots });
  
  // Anti-repeat + 1-fråga-regel
  out = ensureSingleQuestion(stripQuestions(out));
  const last = conv.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
  const lastClean = last.replace(/<!-- reply_meta:.*?-->/g, '').trim();
  const outClean = out.replace(/<!-- reply_meta:.*?-->/g, '').trim();
  if (!nonRepeatOk(lastClean, outClean)) {
    out = out.replace(/\bVill du\b/, 'Ska vi') || out + '\n(vi tar nästa steg)';
  }
  
  // Mood-repair
  const prevMood = lastMood(conv);
  const moodDrop = prevMood === 'plus' && (finalMood === 'yellow' || finalMood === 'neutral');
  if (moodDrop) {
    out = `Det där landade fel, förlåt. Vi fortsätter på din positiva energi.\n\n` + out;
  }
  
  // Lägg till metadata
  const finalReply = withReplyMeta(out, finalIntent, `${finalMood}_${slots.action ? 'action' : 'no_action'}`, finalMood);
  
  return {
    reply: finalReply,
    intent: finalIntent,
    mood: finalMood,
  };
}

