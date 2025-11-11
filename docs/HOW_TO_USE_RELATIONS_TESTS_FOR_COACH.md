# Konvertera Relations Golden Tests till Coach Tests

## Översikt

Du har **1,240 golden test cases** för relations-analys. Denna guide visar hur du konverterar och använder dem för att testa AI coachen.

## Skillnader mellan Relations Tests och Coach Tests

### Relations Tests (nuvarande)
- **Syfte**: Testa relations-analys (attachment styles, risk flags, recommendations)
- **Format**: JSONL med `input.text` och `expected.attachment_style`, `expected.top_reco`, etc.
- **Output**: Analys-resultat (flags, spans, safety)

### Coach Tests (behövs)
- **Syfte**: Testa coach-replies (intent, tone, questions, teacher scores)
- **Format**: TypeScript med `input.msg`, `input.conversation`, `expected.intent`, `expected.reply_contains`, etc.
- **Output**: Coach-reply (text, mood, teacher review)

## Konverteringsstrategi

### 1. Automatisk konvertering (rekommenderas)

Ett script konverterar relations JSONL → coach test cases:

```typescript
// Input: relations golden test
{
  "id": "G001",
  "input": { "text": "Det känns som att jag alltid jagar dig för svar..." },
  "expected": { "attachment_style": "orolig", "top_reco": ["Beskriv mönster"] }
}

// Output: coach golden test
{
  id: 'relations_G001',
  input: {
    msg: 'Det känns som att jag alltid jagar dig för svar...',
    conversation: []
  },
  expected: {
    intent: 'probe', // eller 'ground' baserat på text
    reply_contains: ['mönster', 'känns'], // från top_reco eller text
    question_count: 1,
    teacher_score_min: 7.0
  }
}
```

### 2. Manuell mappning (för specifika cases)

För viktiga scenarion kan du manuellt definiera expected coach-responses:

```typescript
{
  id: 'relations_G001_coach',
  input: {
    msg: 'Det känns som att jag alltid jagar dig för svar...',
    conversation: []
  },
  expected: {
    intent: 'probe',
    reply_contains: ['mönster', 'känns', 'jagar'],
    reply_not_contains: ['Jag hör att du jagar'],
    question_count: 1,
    teacher_score_min: 7.5
  }
}
```

## Implementation

### Steg 1: Skapa konverterare

```typescript
// lib/coach/convert_relations_tests.ts
import { GoldenTest } from './golden_tests';

interface RelationsTest {
  id: string;
  level: string;
  input: { lang: string; text: string };
  expected: {
    attachment_style?: string;
    ethics_check?: string;
    risk_flags?: string[];
    tone_target?: string;
    top_reco?: string[];
  };
}

export function convertRelationsToCoachTest(relationsTest: RelationsTest): GoldenTest {
  const text = relationsTest.input.text.toLowerCase();
  
  // Detektera intent baserat på text
  let intent: 'greeting' | 'clarify' | 'ground' | 'speak_goal' | 'generic' | 'probe' = 'generic';
  if (/^hej|tjena|hallå/.test(text)) intent = 'greeting';
  else if (/vad menar du|förstår inte/.test(text)) intent = 'clarify';
  else if (/känns|känsla|mår/.test(text)) intent = 'ground';
  else if (/vill|ska|försöker|hjälp/.test(text)) intent = 'speak_goal';
  else if (text.length < 50) intent = 'probe';
  
  // Extrahera keywords från top_reco eller text
  const replyContains: string[] = [];
  if (relationsTest.expected.top_reco) {
    relationsTest.expected.top_reco.forEach(reco => {
      const words = reco.toLowerCase().split(/\s+/);
      replyContains.push(...words.filter(w => w.length > 4));
    });
  }
  
  // Lägg till keywords från text
  const textWords = text.split(/\s+/).filter(w => w.length > 4);
  replyContains.push(...textWords.slice(0, 3));
  
  return {
    id: `relations_${relationsTest.id}`,
    name: `Relations ${relationsTest.level}: ${relationsTest.id}`,
    input: {
      msg: relationsTest.input.text,
      conversation: [],
      consent: true,
    },
    expected: {
      blocked: relationsTest.expected.risk_flags?.length > 0,
      intent,
      reply_contains: [...new Set(replyContains)].slice(0, 5),
      question_count: 1,
      teacher_score_min: 7.0,
    },
    description: `Konverterad från relations test: ${relationsTest.expected.tone_target || 'standard'}`,
  };
}
```

