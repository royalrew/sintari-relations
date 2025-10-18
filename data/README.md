# 📊 Data - Relationsindikatorer

Denna mapp innehåller externa datafiler som används av AI-agenten.

## 📄 `indicators.json`

Innehåller tre typer av nyckelord som agenten använder för att analysera relationer:

### **POS** - Positiva signaler
Ord som indikerar en hälsosam relation.

**Exempel:** stöd, respekt, tillit, kärlek

### **NEG** - Negativa signaler  
Ord som indikerar friktion eller problem.

**Exempel:** bråk, kritik, stress, ignorerar

### **RISK** - Riskindikatorer
Specifika områden som kan kräva uppmärksamhet (130+ ord i 7 kategorier).

**Kategorier:**
- 🧭 Kommunikation & förståelse
- 💸 Ekonomi & ansvar
- ⏰ Tid & energi
- 👶 Familj, barn & roller
- ❤️ Intimitet & känslor
- 🌍 Yttre påfrestningar
- 💬 Emotionella teman
- 💍 Framtid & riktning

## 🔧 Hur man lägger till nya indikatorer

1. Öppna `indicators.json`
2. Lägg till ord i relevant array (POS, NEG eller RISK)
3. Spara filen
4. Starta om dev-servern
5. Klart! Agenten använder automatiskt de nya orden.

**Exempel:**

```json
{
  "RISK": [
    "kommunikation",
    "ekonomi",
    "arbetsbelastning"  ← Lägg till här
  ]
}
```

## 💡 Tips

- Använd **små bokstäver** för alla ord
- Tänk på **svenska variationer** (barn, barnen, barnplaner)
- Gruppera **relaterade ord** för att agenten ska ge bättre råd
- Testa nya ord genom att skriva en beskrivning som innehåller dem

## 🎯 Framtida förbättringar

- Synonymhantering (ex: "pengar" = "ekonomi")
- Viktning av ord (vissa ord viktigare än andra)
- Kontextbaserad analys (ordkombinationer)
- Flerspråkigt stöd (engelska indikatorer)

---

**Användning i kod:**

```typescript
import indicatorsData from "@/data/indicators.json";

const POS = indicatorsData.POS;
const NEG = indicatorsData.NEG;
const RISK = indicatorsData.RISK;
```

