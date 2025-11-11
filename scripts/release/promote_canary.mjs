#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

function copyDir(src, dst) {
  if (!fs.existsSync(src)) throw new Error(`Missing ${src}`);
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function setEnvPercent(percent) {
  const file = ".env";
  const txt = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const has = /(^|\n)CANARY_PERCENT=/.test(txt);
  const next = has
    ? txt.replace(/(^|\n)CANARY_PERCENT=.*?(?=\n|$)/, `\nCANARY_PERCENT=${percent}`)
    : `${txt}\nCANARY_PERCENT=${percent}\n`;
  fs.writeFileSync(file, next);
}

function sh(cmd) {
  console.log(`[PROMOTE] $ ${cmd}`);
  cp.execSync(cmd, { stdio: "inherit" });
}

const SRC = "configs/canary";
const DST = "configs/stable";
const BRANCH = `release/canary-${Date.now()}`;

copyDir(SRC, DST);
setEnvPercent(0);

try {
  sh(`git checkout -b ${BRANCH}`);
} catch (err) {
  console.warn("[PROMOTE] git checkout failed", err.message || err);
}

try {
  sh("git add -A");
  sh(`git commit -m "promote: canary → stable (reset canary to 0%)"`);
} catch (err) {
  console.warn("[PROMOTE] commit failed", err.message || err);
}

try {
  sh(`git push -u origin ${BRANCH}`);
  try {
    sh("gh pr create --fill");
  } catch (err) {
    console.warn("[PROMOTE] gh pr create failed", err.message || err);
  }
} catch (err) {
  console.warn("[PROMOTE] push failed", err.message || err);
}

console.log("[PROMOTE] Done. Review PR and merge to finalize promotion.");
