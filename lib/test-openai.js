/**
 * Enkelt test för att verifiera OpenAI API-nyckeln
 * Kör med: node lib/test-openai.js
 */

// Ladda .env.local manuellt
const fs = require('fs');
const path = require('path');

// Läs .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const OpenAI = require('openai');

async function testOpenAI() {
  console.log('🔍 Testar OpenAI API-anslutning...\n');
  
  // Kontrollera om API-nyckel finns
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY saknas i .env.local');
    console.error('💡 Lägg till: OPENAI_API_KEY=sk-din-nyckel-här');
    return false;
  }
  
  console.log('✅ OPENAI_API_KEY finns');
  
  // Initiera OpenAI klient
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  try {
    console.log('🧪 Skickar test-anrop till OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Du är en test-assistent. Svara bara 'OK' för att bekräfta att anslutningen fungerar."
        },
        {
          role: "user", 
          content: "Test anslutning"
        }
      ],
      max_tokens: 10
    });
    
    const response = completion.choices[0]?.message?.content;
    
    if (response) {
      console.log('✅ OpenAI API fungerar!');
      console.log(`📝 Svar: "${response.trim()}"`);
      return true;
    } else {
      console.error('❌ Inget svar från OpenAI');
      return false;
    }
    
  } catch (error) {
    console.error('❌ OpenAI API fel:');
    console.error(error.message);
    
    if (error.message.includes('API key')) {
      console.error('💡 Kontrollera att din API-nyckel är korrekt i .env.local');
    }
    return false;
  }
}

// Kör testet
testOpenAI().then(success => {
  if (success) {
    console.log('\n🎉 OpenAI-integration redo att använda!');
  } else {
    console.log('\n🔧 Fixa API-nyckeln i .env.local och försök igen.');
  }
  process.exit(success ? 0 : 1);
});
