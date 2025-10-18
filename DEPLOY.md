# 🚀 Deploy Guide - Sintari Relations

## 📋 Dag 5: Deploy till Vercel

### 1️⃣ Förberedelser (lokalt)

```bash
# Installera Vercel-kompatibla paket
npm install puppeteer-core @sparticuz/chromium

# Testa lokalt
npm run dev
```

### 2️⃣ Environment Variables

Kopiera `.env.example` till `.env.local`:

```bash
cp .env.example .env.local
```

**För Vercel, lägg till dessa i dashboard:**

```env
NEXT_PUBLIC_APP_NAME=Sintari Relations
NEXT_PUBLIC_APP_VERSION=v0.1
NEXT_PUBLIC_BASE_URL=https://din-app.vercel.app
NODE_ENV=production
```

### 3️⃣ Deploy till Vercel

#### Via GitHub (rekommenderat):

1. Pusha till GitHub
2. Gå till [vercel.com](https://vercel.com)
3. **New Project** → Importera ditt repo
4. **Build Settings:**
   - Build Command: `npm run build`
   - Install Command: `npm install`
   - Output Directory: (tom, Next.js defaults)
5. **Environment Variables:** Lägg till env-variabler (se ovan)
6. **Deploy**!

#### Via Vercel CLI:

```bash
# Installera Vercel CLI
npm i -g vercel

# Länka projektet
vercel link

# Sätt env-variabler
vercel env pull .env.local

# Deploy
vercel --prod
```

### 4️⃣ Testa produktionen

#### Health Endpoint:
```
https://din-app.vercel.app/api/health
```

**Förväntat svar:**
```json
{
  "status": "ok",
  "time": "2025-10-18T12:30:00.000Z",
  "version": "v0.1",
  "service": "Sintari Relations API"
}
```

#### Hela flödet:
1. Öppna `https://din-app.vercel.app`
2. Fyll i formulär
3. Bocka samtycke
4. Analysera relation
5. Ladda ner PDF
6. ✅ Allt ska fungera!

### 5️⃣ Railway (Alternativ)

Om Vercel serverless inte funkar för Puppeteer:

1. Skapa projekt på [railway.app](https://railway.app)
2. Deploy från GitHub
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm run start`
5. Sätt samma env-variabler
6. Railway kör full Node → Puppeteer funkar direkt

**Fördel:** Full Linux, standard Puppeteer  
**Nackdel:** Långsammare än Vercel Edge

---

## 🔧 Konfigurationsfiler

### `vercel.json`
Höjer memory och timeout för PDF-export:
```json
{
  "functions": {
    "app/api/export/route.ts": {
      "runtime": "nodejs20.x",
      "memory": 1024,
      "maxDuration": 30
    }
  }
}
```

### `.env.example`
Mall för environment variables.

---

## ✅ Acceptance Criteria (DAG 5)

- ✅ GET `/api/health` → `{ status: "ok" }`
- ✅ Form → Agent → Resultat → PDF funkar live
- ✅ Disclaimers/banners syns i produktion
- ✅ PDF innehåller etik-footer (och trygghetsbadge om flaggad)
- ✅ URL delad (Vercel/Railway) → manuell verifiering OK

---

## 🐛 Troubleshooting

### PDF genereras inte på Vercel:
- Kontrollera att `@sparticuz/chromium` är installerat
- Verifiera `runtime = "nodejs"` i export route
- Kolla Vercel logs: `vercel logs`

### Timeout på PDF:
- Öka `maxDuration` i `vercel.json`
- Överväg Railway för längre requests

### Local development:
- Installera `puppeteer` som devDependency för lokal Chrome
- Eller sätt `PUPPETEER_EXECUTABLE_PATH` till din Chrome

---

## 📊 Efter deploy:

1. ✅ Dela URL med vänner för feedback
2. ✅ Övervaka `/api/health` med uptime monitor
3. ✅ Kolla Vercel Analytics för användning
4. ✅ Bocka av Dag 5 i micro_planner!

---

**🎯 Kommando för att bocka av:**

```powershell
cd "C:\Users\royal\OneDrive\Skrivbord\Mitt företag\Sintari AI Market\Roadmapp"
python micro_planner.py --month 1 --done "Deploy setup klar! Vercel-kompatibel Puppeteer, health endpoint, env-config, vercel.json. Redo för produktion!"
```

