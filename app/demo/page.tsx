"use client";

import Link from "next/link";
import { useState } from "react";

// Fördefinierade exempel-scenarion
const exampleScenarios = [
  {
    id: 1,
    title: "Anna & Erik - Kommunikationsproblem",
    person1: "Anna",
    person2: "Erik",
    description: "Vi har varit tillsammans i två år. På senaste tiden känns det som att vi pratar förbi varandra. Anna känner att Erik inte lyssnar när hon berättar om sin dag, och Erik känner att Anna alltid kritiserar honom. Vi vill förbättra vår kommunikation men vet inte var vi ska börja.",
    reflections: [
      "Det finns en ömsesidig önskan om förbättring, vilket är en stark grund att bygga på.",
      "Båda parter upplever att de inte blir hörda, vilket tyder på att det kan finnas behov av mer strukturerade samtal.",
      "Känslan av att bli kritiserad kan skapa försvarsmekanismer som försvårar öppen kommunikation."
    ],
    recommendation: "Planera regelbundna 'check-in'-samtal där ni båda får utrymme att berätta utan avbrott. Använd 'jag-känslor' istället för 'du-kritik'. Överväg att sätta en timer så båda får lika mycket tid att prata."
  },
  {
    id: 2,
    title: "Sara & Marcus - Arbetslivsbalans",
    person1: "Sara",
    person2: "Marcus",
    description: "Sara arbetar mycket och känner sig stressad. Marcus tycker att hon prioriterar jobbet framför relationen. Sara känner sig dömd och Marcus känner sig ignorerad. Vi älskar varandra men kämpar med att hitta balans.",
    reflections: [
      "Båda parter har legitima behov - Sara behöver känna stöd för sitt arbete, Marcus behöver känna sig prioriterad.",
      "Det finns en grundläggande kärlek som kan vara en styrka att bygga vidare på.",
      "Olika perspektiv på vad som är viktigt kan skapa konflikt om det inte kommuniceras tydligt."
    ],
    recommendation: "Sätt upp gemensamma 'relationstider' i kalendern som är lika viktiga som arbetsmöten. Diskutera vad ni båda behöver för att känna er sedda och prioriterade. Överväg att skapa en gemensam vision för hur ni vill att relationen ska fungera."
  },
  {
    id: 3,
    title: "Lisa & David - Framtidsplanering",
    person1: "Lisa",
    person2: "David",
    description: "Vi har olika syn på framtiden. Lisa vill flytta till större stad och byta karriär, medan David är nöjd där vi är. Vi undrar om vi har samma mål och om vi kan hitta en väg framåt tillsammans.",
    reflections: [
      "Olika framtidsvisioner behöver inte vara ett hinder om ni kan hitta kompromisser och gemensamma mål.",
      "Det är viktigt att båda känner att deras drömmar tas på allvar och diskuteras öppet.",
      "Att ha olika perspektiv kan faktiskt stärka er relation om ni lär er att navigera skillnaderna tillsammans."
    ],
    recommendation: "Organisera ett strukturerat samtal där ni båda får presentera era visioner utan att den andra avbryter. Identifiera vad som är viktigast för var och en och utforska kreativa lösningar. Överväg att sätta upp en tidslinje för att ge er båda tid att tänka och anpassa er."
  }
];

export default function DemoPage() {
  const [selectedScenario, setSelectedScenario] = useState<typeof exampleScenarios[0] | null>(null);

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10 pt-6">
          <Link href="/" className="inline-block mb-4 text-purple-600 hover:text-purple-800">
            ← Tillbaka till startsidan
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-3">
            Demo - Se hur det fungerar
          </h1>
          <p className="text-gray-600 text-base sm:text-lg">
            Klicka på ett exempel nedan för att se en färdig analys. Ingen betalning krävs!
          </p>
        </div>

        {/* Exempel-scenarion */}
        {!selectedScenario ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {exampleScenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all cursor-pointer hover:-translate-y-1"
                onClick={() => setSelectedScenario(scenario)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                    {scenario.person1[0]}{scenario.person2[0]}
                  </div>
                  <h3 className="font-semibold text-gray-900 text-lg">{scenario.title}</h3>
                </div>
                <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                  {scenario.description}
                </p>
                <button className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:from-purple-700 hover:to-blue-700 transition-all">
                  Se analys →
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100">
            {/* Tillbaka-knapp */}
            <button
              onClick={() => setSelectedScenario(null)}
              className="mb-6 text-purple-600 hover:text-purple-800 flex items-center gap-2"
            >
              ← Tillbaka till exempel
            </button>

            {/* Scenario info */}
            <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">{selectedScenario.title}</h2>
              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>Person 1:</strong> {selectedScenario.person1}</p>
                <p><strong>Person 2:</strong> {selectedScenario.person2}</p>
                <p className="mt-3"><strong>Beskrivning:</strong></p>
                <p className="text-gray-600 leading-relaxed">{selectedScenario.description}</p>
              </div>
            </div>

            {/* Analys-resultat */}
            <div className="space-y-4">
              <div className="p-5 rounded-xl border-2 bg-indigo-50 border-indigo-200">
                <p className="font-bold text-indigo-800 text-lg mb-3 flex items-center gap-2">
                  <span>💭</span> Reflektioner
                </p>
                <ul className="space-y-3">
                  {selectedScenario.reflections.map((r, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-indigo-600 font-semibold flex-shrink-0">{i + 1}.</span>
                      <span className="text-indigo-900">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-5 rounded-xl border-2 bg-emerald-50 border-emerald-200">
                <p className="font-bold text-emerald-800 text-lg mb-3 flex items-center gap-2">
                  <span>✨</span> Rekommendation
                </p>
                <p className="text-emerald-900 leading-relaxed">{selectedScenario.recommendation}</p>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Redo för din egen analys?</h3>
              <p className="text-gray-600 mb-4">
                Få en personlig AI-analys baserad på din egen situation. Inkluderar PDF-export och detaljerade reflektioner.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/analyze"
                  className="flex-1 py-3 px-6 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all text-center"
                >
                  Skapa din egen analys
                </Link>
                <Link
                  href="/#pricing"
                  className="flex-1 py-3 px-6 rounded-lg font-semibold text-purple-700 bg-white border-2 border-purple-200 hover:bg-purple-50 transition-all text-center"
                >
                  Se priser
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Info-box */}
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Obs:</strong> Detta är exempel-analyser för demonstration. För att få en analys baserad på din egen situation, 
            gå till <Link href="/analyze" className="underline font-semibold">Analys-sidan</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}

