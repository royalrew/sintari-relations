import { describe, expect, test } from "@jest/globals";
import { performance } from "node:perf_hooks";

import { buildIndex, resolveNameFast } from "@/lib/memory/subject_resolver";
import { subjectsFixture } from "@/lib/memory/__perf__/fixtures";

const WARMUP_CALLS = 2_000;
const SAMPLE_CALLS = 10_000;

describe("subject resolver perf", () => {
  test("p95 < 8ms", () => {
    const index = buildIndex(subjectsFixture);
    const queries = subjectsFixture.flatMap((subject) => {
      const list = [subject.primary_name];
      subject.aliases.forEach((alias) => list.push(alias.value));
      return list;
    });

    for (let i = 0; i < WARMUP_CALLS; i += 1) {
      resolveNameFast(queries[i % queries.length], index);
    }

    const samples: number[] = [];
    for (let i = 0; i < SAMPLE_CALLS; i += 1) {
      const base = queries[(i * 7) % queries.length];
      const query = i % 10 === 0 ? `${base} ` : base;
      const t0 = performance.now();
      resolveNameFast(query, index);
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThan(8);
  });
});

