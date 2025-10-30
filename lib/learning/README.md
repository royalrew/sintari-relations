# Learning & Autoheal System

Detta är learning och autoheal systemet för Sintari AI Market. Systemet har flyttats från `tests/golden/` till `lib/learning/` för bättre organisation.

## 📁 Filer

- **`learning_system.mjs`** - Huvudsystem för learning och performance analysis
- **`autoheal_system_v2.mjs`** - Avancerat autoheal system med real code modifications
- **`autoheal_system.mjs`** - Grundläggande autoheal system

## 🎯 Funktioner

### Learning System
- **Performance History**: Laddar historisk prestanda från golden test runs
- **Trend Analysis**: Analyserar trender i coverage, flags_f1, worldclass_score
- **Learning Suggestions**: Genererar förbättringsförslag baserat på data
- **Adaptive Thresholds**: Justerar trösklar baserat på historisk prestanda

### Autoheal System
- **Performance Monitoring**: Övervakar prestanda i realtid
- **Automatic Fixes**: Tillämpar automatiska fixar för prestandaproblem
- **Code Modifications**: Modifierar faktisk kod för förbättringar
- **Optimization History**: Sparar historik över optimeringar

## 🚀 Användning

### Via API
```bash
# Testa learning system
GET /api/test-learning-simple

# Testa alla agenter
GET /api/test-agents
```

### Via Node.js
```javascript
import { LearningSystem } from './lib/learning/learning_system.mjs';

const learningSystem = new LearningSystem();
await learningSystem.runLearningCycle();
```

## 📊 Performance Metrics

- **Coverage**: Andel av text som täcks av spans
- **Flags F1**: Precision för flag-detektering
- **Worldclass Score**: Övergripande kvalitetsscore
- **Latency**: Genomsnittlig svarstid per agent

## 🔧 Konfiguration

Systemet läser automatiskt från:
- `../tests/golden/output/latest_run.json` - Senaste test resultat
- `../tests/golden/output/golden_run_report_*.json` - Historiska resultat

## 📈 Förbättringar

Systemet kan automatiskt:
- Justera IoU-trösklar
- Lägga till nya flag-patterns
- Optimera agent-prestanda
- Generera förbättringsförslag

## 🎉 Status

✅ **Alla filer flyttade från golden test-mappen**
✅ **Sökvägar uppdaterade för nya plats**
✅ **API endpoints fungerar**
✅ **Learning system testat och fungerar**
