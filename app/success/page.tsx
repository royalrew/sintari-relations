"use client";

import { useEffect, useState } from "react";

export default function SuccessPage() {
  const [sessionData, setSessionData] = useState<{
    person1: string;
    person2: string;
    sessionId: string;
  } | null>(null);

  useEffect(() => {
    // Get URL parameters
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const person1 = urlParams.get('person1');
      const person2 = urlParams.get('person2');
      const sessionId = urlParams.get('session_id');

      if (person1 && person2 && sessionId) {
        setSessionData({
          person1: decodeURIComponent(person1),
          person2: decodeURIComponent(person2),
          sessionId,
        });
      }
    }
  }, []);

  if (!sessionData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifierar betalning...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100 text-center">
          <div className="mb-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">✅</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Betalning genomförd!
            </h1>
            <p className="text-gray-600">
              Tack för din betalning. Din analys kommer att behandlas snart.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-6 mb-8">
            <h2 className="font-semibold text-gray-700 mb-4">Betalningsdetaljer</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Analys för:</span>
                <span className="font-medium">{sessionData.person1} & {sessionData.person2}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Belopp:</span>
                <span className="font-medium">49 SEK</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Betalnings-ID:</span>
                <span className="font-mono text-xs">{sessionData.sessionId.slice(0, 20)}...</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-gray-600">
              Du kommer att få en bekräftelse via e-post och din analys kommer att behandlas inom 24 timmar.
            </p>
            
            <div className="flex gap-4 justify-center">
              <a
                href="/"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all"
              >
                Tillbaka till startsidan
              </a>
              <button
                onClick={() => window.print()}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all"
              >
                Skriv ut kvitto
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
