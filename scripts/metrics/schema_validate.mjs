#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv from "ajv";

const inputPath = path.resolve(process.cwd(), process.argv[2] || "reports/worldclass_live.norm.jsonl");
const schemaPath = path.resolve(process.cwd(), process.argv[3] || "schemas/worldclass_live.schema.json");

if (!fs.existsSync(inputPath)) {
  console.error(`[schema:validate] missing input file: ${inputPath}`);
  process.exit(1);
}

if (!fs.existsSync(schemaPath)) {
  console.error(`[schema:validate] missing schema: ${schemaPath}`);
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true, strict: false });
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const validate = ajv.compile(schema);

const lines = fs.readFileSync(inputPath, "utf-8").split(/\r?\n/).filter(Boolean);
const errors = [];

lines.forEach((rawLine, idx) => {
  const line = rawLine.replace(/^\uFEFF/, "");
  try {
    const event = JSON.parse(line);
    if (event.skipped_reason) return;
    if (!validate(event)) {
      errors.push({ index: idx + 1, message: ajv.errorsText(validate.errors, { separator: "; " }) });
    }
  } catch (err) {
    errors.push({ index: idx + 1, message: `JSON parse error: ${err instanceof Error ? err.message : String(err)}` });
  }
});

if (errors.length) {
  console.error(`[schema:validate] FAIL: ${errors.length} errors`);
  errors.slice(0, 10).forEach((err) => {
    console.error(`[schema:validate]   line ${err.index}: ${err.message}`);
  });
  if (errors.length > 10) {
    console.error(`[schema:validate]   ... and ${errors.length - 10} more errors`);
  }
  process.exit(1);
}

console.log(`[schema:validate] OK (${lines.length} events checked)`);

