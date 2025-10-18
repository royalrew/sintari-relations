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

## 📝 Nästa steg

**Dag 6:** Billing - Stripe testbetalning (Checkout + webhook → run)

---

**Del av Sintari 5-års roadmap** 🚀  
Från kod till Monaco 👑

**Dag 1-5/360 klara!** ✅  
**355 dagar kvar!**

**MVP är Vercel-ready!** 🎉
