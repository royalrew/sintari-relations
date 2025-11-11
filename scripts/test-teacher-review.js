/**
 * Test script för att manuellt trigga en teacher review
 * 
 * Kör med: node scripts/test-teacher-review.js
 */

const fetch = require("node-fetch");

async function testTeacherReview() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  
  console.log("🧪 Testar teacher review via API...\n");

  try {
    const response = await fetch(`${baseUrl}/api/test-teacher-review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userInput: "Jag är blyg och vill bli bättre på att tala inför folk",
        coachReply: "Jag hör att du är blyg och vill bli bättre på att tala inför folk. Vad känns det som när du tänker på det?",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Fel:");
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log("✅ Review skapad!");
    console.log(`   Poäng: ${data.review.score}/10`);
    console.log(`   Severity: ${data.review.severity}`);
    console.log(`   Svagheter: ${data.review.weaknesses.length}`);
    console.log(`   Förslag: ${data.review.suggestions.length}`);
    console.log(`\n📊 ${data.message}\n`);

  } catch (error) {
    console.error("❌ Fel vid test:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testTeacherReview();

