# TON, KURVA & RITUAL - Implementation Summary

**Datum:** 2025-01-30  
**Status:** ✅ Alla komponenter implementerade och integrerade

## 🎯 Implementerade Komponenter

### 1. TON – Fem Emotionella Röstprofiler ✅

**Fil:** `prompts/reception/system.txt`

**Profiler:**
1. **mjuk-neutral** → När ton är okänd
   - "Jag hör dig. Du kan ta din tid här."

2. **mjuk-varm** → När användaren öppnar sig
   - "Tack för att du delar det. Det betyder något."

3. **mjuk-sårbar** → När användaren uttrycker något tungt
   - "Det där låter verkligen tungt. Jag är kvar här med dig."

4. **mjuk-stabiliserande** → När känslor fluktuerar
   - "Vi tar det lugnt, ett steg i taget. Inget måste bestämmas nu."

5. **mjuk-bekräftande** → När användaren uttrycker önskan/mål
   - "Det är fint att du sätter ord på vad som känns viktigt."

**Regler:**
- MAX 1 fråga var tredje tur
- Om inget att fråga: bara spegla + valfritt alternativ
- Tystnad är tillåtet: "Ingen stress. Jag finns kvar."

### 2. KURVA – Emotion Curve Tracking ✅

**Fil:** `lib/reception/emotionCurve.ts`

**Funktioner:**
- `detectEmotionCurve(text)`: Detekterar kurva från text
  - `"flare"`: arg, förbannad, skrik
  - `"down"`: trött, ork, ledsen, uppgiven
  - `"hold"`: hm, vet inte, kanske
  - `"up"`: tack, hjälpte, känns bättre

- `summariseCurve(curves)`: Sammanfattar från historik (senaste 6)
- `chooseToneBasedOnCurve(curve, isOpeningUp, hasGoal)`: Väljer TON-profil
- `generateToneReply(profile, userText, canAskQuestion)`: Genererar svar

**Integration:**
- Efter varje USER_MESSAGE: detekterar kurva och uppdaterar historik
- Väljer TON-profil baserat på sammanfattad kurva
- Genererar svar med rätt profil

### 3. RITUAL – Tre Mikroverktyg ✅

**Fil:** `components/reception/RitualChips.tsx`

**Verktyg:**
1. **Andas en stund** → "Okej. Vi tar 2 lugna andetag. Ingen instruktion. Bara var här."
2. **Vi pausar lite** → "Jag är kvar här. Du behöver inte svara än."
3. **Mark-kontakt** → "Känn hur kroppen vilar mot stolen eller golvet. Ingen prestation."

**Integration:**
- Visas som valfria chips under input-fältet
- Användaren väljer när hen vill
- Aldrig push, bara val

### 4. State Machine Integration ✅

**Uppdaterad logik i `onSend()`:**

```typescript
// KURVA: Detektera emotionell kurva
const curve = detectEmotionCurve(v);
setCurveHistory((prev) => [...prev, curve]);

// Sammanfatta kurva från historik
const stateCurve = summariseCurve([...curveHistory, curve]);

// Detektera om användaren öppnar sig eller har mål
const isOpeningUp = v.length > 50 && !/(vet inte|ingen aning|kanske)/i.test(v);
const hasGoal = /(vill|skulle vilja|önskar|behöver|mål|hoppar)/i.test(v);

// TON: Välj profil baserat på kurva
const toneProfile = chooseToneBasedOnCurve(stateCurve, isOpeningUp, hasGoal);

// Frågebudget: MAX 1 fråga var tredje tur
const canAskQuestion = mayAsk && userTurns > 0 && userTurns % 3 === 0 && 
                      (Date.now() - lastAskedAtRef.current) >= 15000;

// Generera svar med TON-profil
let reply = generateToneReply(toneProfile, v, canAskQuestion);
```

## 🎮 Resultat i Upplevelse

| Funktion | Effekt |
|----------|--------|
| **TON-profiler** | "AI:n låter som en person som hör mig." |
| **Emotion curve** | "Den minns hur jag mår, inte bara vad jag skriver." |
| **Ritual-chips** | "Jag har kontroll. Jag väljer takten." |

## 📊 Flöde

```
Användare skriver meddelande
    ↓
KURVA: Detektera emotionell kurva
    ↓
Uppdatera curveHistory
    ↓
Sammanfatta kurva (senaste 6)
    ↓
TON: Välj profil baserat på kurva + kontext
    ↓
Generera svar med TON-profil + frågebudget
    ↓
Anti-repeat check
    ↓
Lägg till svar i konversation
```

## 🔧 Tekniska Detaljer

### Curve History
- Sparas i `curveHistory` state
- Max 6 senaste kurvor används för sammanfattning
- Resetas när konversationen rensas

### Tone Selection Logic
```typescript
if (curve === "down") → "mjuk-sårbar"
if (curve === "flare") → "mjuk-stabiliserande"
if (curve === "up" || hasGoal) → "mjuk-bekräftande"
if (isOpeningUp) → "mjuk-varm"
else → "mjuk-neutral"
```

### Question Budget
- MAX 1 fråga var tredje tur (enligt systemprompt)
- Minst 15s mellan frågor
- Session mildring: max 1 fråga på 3 turer för återbesökare

## ✅ Acceptanskriterier

- ✅ TON-profiler används baserat på emotionell kurva
- ✅ KURVA spåras och sammanfattas korrekt
- ✅ RITUAL-verktyg visas som valfria chips
- ✅ State machine integrerad med TON/KURVA
- ✅ Frågebudget: MAX 1 fråga var tredje tur
- ✅ Tystnad är tillåtet med bekräftelse

## 📝 Nästa Steg (Valfritt)

1. **LLM Integration**: Använd systemprompten med LLM för mer naturliga svar
2. **Curve Visualization**: Visa emotionell kurva visuellt för användaren
3. **Ritual Analytics**: Spåra vilka ritualer som används mest
4. **Tone A/B Testing**: Testa olika tonprofiler och mät engagemang

**Status: TON, KURVA & RITUAL implementerade** 🎉

