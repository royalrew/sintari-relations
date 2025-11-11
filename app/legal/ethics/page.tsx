import Link from "next/link";

export default function EthicsPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 prose prose-sm sm:prose lg:prose-lg">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Etik & ansvarsbegränsning</h1>
      <p className="text-gray-600 mb-8">
        <strong>Senast uppdaterad:</strong> 2025-10-18
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">Syfte</h2>
      <p className="text-gray-700 leading-relaxed">
        Denna tjänst ger AI-genererade reflektioner för att stödja samtal och självinsikt. 
        Den ersätter inte professionell rådgivning.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">Samtycke</h2>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li>Använd med samtycke från berörda personer.</li>
        <li>Dela endast information du har rätt att dela.</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">Integritet & dataskydd</h2>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li>Personuppgifter behandlas endast för det ändamål du väljer (analys/export).</li>
        <li>Du kan radera data efter användning. Lagra lokalt eller hos oss endast om du aktivt väljer det.</li>
        <li>Maskera namn/identifierande uppgifter vid behov.</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">Begränsningar & bias</h2>
      <ul className="list-disc pl-6 text-gray-700 space-y-2">
        <li>AI kan ha bias, sakna kontext och ge felaktiga slutsatser.</li>
        <li>Gör inte kritiska beslut enbart baserat på rapporterna.</li>
      </ul>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">Akuta situationer</h2>
      <p className="text-gray-700 leading-relaxed">
        Tjänsten hanterar inte kris eller akuta lägen. Kontakta professionell hjälp vid behov.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">Åldersgräns</h2>
      <p className="text-gray-700 leading-relaxed">
        Tjänsten är avsedd för personer 18 år och äldre.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">Transparens</h2>
      <p className="text-gray-700 leading-relaxed">
        Analysen genereras av AI och kan kompletteras av mänsklig granskning. 
        Vi strävar efter spårbarhet och loggning där du godkänner det.
      </p>

      <h2 className="text-2xl font-semibold text-gray-800 mt-8 mb-4">Ansvarsbegränsning</h2>
      <p className="text-gray-700 leading-relaxed">
        Vi ansvarar inte för indirekta skador eller beslut som fattas utifrån rapporterna. 
        Användaren bär ansvar för hur resultatet används.
      </p>

      <div className="mt-12 p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="text-sm text-purple-900">
          <strong>Kontakt:</strong> För frågor om policyn eller integritet, kontakta oss på{" "}
          <a href="mailto:ethics@sintari.ai" className="underline">ethics@sintari.ai</a>
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

