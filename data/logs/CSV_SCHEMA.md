# CSV Analysis Log Schema

## Kolumner och Domäner

### Grundläggande fält
- `timestamp`: ISO 8601 format (UTC)
- `person1`, `person2`: Personernas namn (CSV-escaped)
- `description`: Textbeskrivning av relationen (CSV-escaped)
- `description_length`: Antal tecken i beskrivningen
- `time_in_day_seconds`: Tid på dagen i sekunder (0-86399)

### Säkerhet och Risk
- `safety_flag`: `NORMAL` | `CAUTION` | `RISK` | `DANGER`
  - `NORMAL`: Inga säkerhetsrisker
  - `CAUTION`: Vissa oroväckande ord men låg risk
  - `RISK`: 3+ riskområden eller säkerhetsindikatorer
  - `DANGER`: Tydliga säkerhetshot (ska implementeras)

### Bedömning och Poäng
- `pos_count`: Antal positiva ord (från indicators.json)
- `neg_count`: Antal negativa ord (från indicators.json)
- `risk_count`: Antal identifierade riskområden (motsvarar `risk_areas.length`)
- `net_score`: Beräknat enligt formel: `pos_count - neg_count - risk_count`

### Signal-identifiering
- `repair_signals`: `YES` | `MAYBE` | `NO`
  - `YES`: Både ursäkt och plan identifierade
  - `MAYBE`: Antingen ursäkt eller plan identifierad
  - `NO`: Inga reparationssignaler
- `warmth`: `YES` | `NO` (värme/kärlek identifierad)
- `has_apology`: `YES` | `NO` (explicit ursäkt)
- `has_plan`: `YES` | `NO` (planering/schema identifierad)

### AI-analys
- `recommendation`: AI-genererad rekommendation (CSV-escaped)
- `reflections`: JSON-array med 3 reflektioner
- `risk_areas`: JSON-array med identifierade riskområden
- `analysis_mode`: `ai` | `fallback`
- `confidence`: 0.0-1.0 (AI:s självförtroende)

## Beräkningslogik

### Net Score Formula
```
net_score = pos_count - neg_count - risk_count
```

**Standardiserad formel** för reproducerbar analys:
- Positiva ord: +1 poäng var
- Negativa ord: -1 poäng var  
- Riskområden: -1 poäng var

Detta gör att CSV-raderna blir konsekventa och reproducerbara för träning och statistik.

### Safety Flag Logic
```typescript
if (safety_indicators_found) {
  if (risk_count >= 3) {
    return "RISK";
  } else {
    return "CAUTION";
  }
}
return "NORMAL";
```

### Repair Signals Logic
```typescript
if (has_apology && has_plan) {
  return "YES";
} else if (has_apology || has_plan) {
  return "MAYBE";
} else {
  return "NO";
}
```

## Exempel på Testdata

Se ChatGPT:s föreslagna testfall för kompletta exempel på korrekt formaterade rader.

## Validering

- Alla JSON-fält måste vara korrekt formaterade strängar
- Decimaltal använder punkt (.) som decimalseparator
- Timestamp måste matcha time_in_day_seconds beräkning
- Om risk_count > 0, ska risk_areas inte vara tom array
