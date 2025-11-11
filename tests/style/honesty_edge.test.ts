import { readFileSync } from "fs";
import { join } from "path";

import { simulateReply } from "./helpers/simulateReply";

const CASES_PATH = join(process.cwd(), "tests/golden/style/honesty_edge_cases.jsonl");
const CASES = readFileSync(CASES_PATH, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

describe("Honesty edge cases", () => {
  for (const tc of CASES) {
    test(
      tc.seed_id,
      async () => {
        const result = await simulateReply(tc);
        const body = result.reply_text.toLowerCase();

        if (tc.expect.reply_lang) {
          expect(result.reply_lang).toBe(tc.expect.reply_lang);
        }

        if (tc.expect.must_include) {
          expect(body).toContain(String(tc.expect.must_include).toLowerCase());
        }

        if (tc.expect.probe_includes) {
          expect(body).toContain(String(tc.expect.probe_includes).toLowerCase());
        }

        if (tc.expect.echo_ratio_max !== undefined) {
          expect(result.style.echo_ratio).toBeLessThanOrEqual(tc.expect.echo_ratio_max);
        }

        if (tc.expect.honesty_expected !== undefined) {
          expect(result.honesty.active).toBe(Boolean(tc.expect.honesty_expected));
        }

        if (Array.isArray(tc.expect.reasons)) {
          for (const reason of tc.expect.reasons) {
            expect(result.honesty.reasons).toContain(reason);
          }
        }

        if (tc.expect.no_advice !== undefined) {
          expect(result.honesty.no_advice).toBe(Boolean(tc.expect.no_advice));
        }

        const maxQuestions = tc.expect.max_questions ?? 1;
        expect(result.style.question_count).toBeLessThanOrEqual(maxQuestions);

        if (tc.expect.tone === "professional_warm") {
          expect(result.mode).toBe("hr");
        }
      },
      10_000,
    );
  }
});
