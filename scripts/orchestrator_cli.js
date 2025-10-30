#!/usr/bin/env node
// Minimal CLI: stdin JSON -> stdout JSON
const fs = require("fs");

(async () => {
  try {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    const { analyze } = require("../lib/orchestrator");

    const result = await analyze({
      text: payload.text,
      lang: payload.lang || "sv",
      persona: payload.persona || null,
      context: payload.context || null,
      dialog: payload.dialog || null,
    });

    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (e) {
    process.stderr.write(`[orchestrator_cli] ${e.message}\n`);
    process.exit(1);
  }
})();


