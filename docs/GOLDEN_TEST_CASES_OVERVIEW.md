# Golden Test Cases - Översikt

## Totalt: **1,240 golden test cases**

### JSONL-filer (1,023 cases)

#### Relations (783 cases)
- **Bronze**: 120 cases
  - `bronze/auto1.jsonl`: 110
  - `bronze/seed.jsonl`: 10

- **Silver**: 134 cases
  - `silver/auto1.jsonl`: 100
  - `silver/edge.jsonl`: 12
  - `silver/more.jsonl`: 10
  - `silver/seed.jsonl`: 12

- **Gold**: 256 cases
  - `gold/auto1.jsonl`: 120
  - `gold/edge.jsonl`: 12
  - `gold/more.jsonl`: 10
  - `gold/mut1.jsonl`: 36
  - `gold/mut2.jsonl`: 30
  - `gold/mut3.jsonl`: 36
  - `gold/seed.jsonl`: 12

- **Platinum**: 77 cases
  - `platinum/auto1.jsonl`: 60
  - `platinum/edge.jsonl`: 10
  - `platinum/graph_seed.jsonl`: 1
  - `platinum/seed.jsonl`: 6

- **Diamond**: 196 cases
  - `diamond/auto1.jsonl`: 50
  - `diamond/edge.jsonl`: 30
  - `diamond/edge3.jsonl`: 20
  - `diamond/edge4.jsonl`: 30
  - `diamond/mut1.jsonl`: 60
  - `diamond/seed.jsonl`: 6

#### Emotion (240 cases)
- `emotion/micro_mood_golden.jsonl`: 240

### CSV-filer (217 cases)

#### Relations (60 cases)
- `bronze/bronze_cases.csv`: 15
- `silver/silver_cases.csv`: 15
- `gold/gold_cases.csv`: 15
- `diamond/diamond_cases.csv`: 15

#### Expected/Checks (157 cases)
- `bronze/bronze_expected.csv`: 15
- `silver/silver_expected.csv`: 16
- `gold/gold_expected.csv`: 15
- `diamond/diamond_expected.csv`: 15
- `expected/checks_matrix.csv`: 56
- `build_plan.csv`: 40

## Lokalisation

Alla golden test cases finns i:
- **Relations**: `tests/golden/relations/{bronze|silver|gold|platinum|diamond}/*.jsonl`
- **Emotion**: `tests/golden/emotion/micro_mood_golden.jsonl`
- **CSV**: `tests/golden/{bronze|silver|gold|diamond}/*.csv`

## Användning

Golden test cases används för:
- Regression testing
- Quality gates i CI/CD
- Benchmarking av agent-prestanda
- Validering av pipeline-komponenter

