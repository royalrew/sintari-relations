# Golden Test Cases - Filstruktur

## Totalt: **1,240 golden test cases**

## Filstruktur

```
tests/golden/
│
├── relations/                    # Relations-test cases (783 cases)
│   ├── bronze/                  # 120 cases
│   │   ├── auto1.jsonl          # 110 cases
│   │   └── seed.jsonl           # 10 cases
│   │
│   ├── silver/                  # 134 cases
│   │   ├── auto1.jsonl          # 100 cases
│   │   ├── edge.jsonl           # 12 cases
│   │   ├── more.jsonl           # 10 cases
│   │   └── seed.jsonl           # 12 cases
│   │
│   ├── gold/                    # 256 cases
│   │   ├── auto1.jsonl          # 120 cases
│   │   ├── edge.jsonl           # 12 cases
│   │   ├── more.jsonl           # 10 cases
│   │   ├── mut1.jsonl           # 36 cases
│   │   ├── mut2.jsonl           # 30 cases
│   │   ├── mut3.jsonl           # 36 cases
│   │   └── seed.jsonl           # 12 cases
│   │
│   ├── platinum/                # 77 cases
│   │   ├── auto1.jsonl          # 60 cases
│   │   ├── edge.jsonl           # 10 cases
│   │   ├── graph_seed.jsonl      # 1 case
│   │   └── seed.jsonl           # 6 cases
│   │
│   └── diamond/                 # 196 cases
│       ├── auto1.jsonl          # 50 cases
│       ├── edge.jsonl           # 30 cases
│       ├── edge3.jsonl          # 20 cases
│       ├── edge4.jsonl          # 30 cases
│       ├── mut1.jsonl           # 60 cases
│       └── seed.jsonl           # 6 cases
│
├── emotion/                      # Emotion-test cases (240 cases)
│   └── micro_mood_golden.jsonl  # 240 cases
│
├── bronze/                       # CSV test cases
│   ├── bronze_cases.csv         # 15 cases
│   └── bronze_expected.csv      # 15 cases
│
├── silver/                       # CSV test cases
│   ├── silver_cases.csv         # 15 cases
│   └── silver_expected.csv      # 16 cases
│
├── gold/                         # CSV test cases
│   ├── gold_cases.csv           # 15 cases
│   └── gold_expected.csv        # 15 cases
│
├── diamond/                      # CSV test cases
│   ├── diamond_cases.csv        # 15 cases
│   └── diamond_expected.csv     # 15 cases
│
├── expected/                     # Expected values
│   └── checks_matrix.csv        # 56 cases
│
└── build_plan.csv                # 40 cases
```

## Dataformat

### JSONL (Relations)
Varje rad är ett JSON-objekt:
```json
{
  "id": "G001",
  "level": "gold",
  "input": {
    "lang": "sv",
    "text": "Det känns som att jag alltid jagar dig för svar..."
  },
  "expected": {
    "attachment_style": "orolig",
    "ethics_check": "safe",
    "risk_flags": [],
    "tone_target": "uppriktig men icke-anklagande",
    "top_reco": ["Beskriv mönster utan skuld", "..."]
  }
}
```

### JSONL (Emotion)
Varje rad är ett JSON-objekt:
```json
{
  "id": "E001",
  "lang": "sv",
  "text": "Vi pratar mest om vardagssaker och det flyter på.",
  "expected": "plus",
  "source": "seed",
  "reviewed_by": "jimmy",
  "reviewed_at": "2025-11-01T00:00:00Z"
}
```

### CSV (Relations)
Format: `case_id,lang,title,text`
```csv
case_id,lang,title,text
G001,sv,Hot/ultimatum (RED),"Om du pratar med din syster igen..."
```

## Användning

### Kör alla golden tests
```bash
# Via API (kräver att servern körs)
npm run test:golden:coach:api

# Standalone
npm run test:golden:coach:standalone

# PowerShell
.\scripts\test-golden-tests-api.ps1
```

### Kör specifika nivåer
```bash
# Python runner
python tests/golden/test_relations_golden.py

# Multi-runner
node tests/golden/multi_runner.mjs
```

## Testnivåer

- **Bronze**: Grundläggande test cases (120 cases)
- **Silver**: Standard test cases (134 cases)
- **Gold**: Avancerade test cases (256 cases)
- **Platinum**: Expert test cases (77 cases)
- **Diamond**: Master test cases (196 cases)

## Kategorier

- **Relations**: Test cases för relationsanalys (783 cases)
- **Emotion**: Test cases för emotion detection (240 cases)
- **CSV**: Strukturerade test cases med expected values (217 cases)

