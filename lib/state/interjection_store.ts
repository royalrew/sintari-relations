let lastTurnGlobal = -999;

export function allowInterjection(turn: number) {
  if (turn - lastTurnGlobal < 6) return false;
  lastTurnGlobal = turn;
  return true;
}

export function resetInterjection(turn = -999) {
  lastTurnGlobal = turn;
}
