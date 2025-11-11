# Så här kör du Golden Tests

## Steg-för-steg

### 1. Starta servern

Öppna PowerShell och kör:
```powershell
cd "C:\Users\royal\OneDrive\Skrivbord\Mitt foretag\Sintari AI Market\sintari-relations"
npm run dev
```

Vänta tills du ser: `Ready in X seconds`

### 2. Kör golden tests

I ett **nytt** PowerShell-fönster, kör:
```powershell
cd "C:\Users\royal\OneDrive\Skrivbord\Mitt foretag\Sintari AI Market\sintari-relations"
.\scripts\test-golden.ps1
```

Eller det längre scriptet:
```powershell
.\scripts\test-golden-tests-api.ps1
```

## Alternativ: Via webbläsare

När servern körs, öppna:
```
http://localhost:3000/api/coach/test-golden
```

## Snabbkommando (direkt)

```powershell
# I ett fönster:
npm run dev

# I ett annat fönster:
Invoke-RestMethod -Uri "http://localhost:3000/api/coach/test-golden" -Method Get
```

## Felsökning

**Problem: "Det går inte att ansluta till fjärrservern"**
- Lösning: Starta servern först med `npm run dev` och vänta tills den är redo
- Kontrollera att servern körs på port 3000 (standard för Next.js)

**Problem: "Cannot find path"**
- Lösning: Du är redan i rätt katalog, kör bara `.\scripts\test-golden.ps1` direkt
