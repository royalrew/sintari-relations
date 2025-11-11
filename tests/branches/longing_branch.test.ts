/**
 * Longing Branch Tests
 * 
 * Golden tests för längtan/närhet-grenen.
 * Säkerställer att "Vad vill du börja med?" ALDRIG läcker in i denna gren.
 */

import { orchestrateCoachReply } from '@/lib/coach/orchestrateCoachReply';
import { isLongingBranchInput, containsForbiddenPhrase, FORBIDDEN_PHRASES } from '@/lib/coach/coach_helpers';

describe('Longing Branch - No Reset Phrases', () => {
  const baseConversation = [
    { role: 'user' as const, content: 'Hej', ts: Date.now() },
    { role: 'assistant' as const, content: 'Hej. Jag är här.\n\nVi tar det i den takt som känns rimlig för dig.\n\nVad känns mest i kroppen just nu?', ts: Date.now() },
  ];

  test('longing: önskar → kropps-ankring', async () => {
    const result = await orchestrateCoachReply({
      userMessage: 'Jag önskar att någon håller om mig',
      conversation: baseConversation,
      threadId: 'test-longing-1',
    });

    const replyLower = result.reply.toLowerCase();
    
    // ALDRIG "Vad vill du börja med?"
    expect(replyLower).not.toContain('vad vill du börja med');
    expect(replyLower).not.toContain('det känns oklart nu');
    expect(replyLower).not.toContain('mini-steg');
    
    // Bör innehålla kropps-ankring eller längtan-fokus
    expect(replyLower).toMatch(/kroppen|känns|närhet|längtan|hållen/i);
  });

  test('longing: nära → fördjupning, ej reset', async () => {
    const conversation = [
      ...baseConversation,
      { role: 'user' as const, content: 'Jag önskar att någon håller om mig', ts: Date.now() },
      { role: 'assistant' as const, content: 'Okej. Jag hör dig.\n\nAtt önska att någon håller om en är något mjukt och mänskligt.\n\nOm du känner in det nu — känns det mer som saknad, eller som att du vill vara nära någon just nu?', ts: Date.now() },
    ];

    const result = await orchestrateCoachReply({
      userMessage: 'nära',
      conversation,
      threadId: 'test-longing-2',
    });

    const replyLower = result.reply.toLowerCase();
    
    // ALDRIG reset-fraser
    expect(replyLower).not.toContain('vad vill du börja med');
    expect(replyLower).not.toContain('det känns oklart nu');
    
    // Bör fördjupa längtan/närhet
    expect(replyLower).toMatch(/nära|specifik|allmänt|hållen/i);
  });

  test('longing: specifik → attachment exploration', async () => {
    const conversation = [
      ...baseConversation,
      { role: 'user' as const, content: 'Jag önskar att någon håller om mig', ts: Date.now() },
      { role: 'assistant' as const, content: 'Okej. Jag hör dig.\n\nAtt önska att någon håller om en är något mjukt och mänskligt.\n\nOm du känner in det nu — känns det mer som saknad, eller som att du vill vara nära någon just nu?', ts: Date.now() },
      { role: 'user' as const, content: 'nära', ts: Date.now() },
      { role: 'assistant' as const, content: 'Okej. Jag hör dig. Att längta efter närhet är något mjukt.\n\nNär du känner in det nu — är det mer att du vill vara nära någon specifik person, eller är det mer som ett allmänt behov av att bli hållen?', ts: Date.now() },
    ];

    const result = await orchestrateCoachReply({
      userMessage: 'specifik',
      conversation,
      threadId: 'test-longing-3',
    });

    const replyLower = result.reply.toLowerCase();
    
    // ALDRIG reset-fraser
    expect(replyLower).not.toContain('vad vill du börja med');
    
    // Bör utforska attachment
    expect(replyLower).toMatch(/person|saknar|nära|önskar/i);
  });

  test('longing: önskar → närhet-kvalitet', async () => {
    const conversation = [
      ...baseConversation,
      { role: 'user' as const, content: 'Jag önskar att någon håller om mig', ts: Date.now() },
      { role: 'assistant' as const, content: 'Okej. Jag hör dig.\n\nAtt önska att någon håller om en är något mjukt och mänskligt.\n\nOm du känner in det nu — känns det mer som saknad, eller som att du vill vara nära någon just nu?', ts: Date.now() },
      { role: 'user' as const, content: 'nära', ts: Date.now() },
      { role: 'assistant' as const, content: 'Okej. Jag hör dig. Att längta efter närhet är något mjukt.\n\nNär du känner in det nu — är det mer att du vill vara nära någon specifik person, eller är det mer som ett allmänt behov av att bli hållen?', ts: Date.now() },
      { role: 'user' as const, content: 'specifik', ts: Date.now() },
      { role: 'assistant' as const, content: 'Okej. När du känner att det är en specifik person — vem är det du tänker på? Du behöver inte säga namn. Är det någon du saknar, någon du är nära nu, eller någon du önskar att vara nära?', ts: Date.now() },
    ];

    const result = await orchestrateCoachReply({
      userMessage: 'önskar',
      conversation,
      threadId: 'test-longing-4',
    });

    const replyLower = result.reply.toLowerCase();
    
    // ALDRIG reset-fraser
    expect(replyLower).not.toContain('vad vill du börja med');
    
    // Bör fråga om närhet-kvalitet
    expect(replyLower).toMatch(/närhet|mjuk|varm|hållande|kroppen/i);
  });

  test('longing: saknar → kropps-ankring', async () => {
    const result = await orchestrateCoachReply({
      userMessage: 'Jag saknar någon',
      conversation: baseConversation,
      threadId: 'test-longing-5',
    });

    const replyLower = result.reply.toLowerCase();
    
    // ALDRIG reset-fraser
    expect(replyLower).not.toContain('vad vill du börja med');
    
    // Bör ankra i kroppen
    expect(replyLower).toMatch(/kroppen|känns/i);
  });
});

