# GPT-5 Teacher: Automatiserad kvalitetsövervakare

## Översikt

GPT-5 Teacher är en automatiserad kvalitetsövervakare som använder GPT-5 för att bedöma coachens svar och ge konstruktiv feedback. GPT-5 är vald specifikt för dess överlägsna förståelse av relationer och mänsklig kommunikation. Detta eliminerar behovet av manuell testning och ger kontinuerlig förbättring.

## Funktioner

### 1. Automatisk kvalitetsbedömning
- Bedömer varje coach-svar på 7 kriterier (0-10 poäng):
  - **Naturalness**: Känns svaret naturligt och mänskligt?
  - **Empathy**: Visar svaret empati och förståelse?
  - **Relevance**: Är svaret relevant för användarens input?
  - **Clarity**: Är svaret tydligt och lätt att förstå?
  - **Tone**: Matchar tonen coachens persona?
  - **Actionability**: Ger svaret konkreta, handlingsbara steg?
  - **NonCoercive**: Undviker svaret att vara påträngande?

### 2. Konstruktiv feedback
- Identifierar styrkor och svagheter
- Ger konkreta förbättringsförslag
- Flaggar mönster (t.ex. upprepning, för generellt)

### 3. Kontinuerlig förbättring
- Loggar alla bedömningar för analys
- Identifierar trender över tid
- Ger insikter för systemförbättringar

## Installation

1. **Sätt miljövariabler** i `.env.local`:
```bash
OPENAI_API_KEY=your_openai_api_key
ENABLE_QUALITY_TEACHER=true
OPENAI_TEACHER_MODEL=gpt-5  # GPT-5 för expertförståelse av relationer
NEXT_PUBLIC_BASE_URL=http://localhost:3000  # eller din produktions-URL
```

2. **Installera OpenAI SDK** (om inte redan installerat):
```bash
npm install openai
```

## Användning

### Automatisk bakgrundsbedömning

Teacher körs automatiskt i bakgrunden när `ENABLE_QUALITY_TEACHER=true` är satt. Varje coach-svar bedöms asynkront utan att påverka svarstiden.

### Manuell bedömning

Du kan också anropa teacher API direkt:

```typescript
const response = await fetch('/api/coach/quality-teacher', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userInput: "Hej",
    coachReply: "Hej! Jag är här och lyssnar.",
    context: {
      conversationLength: 1,
      turnNumber: 1,
    },
  }),
});

const { review } = await response.json();
console.log('Kvalitetspoäng:', review.feedback.overallScore);
console.log('Svagheter:', review.feedback.weaknesses);
```

### Dashboard

Använd `QualityTeacherDashboard`-komponenten för att visa statistik:

```tsx
import { QualityTeacherDashboard } from "@/components/coach/QualityTeacherDashboard";

<QualityTeacherDashboard />
```

## API Endpoints

### POST `/api/coach/quality-teacher`

Bedömer ett coach-svar.

**Request body:**
```json
{
  "userInput": "Användarens meddelande",
  "coachReply": "Coachens svar",
  "context": {
    "conversationLength": 5,
    "turnNumber": 3,
    "insightsUsed": {}
  }
}
```

**Response:**
```json
{
  "success": true,
  "review": {
    "feedback": {
      "overallScore": 7.5,
      "criteria": {
        "naturalness": 8,
        "empathy": 7,
        "relevance": 9,
        "clarity": 8,
        "tone": 8,
        "actionability": 6,
        "nonCoercive": 9
      },
      "strengths": ["Bra spegling", "Varm ton"],
      "weaknesses": ["För generellt"],
      "suggestions": ["Använd mer specifik spegling"],
      "patternFlags": ["too_generic"],
      "severity": "warn"
    },
    "timestamp": 1234567890
  }
}
```

## Kostnad

GPT-5 prissättning kommer att annonseras när modellen släpps. Kostnaden är värd investeringen för expertförståelse av relationer och mänsklig kommunikation.

En bedömning använder typiskt:
- Input: ~500 tokens
- Output: ~200 tokens

**Förväntad kostnad per bedömning:**
- GPT-5: Kommer att annonseras vid release

För 1000 bedömningar/dag kommer kostnaden att vara proportionell till GPT-5:s prissättning.

## Framtida förbättringar

- [ ] Databaslagring för historisk analys
- [ ] Automatiska förbättringsförslag till system prompts
- [ ] A/B-testing av olika prompt-varianter
- [ ] Real-time varningar vid låg kvalitet
- [ ] Aggregerad statistik över tid
- [ ] Integration med CI/CD för automatisk testning

## Felsökning

**Teacher körs inte:**
- Kontrollera att `ENABLE_QUALITY_TEACHER=true` är satt
- Kontrollera att `OPENAI_API_KEY` är korrekt
- Kontrollera konsolen för felmeddelanden

**Timeout-fel:**
- Öka timeout i `quality_teacher.ts` (standard: 20s)
- Kontrollera nätverksanslutning

**Låg kvalitetspoäng:**
- Granska feedback från teacher
- Uppdatera system prompts baserat på förslag
- Testa olika prompt-varianter

