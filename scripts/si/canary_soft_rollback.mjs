#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const STATE_FILE = "reports/si/canary_state.json";
const GUARD_FILE = "reports/si/canary_guard_last.json";
const COOLDOWN_SEC = 60 * 60; // 60 minutes
const MAX_PERCENT = 25;
unction readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let envText = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const match = envText.match(/CANARY_PERCENT=(\d+)/);
const currentPercent = match ? Number(match[1]) : 0;

const guard = readJson(GUARD_FILE, {});
const state = readJson(STATE_FILE, {
  percent: currentPercent,
  passes_in_row: 0,
  fails_in_row: 0,
  last_action_ts: 0,
});

const now = Math.floor(Date.now() / 1000);
let nextPercent = currentPercent;
let action = "hold";

const severeFailure = guard.severe === true;
const cooldownPassed = now - state.last_action_ts >= COOLDOWN_SEC;

if (guard.ok === true) {
  const passes = cooldownPassed ? (state.passes_in_row || 0) + 1 : (state.passes_in_row || 0) + 1;
  const fails = 0;
  if (passes >= 2 && cooldownPassed && currentPercent > 0 && currentPercent < MAX_PERCENT) {
    nextPercent = Math.min(MAX_PERCENT, currentPercent + 5);
    action = "bump";
    state.last_action_ts = now;
  }
  state.passes_in_row = passes;
  state.fails_in_row = fails;
} else if (guard.ok === false && cooldownPassed) {
  if (severeFailure) {
    nextPercent = 0;
    action = "hard-rollback";
  } else {
    nextPercent = currentPercent <= 1 ? 0 : Math.max(0, Math.floor(currentPercent / 2));
    action = "soft-rollback";
  }
  state.passes_in_row = 0;
  state.fails_in_row = (state.fails_in_row || 0) + 1;
  state.last_action_ts = now;
}

if (nextPercent !== currentPercent) {
  console.log(`[CANARY] ${action}: ${currentPercent}% -> ${nextPercent}%`);
  cp.execFileSync("node", ["scripts/si/canary_toggle.mjs", String(nextPercent)], { stdio: "inherit" });
  state.percent = nextPercent;
} else {
  console.log(`[CANARY] ${action}: stay at ${currentPercent}%`);
}

writeJson(STATE_FILE, state);
