#!/usr/bin/env node
/*
 * apply_si_proposals.mjs
 *
 * Reads SI proposal JSON (reports/si/forlag_*.json), applies safe JSON patches
 * and opens a GitHub PR. This is Step 2 of the SI-loop.
 */

import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const args = process.argv.slice(2);
const getArg = (key, fallback) => {
  const idx = args.indexOf(`--${key}`);
  return idx >= 0 ? args[idx + 1] : fallback;
};

const inPattern = getArg("in", "reports/si/forlag_*.json");
const branch = getArg("branch", `si/auto-${Date.now()}`);
const dryRun = getArg("dry", "0") === "1";

function resolveLatest(pattern) {
  const dir = path.dirname(pattern);
  const base = path.basename(pattern).replace("*", "");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(base))
    .map((f) => path.join(dir, f))
    .sort();
  return files.length ? files[files.length - 1] : null;
}

const inputFile = fs.existsSync(inPattern) ? inPattern : resolveLatest(inPattern);
if (!inputFile) {
  console.error(`[SI] No proposals found (pattern: ${inPattern})`);
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const proposals = payload.proposals || [];
if (!proposals.length) {
  console.log("[SI] No proposals to apply. Exiting.");
  process.exit(0);
}

function patchPlan(proposal) {
  if (proposal.area === "memory.scoring") {
    return {
      file: "configs/memory/v2/scoring.json",
      apply(obj) {
        const next = { ...obj };
        const betaPlus = Number(proposal.change?.beta_plus ?? 0);
        const baseBeta = Number(next.beta ?? 0);
        if (!Number.isNaN(betaPlus)) {
          next.beta = Number(baseBeta + betaPlus);
        }
        if (proposal.change?.rerank_topk) {
          next.rerank_topk = proposal.change.rerank_topk;
        }
        return next;
      },
    };
  }
  // Add more mappings per area as needed
  return null;
}

function editJson(file, applyFn) {
  const exists = fs.existsSync(file);
  const content = exists ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const updated = applyFn(content);
  const text = `${JSON.stringify(updated, null, 2)}\n`;
  if (dryRun) {
    console.log(`[DRY] Would patch ${file}:\n${text}`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
}

function sh(cmd) {
  console.log(`[SI] $ ${cmd}`);
  return cp.execSync(cmd, { stdio: "inherit" });
}

const summary = [
  `# SI Auto-PR`,
  `Source: ${path.basename(inputFile)}`,
  `Samples: ${payload.average?.samples ?? "?"}`,
  `Avg MRR: ${payload.average?.mrr ?? "?"}`,
  "",
  "## Applied Changes"
];

if (!dryRun) {
  sh(`git checkout -b ${branch}`);
}

let applied = 0;
for (const proposal of proposals) {
  const plan = patchPlan(proposal);
  if (!plan) continue;
  editJson(plan.file, plan.apply);
  summary.push(`- ${proposal.area}: ${JSON.stringify(proposal.change)}`);
  applied += 1;
}

if (applied === 0) {
  console.log("[SI] No applicable proposal mappings. Nothing to do.");
  process.exit(0);
}

if (dryRun) {
  console.log(summary.join("\n"));
  process.exit(0);
}

try {
  sh("git add -A");
  sh(`git commit -m "SI: apply proposals (${path.basename(inputFile)})"`);
} catch (err) {
  console.warn("[SI] Commit step failed (maybe no diff?)", err.message || err);
}

const remote = process.env.GH_TOKEN
  ? `https://x-access-token:${process.env.GH_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY || ''}.git`
  : "origin";

try {
  sh(`git push ${remote} ${branch}`);
} catch (err) {
  console.warn("[SI] Push failed", err.message || err);
}

let prUrl = "";
try {
  sh(
    `gh pr create --title "SI: Auto-PR (${branch})" --body "${summary.join('\n')}" --base ${process.env.GITHUB_BASE_REF || 'main'} --head ${branch}`
  );
  prUrl = cp.execSync("gh pr view --json url -q .url").toString().trim();
} catch (err) {
  console.warn("[SI] gh CLI not available or PR create failed.", err.message || err);
}

console.log("[SI] Done.", prUrl || branch);
