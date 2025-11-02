#!/usr/bin/env node
/**
 * Seed Emotion Batch - Kör 50-300 analyser för att generera emotion events
 * Steg 99: Brain First Plan - Seeda live-data
 * 
 * Användning:
 *   node scripts/seed_emotion_batch.mjs [antal]
 * 
 * Default: 50 körningar
 */

import http from "http";

const HOST = process.env.HOST || "localhost";
const PORT = parseInt(process.env.PORT || "3000", 10);
const COUNT = parseInt(process.argv[2] || "50", 10);

const samples = [
  { p1: "Maja", p2: "Erik", desc: "Vi älskar varandra men bråkar ibland om småsaker 🙂", lang: "sv" },
  { p1: "Anna", p2: "Johan", desc: "Jag känner mig överväldigad 😔 men vill lösa det.", lang: "sv" },
  { p1: "Sara", p2: "Leo", desc: "Everything is fine, just minor tension about chores.", lang: "en" },
  { p1: "Nora", p2: "Kim", desc: "Jag ger upp, det känns hopplöst 💔", lang: "sv" },
  { p1: "Emma", p2: "Lucas", desc: "We had a great weekend but now we're arguing again.", lang: "en" },
  { p1: "Ella", p2: "Noah", desc: "Jag är så glad att vi pratade igenom det 😊", lang: "sv" },
  { p1: "Isabella", p2: "William", desc: "Feeling stressed about work, need space.", lang: "en" },
  { p1: "Sofia", p2: "Oscar", desc: "Tack för att du lyssnade på mig ❤️", lang: "sv" },
  { p1: "Olivia", p2: "Elias", desc: "I don't know what to do anymore...", lang: "en" },
  { p1: "Maya", p2: "Adam", desc: "Jag känner mig trygg med dig 🫶", lang: "sv" },
];

function postAnalyze(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: "/analyze",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on("error", (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`🌱 Seeding ${COUNT} emotion events...`);
  console.log(`   Target: http://${HOST}:${PORT}/analyze`);
  console.log("");

  let success = 0;
  let errors = 0;

  for (let i = 0; i < COUNT; i++) {
    const s = samples[i % samples.length];
    const body = {
      person1: s.p1,
      person2: s.p2,
      description: s.desc,
      language: s.lang,
    };

    try {
      await postAnalyze(body);
      success++;
      process.stdout.write(".");
      
      // Small delay to avoid overwhelming the server
      if ((i + 1) % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      errors++;
      process.stdout.write("E");
      if (errors <= 3) {
        console.error(`\n[Error ${i + 1}]:`, error.message);
      }
    }
  }

  console.log("\n");
  console.log(`✅ Completed: ${success} successful, ${errors} errors`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Run aggregator: node sintari-relations/scripts/agg_emotion_events.mjs");
  console.log("  2. Check dashboard: http://localhost:3000/dashboard");
  console.log("  3. Verify events in: sintari-relations/reports/emotion_events/");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