### Steg 2: Ladda och konvertera alla relations tests

```typescript
// lib/coach/load_relations_golden.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { convertRelationsToCoachTest } from './convert_relations_tests';
import { GoldenTest } from './golden_tests';

export function loadRelationsGoldenTests(level: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'): GoldenTest[] {
  const filePath = join(process.cwd(), 'tests', 'golden', 'relations', level, 'auto1.jsonl');
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  return lines.map(line => {
    const relationsTest = JSON.parse(line);
    return convertRelationsToCoachTest(relationsTest);
  });
}
```

### Steg 3: Kör coach tests på relations data

```typescript
// lib/coach/run_relations_coach_tests.ts
import { loadRelationsGoldenTests } from './load_relations_golden';
import { runGoldenTest } from './golden_tests';

export async function runRelationsCoachTests(level: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond', limit?: number) {
  const tests = loadRelationsGoldenTests(level);
  const limitedTests = limit ? tests.slice(0, limit) : tests;
  
  const results = [];
  let passed = 0;
  let failed = 0;
  
  for (const test of limitedTests) {
    const result = await runGoldenTest(test);
    results.push({ test, result });
    
    if (result.passed) {
      passed++;
    } else {
      failed++;
      console.error(`[FAILED] ${test.name}:`, result.errors);
    }
  }
  
  return { passed, failed, total: limitedTests.length, results };
}
```

## Användning

### 1. Kör alla relations tests som coach tests

```bash
# Via API (kräver att servern körs)
curl http://localhost:3000/api/coach/test-relations-golden?level=gold&limit=10

# Via script
npm run test:coach:relations -- --level=gold --limit=10
```

### 2. Lägg till i coach golden tests

```typescript
// lib/coach/golden_tests.ts
import { loadRelationsGoldenTests } from './load_relations_golden';

// Lägg till relations tests i GOLDEN_TESTS
export const GOLDEN_TESTS: GoldenTest[] = [
  ...existingTests,
  ...loadRelationsGoldenTests('gold').slice(0, 20), // Lägg till första 20 gold-tests
];
```

### 3. CI/CD integration

```yaml
# .github/workflows/ci.yml
- name: Test Coach med Relations Golden Tests
  run: |
    npm run test:coach:relations -- --level=gold --limit=50
```

## Förväntade resultat

### Success criteria

1. **Intent detection**: Coach detekterar rätt intent för ≥80% av relations tests
2. **Reply quality**: Teacher score ≥7.0 för ≥70% av relations tests
3. **Question budget**: Max 1 fråga per reply för ≥95% av tests
4. **Safety**: Alla RED-fall blockeras korrekt

### Exempel output

```
Running Relations Golden Tests (Gold level, limit: 50)
========================================

✅ relations_G001: PASSED (intent: probe, teacher: 7.2)
✅ relations_G002: PASSED (intent: ground, teacher: 7.5)
❌ relations_G003: FAILED
   - Expected intent 'probe' but got 'generic'
   - Teacher score 6.8 < 7.0

Summary:
- Passed: 42/50 (84%)
- Failed: 8/50 (16%)
- Average teacher score: 7.1
```

## Nästa steg

1. **Skapa konverterare** (`lib/coach/convert_relations_tests.ts`)
2. **Skapa loader** (`lib/coach/load_relations_golden.ts`)
3. **Skapa API endpoint** (`app/api/coach/test-relations-golden/route.ts`)
4. **Lägg till npm script** (`package.json`)
5. **Testa med små batches** (t.ex. 10 cases i taget)
6. **Iterera på expected values** baserat på resultat

## Tips

- **Starta smått**: Testa med 10-20 cases först
- **Justera expected values**: Relations tests har inte coach-specifika expected values, så du behöver iterera
- **Fokusera på viktiga scenarion**: Prioritera gold/diamond levels
- **Använd teacher scores**: Låt GPT-5 Teacher bedöma kvaliteten automatiskt
- **Spara resultat**: Logga resultat för att se förbättringar över tid

