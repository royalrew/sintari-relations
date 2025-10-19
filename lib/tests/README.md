# Golden Tests för Sintari Relations

Detta är en testfil som verifierar att CSV-loggning och relationanalys fungerar korrekt.

## Vad testas

### 1. Scoringsystem
- **Positiva ord**: Räknas korrekt (`pos_count`)
- **Negativa ord**: Räknas korrekt (`neg_count`) 
- **Netto-score**: Beräknas korrekt (`net_score = pos - neg`)
- **Warmth-signaler**: Identifieras korrekt (`warmth`)
- **Riskområden**: Räknas korrekt (`risk_count`)

### 2. CSV-format
- **Header-struktur**: Alla 18 förväntade kolumner finns
- **Data-integritet**: Inga korrupta rader eller felaktiga format
- **Encoding**: Korrekt hantering av svenska tecken

## Testfall

### Test 1: Positiv relation med kärlek
```
Text: "Vi älskar varandra mycket. Vi respekterar varandra och har tillit till varandra."
Förväntat: posCount=4, negCount=0, warmth=true
```

### Test 2: Relation med bråk och riskområden
```
Text: "Vi älskar varandra men vi bråkar om ekonomi och barnen. Vi planerar att prata om det."
Förväntat: posCount=1, negCount=1, warmth=true, repairSignals=true
```

### Test 3: Negativ relation med trygghetsproblem
```
Text: "Jag är rädd för honom. Han är kontrollerande och hotfull. Vi bråkar hela tiden."
Förväntat: posCount=0, negCount=2, warmth=false, safetyFlag=true
```

## Kör tester

### Snabb test (rekommenderat)
```bash
npm run test:golden:simple
```

### Fullständig test
```bash
npm run test:golden
```

### Manuell körning
```bash
node lib/tests/golden-test-simple.js
```

## Testrapporter

Testrapporter sparas automatiskt i:
```
data/test-reports/golden-test-YYYY-MM-DD.json
```

## Vad göra om tester misslyckas

1. **Kontrollera CSV-filen**: `data/logs/analysis_log.csv`
2. **Kontrollera indicators.json**: Att ordlistor är korrekta
3. **Kontrollera scoring-logik**: I `app/actions/analyzeRelation.ts`

## Förväntat resultat

Alla tester ska passera för att säkerställa att systemet fungerar korrekt:
- ✅ Scoring-systemet ger rätt resultat
- ✅ CSV-logger sparar alla fält korrekt  
- ✅ Header och data har korrekt format
- ✅ Svenska tecken hanteras korrekt
