import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 prose prose-sm sm:prose lg:prose-lg">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Integritetspolicy</h1>
      <p className="text-gray-600 mb-8">
        <strong>Senast uppdaterad:</strong> 2025-01-18
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">1. Introduktion</h2>
      <p className="text-gray-700 leading-relaxed">
        Sintari Relations ("vi", "oss", "vår") respekterar din integritet och är engagerade i att skydda dina personuppgifter. 
        Denna integritetspolicy förklarar hur vi samlar in, använder, delar och skyddar dina personuppgifter när du använder vår tjänst.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">2. Personuppgifter vi samlar in</h2>
      <p className="text-gray-700 leading-relaxed mb-2">
        Vi samlar in följande typer av personuppgifter:
      </p>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li><strong>Kontaktinformation:</strong> E-postadress när du registrerar dig eller kontaktar oss</li>
        <li><strong>Användningsdata:</strong> Information om hur du använder tjänsten, inklusive analyser och samtal du skapar</li>
        <li><strong>Teknisk data:</strong> IP-adress, webbläsartyp, enhetsinformation och liknande teknisk information</li>
        <li><strong>Betalningsinformation:</strong> Betalningsdata hanteras av tredjepartstjänster (Klarna/Stripe) enligt deras integritetspolicyer</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">3. Hur vi använder dina personuppgifter</h2>
      <p className="text-gray-700 leading-relaxed mb-2">
        Vi använder dina personuppgifter för följande ändamål:
      </p>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li>För att tillhandahålla och förbättra vår tjänst</li>
        <li>För att generera AI-analyser baserat på information du delar</li>
        <li>För att hantera ditt konto och prenumerationer</li>
        <li>För att kommunicera med dig om tjänsten, uppdateringar och support</li>
        <li>För att följa lagliga skyldigheter och förhindra bedrägerier</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">4. Laglig grund för behandling</h2>
      <p className="text-gray-700 leading-relaxed">
        Vi behandlar dina personuppgifter baserat på följande lagliga grunder enligt GDPR:
      </p>
      <ul className="list-disc pl-6 text-gray-700 space-y-2 mt-2">
        <li><strong>Samtycke:</strong> När du aktivt samtycker till behandling</li>
        <li><strong>Avtalsfullföljelse:</strong> För att uppfylla våra åtaganden gentemot dig</li>
        <li><strong>Berättigat intresse:</strong> För att förbättra vår tjänst och förhindra bedrägerier</li>
        <li><strong>Laglig skyldighet:</strong> När vi är skyldiga att behandla data enligt lag</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">5. Datadelning och tredjeparter</h2>
      <p className="text-gray-700 leading-relaxed mb-2">
        Vi delar inte dina personuppgifter med tredjeparter utom i följande fall:
      </p>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li><strong>Tjänsteleverantörer:</strong> Vi använder tredjepartstjänster för betalningar (Klarna/Stripe), hosting och AI-analys. Dessa leverantörer är bundna av sekretessavtal</li>
        <li><strong>Lagliga krav:</strong> Vi kan dela information om vi är skyldiga enligt lag eller för att skydda våra rättigheter</li>
        <li><strong>Med ditt samtycke:</strong> Vi delar aldrig data utan ditt uttryckliga samtycke</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">6. Datasäkerhet</h2>
      <p className="text-gray-700 leading-relaxed">
        Vi implementerar tekniska och organisatoriska åtgärder för att skydda dina personuppgifter, inklusive kryptering, 
        säkra servrar och begränsad åtkomst. Trots detta kan ingen metod för överföring eller lagring vara 100% säker.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">7. Dina rättigheter</h2>
      <p className="text-gray-700 leading-relaxed mb-2">
        Enligt GDPR har du följande rättigheter:
      </p>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li><strong>Rätt till tillgång:</strong> Du kan begära en kopia av dina personuppgifter</li>
        <li><strong>Rätt till rättelse:</strong> Du kan begära att felaktiga uppgifter korrigeras</li>
        <li><strong>Rätt till radering:</strong> Du kan begära att dina personuppgifter raderas ("right to be forgotten")</li>
        <li><strong>Rätt till begränsning:</strong> Du kan begära att behandlingen begränsas</li>
        <li><strong>Rätt till dataportabilitet:</strong> Du kan begära att få dina data i ett strukturerat format</li>
        <li><strong>Rätt att invända:</strong> Du kan invända mot behandling baserad på berättigat intresse</li>
        <li><strong>Rätt att återkalla samtycke:</strong> Du kan när som helst återkalla ditt samtycke</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">8. Datakonservering</h2>
      <p className="text-gray-700 leading-relaxed">
        Vi behåller dina personuppgifter endast så länge som det är nödvändigt för ändamålen de samlades in för, 
        eller så länge som krävs enligt lag. Du kan när som helst begära radering av dina data genom att kontakta oss.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">9. Cookies och spårning</h2>
      <p className="text-gray-700 leading-relaxed">
        Vi använder cookies och liknande tekniker för att förbättra din upplevelse, analysera användning och hantera sessioner. 
        Du kan hantera cookie-inställningar i din webbläsare.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">10. Internationell dataöverföring</h2>
      <p className="text-gray-700 leading-relaxed">
        Dina personuppgifter kan behandlas utanför EU/EES. I så fall säkerställer vi att lämpliga skyddsåtgärder finns på plats, 
        till exempel standardavtalsklausuler enligt GDPR.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">11. Ändringar av denna policy</h2>
      <p className="text-gray-700 leading-relaxed">
        Vi kan uppdatera denna integritetspolicy från tid till annan. Vi meddelar dig om betydande ändringar via e-post eller 
        genom att visa ett meddelande på vår webbplats. Den uppdaterade versionen gäller från publiceringsdatumet.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">12. Kontakt</h2>
      <p className="text-gray-700 leading-relaxed">
        För frågor om denna integritetspolicy eller för att utöva dina rättigheter, kontakta oss:
      </p>

      <div className="mt-12 p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="text-sm text-purple-900">
          <strong>E-post:</strong>{" "}
          <a href="mailto:privacy@sintari.se" className="underline">privacy@sintari.se</a>
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

