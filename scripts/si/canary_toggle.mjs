#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const percentArg = process.argv[2];
const nextPercentRaw = Number(percentArg);
if (Number.isNaN(nextPercentRaw) || nextPercentRaw < 0) {
  console.error(`[CANARY] Invalid percent '${percentArg}'. Provide a non-negative number.`);
  process.exit(1);
}
const nextPercent = Math.min(25, nextPercentRaw);

const envPath = path.join(process.cwd(), ".env");
let env = "";
if (fs.existsSync(envPath)) {
  env = fs.readFileSync(envPath, "utf8");
}

if (!env.endsWith("\n")) env += "\n";
if (/^CANARY_PERCENT=.*/m.test(env)) {
  env = env.replace(/^CANARY_PERCENT=.*$/m, `CANARY_PERCENT=${nextPercent}`);
} else {
  env += `CANARY_PERCENT=${nextPercent}\n`;
}

fs.writeFileSync(envPath, env);
console.log(`[CANARY] Updated CANARY_PERCENT=${nextPercent} in .env`);

// Update canary_state.json so UI/guard reflect manual changes
const stateDir = path.join(process.cwd(), "reports", "si");
const statePath = path.join(stateDir, "canary_state.json");
if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
let state = {
  percent: 0,
  passes_in_row: 0,
  fails_in_row: 0,
  last_action_ts: 0,
};
try {
  if (fs.existsSync(statePath)) {
    state = { ...state, ...JSON.parse(fs.readFileSync(statePath, "utf8")) };
  }
} catch (err) {
  console.warn("[CANARY] Failed to read existing state, resetting", err);
}

const now = Math.floor(Date.now() / 1000);
state.percent = nextPercent;
state.last_action_ts = now;
// Reset streaks when manually toggling
if (nextPercent === 0) {
  state.passes_in_row = 0;
  state.fails_in_row = 0;
} else {
  state.passes_in_row = state.passes_in_row ?? 0;
  state.fails_in_row = 0;
}

fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
console.log(`[CANARY] Updated state percent=${state.percent}, passes=${state.passes_in_row}`);
