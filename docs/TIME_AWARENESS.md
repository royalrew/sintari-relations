# Tidsuppfattning - Implementation Summary

**Datum:** 2025-01-30  
**Status:** ✅ Alla hooks och integration implementerade

## 🎯 Implementerade Komponenter

### 1. Time Hooks ✅

**Fil:** `lib/reception/time_hooks.ts`

**Hooks:**
1. **`useTickerHz(hz)`**: Global klocka (1 Hz) – återanvänds av andra hooks
2. **`useTypingDetector({ idleMs })`**: Detekterar skrivaktivitet i input
   - `isTyping`: true när användaren skriver
   - `onType()`: Anropas vid varje input-ändring
3. **`useIdleThresholds(thresholds)`**: Detekterar idle-tid
   - `idleMs`: Millisekunder sedan senaste aktivitet
   - `level`: "none" | "soft" (20s) | "med" (45s) | "long" (3min)
   - Spårar: pointerdown, keydown, scroll, mousemove
4. **`usePageVisibility()`**: Detekterar om fliken är synlig
   - `visible`: true när fliken är aktiv
5. **`useElapsedSince(lastTs)`**: Tid sedan senaste USER-meddelande

### 2. Tystnads-närvaro Integration ✅

**Fil:** `components/reception/Reception.tsx`

**Funktionalitet:**
- **20s idle ping**: "Ingen stress. Jag finns kvar här."
  - Endast om: sidan synlig, inte skriver, idle level "soft", minst 30s sedan senaste ping
- **45s idle notice**: Stilla rad under input
  - "Vi kan bara vara tysta en stund också – jag är kvar här."
  - Endast om: sidan synlig, inte skriver, idle level "med"

**Skydd:**
- ✅ Skrivskydd: Om `isTyping === true` → skicka ingenting
- ✅ Flik i bakgrunden: Om `pageVisible === false` → skicka ingenting
- ✅ Cool-down: 30s mellan bekräftelser (`JUST_SENT_MS`)

### 3. KPI Tracking ✅

**Nya events:**
- `soft_idle_ping`: Loggas när 20s ping skickas
- `med_idle_notice`: Loggas när 45s notice visas

**KPI:er att bevaka:**
- `soft_idle_ping_rate`: Ska ligga lågt (< 10% av sessioner)
- `med_idle_notice_rate`: Får gärna vara 10–20% (visar närvaro)
- `idle_ping_leads_to_reply`: Hur ofta användaren svarar inom 30s efter ping (target: 20–40%)

## 🔧 Tekniska Detaljer

### Idle Thresholds
```typescript
{
  soft: 20_000,  // 20 sekunder
  med: 45_000,   // 45 sekunder
  long: 180_000  // 3 minuter
}
```

### Ping Logic
```typescript
const shouldPing =
  pageVisible &&           // Fliken måste vara synlig
  !isTyping &&             // Användaren skriver inte
  idle.level === "soft" && // 20s idle
  elapsedSinceUser >= 20_000 && // Minst 20s sedan senaste user-meddelande
  Date.now() - lastPingRef.current > 30_000 && // Cool-down: 30s
  turns.length > 0 &&      // Måste finnas meddelanden
  turns[turns.length - 1]?.role === "user"; // Senaste från användaren
```

### Notice Logic
```typescript
const showGentleNotice =
  pageVisible &&      // Fliken synlig
  !isTyping &&        // Inte skriver
  idle.level === "med"; // 45s idle
```

## 📊 Flöde

```
Användare skriver meddelande
    ↓
onType() triggas → isTyping = true
    ↓
Användaren slutar skriva → isTyping = false efter 2s
    ↓
Idle-detektor börjar räkna
    ↓
20s idle + sidan synlig + inte skriver
    ↓
Skicka "Ingen stress. Jag finns kvar här."
    ↓
45s idle + sidan synlig + inte skriver
    ↓
Visa stilla rad: "Vi kan bara vara tysta en stund också – jag är kvar här."
```

## ✅ Skydd mot Spam

1. **Skrivskydd**: Om `isTyping === true` → skicka ingenting
2. **Flik i bakgrunden**: Om `pageVisible === false` → skicka ingenting
3. **Cool-down**: 30s mellan bekräftelser (`JUST_SENT_MS`)
4. **Reduced motion**: Redan på plats

## 🎯 Resultat

**Receptionisten har nu tidsuppfattning:**
- ✅ Ser tystnad (20s/45s/3min)
- ✅ Respekterar skrivande och bakgrundsflikar
- ✅ Svarar endast med närvaro, aldrig med krav
- ✅ Känns lugnt och icke-krävande

## 📝 Nästa Steg (Valfritt)

1. **Server-side time awareness**: Skicka tidsfält i API-payloads för backend-anpassning
2. **Idle ping analytics**: Spåra hur ofta ping leder till svar
3. **Long idle handling**: Särskild hantering för 3min+ idle
4. **Timezone awareness**: Använd `Intl.DateTimeFormat().resolvedOptions().timeZone` för lokal tid

**Status: Tidsuppfattning implementerad** 🎉

