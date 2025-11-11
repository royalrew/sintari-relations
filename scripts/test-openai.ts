/**
 * Test script för att verifiera OpenAI API-nyckel och Quality Teacher
 * 
 * Kör med: npx tsx scripts/test-openai.ts
 * eller: npm run test:openai (om script finns i package.json)
 */

import { config } from "dotenv";
import { join } from "path";

// Ladda .env från backend-mappen
config({ path: join(process.cwd(), "backend", ".env") });
config({ path: join(process.cwd(), ".env.local") });
config({ path: join(process.cwd(), ".env") });

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  const enableTeacher = process.env.ENABLE_QUALITY_TEACHER;
  const teacherModel = process.env.OPENAI_TEACHER_MODEL || "gpt-4o";

  console.log("🔍 Testar OpenAI-konfiguration...\n");
  console.log(`ENABLE_QUALITY_TEACHER: ${enableTeacher || "undefined"}`);
  console.log(`OPENAI_TEACHER_MODEL: ${teacherModel}`);
  console.log(`OPENAI_API_KEY: ${apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : "Saknas!"}\n`);

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY saknas i .env!");
    console.log("\n📝 Lägg till i backend/.env:");
    console.log("   OPENAI_API_KEY=sk-...");
    console.log("   ENABLE_QUALITY_TEACHER=true");
    console.log("   OPENAI_TEACHER_MODEL=gpt-4o");
    process.exit(1);
  }

  if (enableTeacher !== "true") {
    console.warn("⚠️  ENABLE_QUALITY_TEACHER är inte satt till 'true'");
    console.log("\n📝 Lägg till i backend/.env:");
    console.log("   ENABLE_QUALITY_TEACHER=true");
  }

  console.log("🧪 Testar OpenAI API-anslutning...\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: teacherModel === "gpt-5" ? "gpt-4o" : teacherModel, // Fallback om gpt-5 inte finns ännu
        messages: [
          {
            role: "system",
            content: "Du är en test-assistent. Svara bara 'OK' om du hör mig.",
          },
          {
            role: "user",
            content: "Hej, hör du mig?",
          },
        ],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
      console.error("❌ OpenAI API-fel:");
      console.error(`   Status: ${response.status}`);
      console.error(`   Meddelande: ${errorData.error?.message || response.statusText}`);
      
      if (response.status === 401) {
        console.error("\n💡 Din API-nyckel är ogiltig eller har utgått.");
        console.error("   Kontrollera din nyckel på: https://platform.openai.com/api-keys");
      } else if (response.status === 429) {
        console.error("\n💡 Du har nått rate limit. Vänta en stund och försök igen.");
      }
      process.exit(1);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    console.log("✅ OpenAI API-anslutning fungerar!");
    console.log(`   Modell: ${teacherModel}`);
    console.log(`   Svar: ${reply || "Inget svar"}\n`);

    if (enableTeacher === "true") {
      console.log("✅ Quality Teacher är aktiverad!");
      console.log("\n📊 Nästa steg:");
      console.log("   1. Starta servern: npm run dev");
      console.log("   2. Gå till /coach och skicka ett meddelande");
      console.log("   3. Kolla /teacher-reviews för GPT-5 Teacher reviews");
      console.log("   4. Kolla data/teacher-reviews/ för sparade reviews\n");
    } else {
      console.log("⚠️  Quality Teacher är INTE aktiverad.");
      console.log("   Lägg till ENABLE_QUALITY_TEACHER=true i backend/.env\n");
    }

  } catch (error) {
    console.error("❌ Fel vid test av OpenAI API:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testOpenAI().catch((error) => {
  console.error("❌ Oväntat fel:", error);
  process.exit(1);
});

