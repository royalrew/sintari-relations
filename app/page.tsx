"use client";

import { useState } from "react";
import { analyzeRelation } from "./actions/analyzeRelation";
import { DisclaimerBanner } from "./components/DisclaimerBanner";

export default function Home() {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [reflections, setReflections] = useState<string[] | null>(null);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [safetyFlag, setSafetyFlag] = useState(false);
  const [formData, setFormData] = useState<{ person1: string; person2: string; description: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setReflections(null);
    setRecommendation(null);

    const form = e.currentTarget;
    const formDataObj = new FormData(form);
    const res = await analyzeRelation(formDataObj);

    if (res.ok) {
      setReflections(res.data.reflections);
      setRecommendation(res.data.recommendation);
      setSafetyFlag(res.data.safetyFlag);
      
      // Store form data for PDF generation
      setFormData({
        person1: formDataObj.get("person1") as string,
        person2: formDataObj.get("person2") as string,
        description: formDataObj.get("description") as string,
      });
    } else if (res.error === "VALIDATION_ERROR" && res.issues) {
      setErrors(res.issues);
    } else {
      setErrors({ _form: ["Något gick fel. Försök igen."] });
    }

    setPending(false);
  }

  const handleDownloadPDF = async () => {
    if (!reflections || !recommendation || !formData) return;

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          reflections,
          recommendation,
          safetyFlag,
          createdAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Export misslyckades");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relationsanalys_${formData.person1}_${formData.person2}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF export error:", error);
      alert("Kunde inte skapa PDF. Försök igen.");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12 pt-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
            Sintari Relations
          </h1>
          <p className="text-gray-600 text-lg">Analysera och förstå dina relationer med AI</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="person1" className="block text-sm font-semibold text-gray-700 mb-2">
                Person 1
              </label>
              <input
                id="person1"
                name="person1"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="T.ex. Anna"
              />
              {errors.person1?.[0] && <p className="mt-1 text-sm text-red-600">{errors.person1[0]}</p>}
            </div>

            <div>
              <label htmlFor="person2" className="block text-sm font-semibold text-gray-700 mb-2">
                Person 2
              </label>
              <input
                id="person2"
                name="person2"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="T.ex. Erik"
              />
              {errors.person2?.[0] && <p className="mt-1 text-sm text-red-600">{errors.person2[0]}</p>}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                Beskrivning av relationen
              </label>
              <textarea
                id="description"
                name="description"
                rows={6}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
                placeholder="Beskriv relationen, utmaningar och styrkor..."
              />
              {errors.description?.[0] && <p className="mt-1 text-sm text-red-600">{errors.description[0]}</p>}
              <p className="mt-2 text-sm text-gray-500">Dela detaljer för bättre analys.</p>
            </div>

            {/* Samtycke */}
            <div className="flex items-start gap-2">
              <input
                id="consent"
                name="consent"
                type="checkbox"
                required
                className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <label htmlFor="consent" className="text-sm text-gray-700">
                Jag bekräftar samtycke och har läst{" "}
                <a
                  href="/legal/ethics"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-purple-600 hover:text-purple-800"
                >
                  Etik & ansvarsbegränsning
                </a>
                .
              </label>
            </div>
            {errors.consent?.[0] && <p className="text-sm text-red-600">{errors.consent[0]}</p>}

            <button
              type="submit"
              disabled={pending}
              className={`w-full py-4 rounded-lg font-semibold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
                pending
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl"
              }`}
            >
              {pending ? "Analyserar…" : "Analysera relation"}
            </button>

            {errors._form?.[0] && <p className="text-red-600 text-sm text-center">{errors._form[0]}</p>}
          </form>

          {/* Disclaimer Banner */}
          <DisclaimerBanner />

          {reflections && (
            <div className="mt-8 space-y-4 animate-fade-in">
              <div className="p-5 rounded-xl border-2 bg-indigo-50 border-indigo-200">
                <p className="font-bold text-indigo-800 text-lg mb-3 flex items-center gap-2">
                  <span>💭</span> Reflektioner
                </p>
                <ul className="space-y-2">
                  {reflections.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-indigo-600 font-semibold">{i + 1}.</span>
                      <span className="text-indigo-900">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`p-5 rounded-xl border-2 ${safetyFlag ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className={`font-bold text-lg mb-3 flex items-center gap-2 ${safetyFlag ? 'text-red-800' : 'text-emerald-800'}`}>
                  <span>{safetyFlag ? '🛡️' : '✨'}</span> Rekommendation
                </p>
                <p className={`leading-relaxed ${safetyFlag ? 'text-red-900' : 'text-emerald-900'}`}>{recommendation}</p>
              </div>

              {/* Safety help link */}
              {safetyFlag && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">
                    Behöver du stöd? Prata med någon du litar på eller sök professionell hjälp.{" "}
                    <a href="/legal/ethics" className="underline font-semibold">Läs mer om stöd</a>.
                  </p>
                </div>
              )}

              {/* PDF Download Button */}
              <button
                onClick={handleDownloadPDF}
                className="w-full py-4 rounded-lg font-semibold text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <span>📄</span> Ladda ner PDF
              </button>
            </div>
          )}
        </div>

        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>Månad 1 • Dag 4 • Ethics & Safety v1 ✓</p>
        </div>
      </div>
    </main>
  );
}
