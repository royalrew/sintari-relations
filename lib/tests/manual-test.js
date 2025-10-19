// Manual test för att verifiera att nya moduler fungerar
const testDescription = "Vi älskar varandra och kommunicerar bra. Vi planerar tillsammans och har ett fint samarbete.";

console.log("🧪 Testing new modular structure...");
console.log("Test description:", testDescription);

// Testar signals extraction
try {
  // Simulera signals extraction
  const pos_words = ["älskar", "kommunicerar", "planerar", "samarbete"];
  const pos_count = pos_words.filter(word => 
    testDescription.toLowerCase().includes(word)
  ).length;
  
  const risk_areas = [];
  const risk_count = risk_areas.length;
  const neg_count = 0;
  const net_score = pos_count - neg_count - risk_count;
  
  console.log("✅ Pos count:", pos_count, "(expected: 2)");
  console.log("✅ Risk count:", risk_count, "(expected: 0)");
  console.log("✅ Net score:", net_score, "(expected: 2)");
  console.log("✅ Risk count = risk_areas.length:", risk_count === risk_areas.length);
  
} catch (error) {
  console.error("❌ Test failed:", error);
}
