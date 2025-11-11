import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 prose prose-sm sm:prose lg:prose-lg">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Användarvillkor</h1>
      <p className="text-gray-600 mb-8">
        <strong>Senast uppdaterad:</strong> 2025-01-18
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">1. Accepterande av villkor</h2>
      <p className="text-gray-700 leading-relaxed">
        Genom att använda Sintari Relations ("tjänsten", "vi", "oss") accepterar du dessa användarvillkor. 
        Om du inte accepterar dessa villkor, vänligen använd inte tjänsten.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">2. Beskrivning av tjänsten</h2>
      <p className="text-gray-700 leading-relaxed">
        Sintari Relations är en AI-driven tjänst som ger reflektioner och analyser för att stödja samtal och självinsikt 
        i relationer. Tjänsten är avsedd som ett verktyg för stöd och ersätter inte professionell terapi, rådgivning eller medicinsk vård.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">3. Användarkrav</h2>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li>Du måste vara minst 18 år gammal för att använda tjänsten</li>
        <li>Du måste ha rätt att dela information om personer som nämns i dina analyser</li>
        <li>Du måste ge korrekt och sanningsenlig information</li>
        <li>Du får inte använda tjänsten för olagliga ändamål</li>
        <li>Du ansvarar för att hålla ditt konto och lösenord säkra</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">4. Prenumerationer och betalning</h2>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li><strong>Priser:</strong> Alla priser anges i svenska kronor (SEK) och kan ändras med förvarning</li>
        <li><strong>Provperiod:</strong> 7 dagars provperiod ingår i alla paket. Du kan avsluta när som helst under provperioden utan kostnad</li>
        <li><strong>Fakturering:</strong> Efter provperioden faktureras du månadsvis enligt ditt valda paket</li>
        <li><strong>Uppsägning:</strong> Du kan när som helst avsluta din prenumeration. Uppsägning sker i slutet av den aktuella faktureringsperioden</li>
        <li><strong>Återbetalning:</strong> Återbetalning ges endast enligt svensk konsumentlagstiftning</li>
        <li><strong>Betalningsmetoder:</strong> Vi accepterar betalning via Klarna och Stripe</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">5. Användaransvar</h2>
      <p className="text-gray-700 leading-relaxed mb-2">
        Du ansvarar för:
      </p>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li>Att använda tjänsten på ett ansvarsfullt sätt</li>
        <li>Att respektera integriteten och samtycket från personer som nämns i dina analyser</li>
        <li>Att inte använda tjänsten för att skada, hota eller trakassera andra</li>
        <li>Att inte försöka komma åt eller störa tjänstens tekniska infrastruktur</li>
        <li>Att hålla din kontoinformation uppdaterad och korrekt</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">6. Begränsningar och ansvarsfriskrivning</h2>
      <p className="text-gray-700 leading-relaxed mb-2">
        <strong>VIKTIGT:</strong> Tjänsten är inte avsedd för:
      </p>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li>Akuta kriser eller suicidala situationer – kontakta 112 eller jourhavande präst</li>
        <li>Ersättning för professionell terapi eller medicinsk vård</li>
        <li>Juridisk rådgivning eller beslut i juridiska frågor</li>
      </ul>
      <p className="text-gray-700 leading-relaxed mt-4">
        Vi ansvarar inte för:
      </p>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li>Beslut eller handlingar som fattas baserat på AI-genererade analyser</li>
        <li>Indirekta, tillfälliga eller följdskador från användning av tjänsten</li>
        <li>Felaktigheter eller bias i AI-genererade analyser</li>
        <li>Förlust av data eller avbrott i tjänsten</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">7. Immateriella rättigheter</h2>
      <p className="text-gray-700 leading-relaxed">
        Allt innehåll på tjänsten, inklusive texter, grafik, logotyper och programvara, är skyddat av upphovsrätt och tillhör 
        Sintari Relations eller våra licensgivare. Du får inte kopiera, modifiera eller distribuera innehållet utan vårt skriftliga samtycke.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">8. Användargenererat innehåll</h2>
      <p className="text-gray-700 leading-relaxed">
        När du skapar analyser eller delar information genom tjänsten behåller du äganderätten till ditt innehåll. 
        Genom att använda tjänsten ger du oss en licens att använda, lagra och behandla ditt innehåll för att tillhandahålla och förbättra tjänsten.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">9. Uppsägning</h2>
      <p className="text-gray-700 leading-relaxed">
        Vi förbehåller oss rätten att avsluta eller suspendera ditt konto om du bryter mot dessa villkor, 
        använder tjänsten på ett olagligt sätt eller om vi av andra skäl anser det nödvändigt. 
        Du kan när som helst avsluta ditt konto genom att kontakta oss eller via kontoinställningarna.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">10. Ändringar av villkoren</h2>
      <p className="text-gray-700 leading-relaxed">
        Vi kan uppdatera dessa användarvillkor från tid till annan. Betydande ändringar meddelas via e-post eller 
        genom ett meddelande på webbplatsen. Fortsatt användning efter ändringar innebär acceptans av de nya villkoren.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">11. Tillämplig lag och tvister</h2>
      <p className="text-gray-700 leading-relaxed">
        Dessa villkor regleras av svensk lag. Eventuella tvister ska först försöka lösas genom förhandlingar. 
        Om förhandlingar inte lyckas ska tvisten avgöras av svensk domstol.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">12. Konsumenträttigheter</h2>
      <p className="text-gray-700 leading-relaxed">
        Om du är konsument har du rättigheter enligt svensk konsumentlagstiftning, inklusive rätt till ångerrätt inom 14 dagar 
        från köpet (med vissa undantag för digitala tjänster som du har börjat använda med samtycke).
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">13. Kontakt</h2>
      <p className="text-gray-700 leading-relaxed">
        För frågor om dessa användarvillkor, kontakta oss:
      </p>

      <div className="mt-12 p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="text-sm text-purple-900">
          <strong>E-post:</strong>{" "}
          <a href="mailto:hej@sintari.se" className="underline">hej@sintari.se</a>
        </p>
        <p className="text-sm text-purple-900 mt-2">
          <strong>Postadress:</strong> Sintari Relations, [Adress], Sverige
        </p>
      </div>

      <div className="mt-8 text-center">
        <Link 
          href="/" 
          className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
        >
          ← Tillbaka till startsidan
        </Link>
      </div>
    </main>
  );
}

