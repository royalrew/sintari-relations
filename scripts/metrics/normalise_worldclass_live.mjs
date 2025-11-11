#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
let inputPath = "reports/worldclass_live.jsonl";
let outputPath = null;
let dedupeSec = "900";
let sessionWindow = "50";
let enforceMonotonic = false;

const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (!token.startsWith("-")) {
    positional.push(token);
    continue;
  }

  const next = argv[i + 1];
  switch (token) {
    case "-i":
    case "--in":
    case "--input":
      if (next) {
        inputPath = next;
        i += 1;
      }
      break;
    case "-o":
    case "--out":
    case "--output":
      if (next) {
        outputPath = next;
        i += 1;
      }
      break;
    case "--dedupe-sec":
      if (next) {
        dedupeSec = String(next);
        i += 1;
      }
      break;
    case "--window":
    case "--session-window-limit":
      if (next) {
        sessionWindow = String(next);
        i += 1;
      }
      break;
    case "--enforce-monotonic":
      enforceMonotonic = true;
      break;
    default:
      positional.push(token);
      break;
  }
}

if (positional.length > 0) {
  inputPath = positional[0];
}

const normalizeScript = path.join("scripts", "metrics", "normalize_worldclass.ts");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "worldclass_norm_"));
const tmpOut = path.join(tmpDir, "worldclass_live.norm.jsonl");

const args = [
  "tsx",
  normalizeScript,
  "-i",
  inputPath,
  "-o",
  tmpOut,
  "--dedupe-sec",
  dedupeSec,
  "--session-window-limit",
  sessionWindow,
];

if (enforceMonotonic) {
  args.push("--enforce-monotonic");
}

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npxCommand, args, {
  stdio: ["ignore", "pipe", "inherit"],
  shell: process.platform === "win32",
  encoding: "utf8",
});

if (result.error) {
  console.error(`[normalise_worldclass_live] failed to invoke ${npxCommand}:`, result.error.message);
  cleanup();
  process.exit(1);
}

if (result.status !== 0) {
  if (result.stdout) {
    process.stderr.write(result.stdout);
  }
  cleanup();
  process.exit(result.status ?? 1);
}

if (result.stdout) {
  process.stderr.write(result.stdout);
}

if (!fs.existsSync(tmpOut)) {
  cleanup();
  process.exit(0);
}

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(tmpOut, outputPath);
  cleanup();
  console.log(`[normalise_worldclass_live] wrote ${outputPath}`);
  process.exit(0);
}

const readStream = fs.createReadStream(tmpOut, { encoding: "utf-8" });
readStream.on("end", cleanup);
readStream.pipe(process.stdout);

function cleanup() {
  try {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  } catch {}
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

