/**
 * Anger Branch Tests
 * 
 * Golden tests för ilska-grenen.
 * Säkerställer att "Vad vill du börja med?" ALDRIG läcker in i denna gren.
 */

import { orchestrateCoachReply } from '@/lib/coach/orchestrateCoachReply';
import { isAngerBranchInput, ANGER_FORBIDDEN } from '@/lib/coach/coach_helpers';

describe('Anger Branch - No Reset Phrases', () => {
  const baseConversation = [
    { role: 'user' as const, content: 'Hej', ts: Date.now() },
    { role: 'assistant' as const, content: 'Hej. Jag är här.\n\nVi tar det i den takt som känns rimlig för dig.\n\nVad känns mest i kroppen just nu?', ts: Date.now() },
  ];

  test('anger: sur → kroppslokalisering', async () => {
    const result = await orchestrateCoachReply({
      userMessage: 'jag är sur',
      conversation: baseConversation,
      threadId: 'test-anger-1',
    });

    const replyLower = result.reply.toLowerCase();
    
    // ALDRIG "Vad vill du börja med?"
    expect(replyLower).not.toContain('vad vill du börja med');
    expect(replyLower).not.toContain('det känns oklart nu');
    expect(replyLower).not.toContain('härligt! det här betyder något');
    
    // Bör innehålla kroppslokalisering
    expect(replyLower).toMatch(/var känns det mest|bröstet|magen|halsen/i);
  });

  test('anger: gräns → val av hållning vs språk', async () => {
    const conversation = [
      ...baseConversation,
      { role: 'user' as const, content: 'jag är arg', ts: Date.now() },
      { role: 'assistant' as const, content: 'Okej. Tack för att du säger det. Vi landar först i kroppen.\n\nVar känns det mest just nu – bröstet, magen, halsen eller någon annanstans?', ts: Date.now() },
      { role: 'user' as const, content: 'bröst', ts: Date.now() },
      { role: 'assistant' as const, content: 'Okej. Bröstet bär mycket. Om du andas långsamt där – känns det mer tryck, värme eller brännande?', ts: Date.now() },
      { role: 'user' as const, content: 'brännande', ts: Date.now() },
      { role: 'assistant' as const, content: 'Tack. Vi ska inte trycka bort det. Ibland säger ilska: \'något viktigt hände\'. Känns det som att **en gräns passerats**, **något varit orättvist**, eller **att du blivit överväldigad**?', ts: Date.now() },
    ];

    const result = await orchestrateCoachReply({
      userMessage: 'gräns',
      conversation,
      threadId: 'test-anger-2',
    });

    const replyLower = result.reply.toLowerCase();
    
    // ALDRIG reset-fraser
    expect(replyLower).not.toContain('vad vill du börja med');
    
    // Bör erbjuda val mellan hållning och språk
    expect(replyLower).toMatch(/stanna i känslan|vänligt gräns-språk/i);
  });

  test('anger: irriterad → kroppslokalisering', async () => {
    const result = await orchestrateCoachReply({
      userMessage: 'jag är irriterad',
      conversation: baseConversation,
      threadId: 'test-anger-3',
    });

    const replyLower = result.reply.toLowerCase();
    
    // ALDRIG reset-fraser
    expect(replyLower).not.toContain('vad vill du börja med');
    
    // Bör ankra i kroppen
    expect(replyLower).toMatch(/var känns det mest|bröstet|magen|halsen/i);
  });
});

describe('Anger Branch - Intent Detection', () => {
  test('isAngerBranchInput detects sur', () => {
    expect(isAngerBranchInput('Jag är sur')).toBe(true);
    expect(isAngerBranchInput('sur')).toBe(true);
    expect(isAngerBranchInput('jag är sur')).toBe(true);
  });

  test('isAngerBranchInput detects irriterad', () => {
    expect(isAngerBranchInput('Jag är irriterad')).toBe(true);
    expect(isAngerBranchInput('irriterad')).toBe(true);
  });

  test('isAngerBranchInput detects arg', () => {
    expect(isAngerBranchInput('Jag är arg')).toBe(true);
    expect(isAngerBranchInput('arg')).toBe(true);
  });

  test('isAngerBranchInput detects frustrerad', () => {
    expect(isAngerBranchInput('Jag är frustrerad')).toBe(true);
    expect(isAngerBranchInput('frustrerad')).toBe(true);
  });

  test('isAngerBranchInput does not detect non-anger', () => {
    expect(isAngerBranchInput('Jag är ledsen')).toBe(false);
    expect(isAngerBranchInput('Hej')).toBe(false);
    expect(isAngerBranchInput('Vad vill du börja med?')).toBe(false);
  });
});

describe('Anger Branch - Forbidden Phrases', () => {
  test('ANGER_FORBIDDEN contains reset phrases', () => {
    expect(ANGER_FORBIDDEN).toContain('vad vill du börja med?');
    expect(ANGER_FORBIDDEN).toContain('det känns oklart nu, jag är med.');
    expect(ANGER_FORBIDDEN).toContain('vill du att vi tar fram ett första mini-steg');
    expect(ANGER_FORBIDDEN).toContain('härligt! det här betyder något för dig.');
  });
});