describe('Longing Branch - Intent Detection', () => {
  test('isLongingBranchInput detects önskar', () => {
    expect(isLongingBranchInput('Jag önskar att någon håller om mig')).toBe(true);
    expect(isLongingBranchInput('önskar')).toBe(true);
    expect(isLongingBranchInput('jag önskar')).toBe(true);
  });

  test('isLongingBranchInput detects saknar', () => {
    expect(isLongingBranchInput('Jag saknar någon')).toBe(true);
    expect(isLongingBranchInput('saknar')).toBe(true);
  });

  test('isLongingBranchInput detects nära', () => {
    expect(isLongingBranchInput('Jag vill vara nära')).toBe(true);
    expect(isLongingBranchInput('nära')).toBe(true);
  });

  test('isLongingBranchInput detects bli hållen', () => {
    expect(isLongingBranchInput('Jag vill bli hållen')).toBe(true);
    expect(isLongingBranchInput('höll om mig')).toBe(true);
    expect(isLongingBranchInput('håller om mig')).toBe(true);
  });

  test('isLongingBranchInput does not detect non-longing', () => {
    expect(isLongingBranchInput('Jag är sur')).toBe(false);
    expect(isLongingBranchInput('Hej')).toBe(false);
    expect(isLongingBranchInput('Vad vill du börja med?')).toBe(false);
  });
});

describe('Longing Branch - Forbidden Phrases', () => {
  test('containsForbiddenPhrase detects reset phrases', () => {
    expect(containsForbiddenPhrase('Vad vill du börja med?')).toBe(true);
    expect(containsForbiddenPhrase('Det känns oklart nu, jag är med.')).toBe(true);
    expect(containsForbiddenPhrase('Vill du ta fram ett första mini-steg')).toBe(true);
  });

  test('containsForbiddenPhrase does not detect normal phrases', () => {
    expect(containsForbiddenPhrase('Var i kroppen känns det?')).toBe(false);
    expect(containsForbiddenPhrase('Okej. Jag hör dig.')).toBe(false);
    expect(containsForbiddenPhrase('När du känner in det nu —')).toBe(false);
  });
});

