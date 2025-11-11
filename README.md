# 🎯 Sintari Relations

AI-driven relationsanalys för att förstå och förbättra dina relationer.

## 📅 Progress

### ✅ Dag 1 - Relationformulär
**Status:** KLAR  

### ✅ Dag 2 - relation_agent v1  
**Status:** KLAR  

### ✅ Dag 3 - PDF Export v1
**Status:** KLAR  

### ✅ Dag 4 - Ethics & Safety
**Status:** KLAR  

### ✅ Dag 5 - Deploy Setup (Vercel-ready)
**Status:** KLAR  
**Uppgift:** Env + health endpoint  
**Output:** Vercel-kompatibel, health endpoint, deploy-guide

## 🚀 Quick Start

```bash
# Installera dependencies
npm install

# Lokalt (dev)
npm run dev

# Produktion
npm run build
npm run start
```

Öppna [http://localhost:3000](http://localhost:3000)

## 📦 Deploy till Vercel

Se **[DEPLOY.md](./DEPLOY.md)** för fullständig guide!

**Snabbversion:**
1. Pusha till GitHub
2. Importera i Vercel
3. Lägg till env-variabler från `env.template`
4. Deploy!
5. Testa `/api/health`

## 🛡️ Safety System (Production-ready)

### Trygghetsdetektor (23 säkerhetsord):
- Flaggar: elak, kränkande, hotar, våld, aggressiv...
- **Reflektion #1:** Tryggetsvarning
- **Rekommendation:** Specialiserad för trygghet
- **UI:** Röd box + hjälplänk
- **PDF:** "⚠️ TRYGGHET: FLAGGAD" badge

## 🧠 AI-Agent Features

- **130+ riskindikatorer** (7 kategorier)
- **3 reflektioner** (tonläge, risker, reparation)
- **1 handlingsbar rekommendation** (7 specialiserade varianter)
- **Trygghetsprioritet** (safety-first design)
- **Slumpvarianter** (mindre repetitivt)

## 📁 Projektstruktur

```
sintari-relations/
├── app/
│   ├── api/
│   │   ├── health/route.ts           ✅ Health endpoint
│   │   └── export/route.ts           ✅ Vercel-kompatibel PDF
│   ├── components/
│   │   └── DisclaimerBanner.tsx      ✅
│   ├── legal/ethics/page.tsx         ✅
│   ├── page.tsx                      ✅
│   └── ...
├── lib/
│   ├── agents/relation_agent.ts      ✅
│   └── schemas/...                   ✅
├── data/
│   ├── indicators.json               ✅ 130+ ord
│   ├── policy.json                   ✅
│   └── README.md                     ✅
├── vercel.json                       ✅ Config
├── env.template                      ✅ Env mall
├── DEPLOY.md                         ✅ Deploy guide
└── ...
```

## 🔧 Tech Stack

- **Next.js 15** - App Router
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **Zod** - Validation
- **Puppeteer-core** - Serverless PDF
- **@sparticuz/chromium** - Vercel Chrome
- **Stripe** - Betalningshantering
- **OpenAI** - AI-analys med fallback

## 📊 CSV Logging & Scoring

Alla analyser loggas i `data/logs/analysis_log.csv` med standardiserat format:

### Net Score Formula
```bash
net_score = pos_count - neg_count - risk_count
```

**Reproducerbar analys:**
- Positiva ord: +1 poäng var
- Negativa ord: -1 poäng var  
- Riskområden: -1 poäng var

Se `data/logs/CSV_SCHEMA.md` för fullständig dokumentation av alla fält och domäner.

## 🔐 Admin – Test Execution

### Körning

1. Sätt `ADMIN_SECRET` i `.env.local`:
   ```env
   ADMIN_SECRET=byt-mig-till-en-säker-nyckel
   ```

2. Gå till `/admin`, klistra in hemligheten i fältet.

3. Klicka på valfri testknapp. Status pollas varje sekund tills klart.

### Kommandon som körs

- **Emotion**: `pytest tests/worldclass/test_emotion_suite.py -v`
- **Memory**: `pytest tests/worldclass/test_memory_suite.py -v`
- **Alla**: Kör både emotion och memory tests
- **Smoke**: `python tests/memory/test_memory_smoke.py`

### Noter

- In-memory job queue (uppgradera till Redis för flera instanser).
- Metrics extraheras via regex och från report-filer (`reports/emotion_golden_report.json`, `reports/memory_eval_report.json`).
- Resultattabellen listar upptäckta `PASSED/FAILED` från pytest-output.
- Rate limiting: 1 jobb per minut per hemlighet (valfritt, via `lib/adminLimiter.ts`).

## 📝 Nästa steg

**✅ Dag 6:** Billing - Stripe testbetalning (Checkout + webhook → run)  
**Status:** KLAR - Stripe Checkout & Webhook implementerat

---

**Del av Sintari 5-års roadmap** 🚀  
Från kod till Monaco 👑

**Dag 1-5/360 klara!** ✅  
**355 dagar kvar!**

**MVP är Vercel-ready!** 🎉
