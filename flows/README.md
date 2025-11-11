# Longing Branch Flow - Documentation

## Översikt

Denna CSV-fil definierar trädstrukturen för **LÄNGTAN/NÄRHET-grenen** i coach-konversationen. Detta är **regler, inte exempel** - coachen ska ALDRIG repetera "Vad vill du börja med?" i denna gren.

## Struktur

CSV-filen har följande kolumner:

- **step_id**: Steg-ID (L1, L2, L3, etc.) som identifierar var i trädet vi befinner oss
- **input_pattern**: Mönster som matchar användarens input (stödjer wildcards: `*önskar*`)
- **coach_response**: Exakt coach-respons för detta steg
- **next_expected_user_type**: Typ av input som förväntas härnäst (t.ex. "kroppslokalisation", "sensation_quality")

## Trädstruktur

```
L1 (Initial längtan) 
  ↓
L2 (Kroppslokalisation: bröst/mage/hals)
  ↓
L3 (Sensation kvalitet: mjuk/hård/tom/tung)
  ↓
L4 (Consent check: ja/nej)
  ↓
L5 (Attachment target: specifik person / vet inte)
```

## Integration

### 1. Intent Router

I `orchestrateCoachReply.ts` eller motsvarande, lägg till:

```typescript
import { route_to_longing_branch } from './flows/longing_branch_handler';

if (route_to_longing_branch(userMessage)) {
  // Route to longing branch flow
  const flow = new LongingBranchFlow();
  const { response, nextStep, nextType } = flow.getResponse(userMessage, currentStepId);
  return response;
}
```

### 2. Coach Agent Integration

I Python-coach-agenten, lägg till:

```python
from flows.longing_branch_handler import LongingBranchFlow

flow = LongingBranchFlow()
response, next_step, next_type = flow.get_response(user_input, current_step_id)
```

## Regler

1. **ALDRIG** "Vad vill du börja med?" i denna gren
2. **ALDRIG** problemlösning eller analys för tidigt
3. **ALDRIG** hoppa över kroppsfokus
4. **ALDRIG** reset-svar som bryter närvaron

## Testning

Kör `python flows/longing_branch_handler.py` för att testa flödet.

