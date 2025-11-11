"use client";

import { useEffect, useState } from "react";

/**
 * Dashboard för att visa GPT-5 Teacher kvalitetsstatistik
 * 
 * Visar:
 * - Genomsnittlig kvalitetspoäng över tid
 * - Vanligaste svagheter
 * - Identifierade mönster
 * - Förbättringstrender
 */
export function QualityTeacherDashboard() {
  const [stats, setStats] = useState<{
    averageScore: number;
    totalReviews: number;
    severityBreakdown: { pass: number; warn: number; fail: number };
    commonWeaknesses: Array<{ weakness: string; count: number }>;
    patternFlags: Array<{ pattern: string; count: number }>;
    recentReviews: Array<{
      timestamp: number;
      score: number;
      severity: string;
      userInput: string;
      coachReply: string;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Hämta statistik från API eller databas
    // För nu: mock data
    setStats({
      averageScore: 7.2,
      totalReviews: 0,
      severityBreakdown: { pass: 0, warn: 0, fail: 0 },
      commonWeaknesses: [],
      patternFlags: [],
      recentReviews: [],
    });
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="text-sm text-gray-500">Laddar kvalitetsstatistik...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="text-sm text-gray-500">Ingen statistik tillgänglig ännu.</div>
        <div className="mt-2 text-xs text-gray-400">
          Aktivera GPT-5 Teacher genom att sätta ENABLE_QUALITY_TEACHER=true i .env
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Översikt */}
      <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">GPT-5 Teacher Översikt</h2>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold text-gray-900">{stats.averageScore.toFixed(1)}</div>
            <div className="text-sm text-gray-500">Genomsnittlig poäng</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalReviews}</div>
            <div className="text-sm text-gray-500">Totalt bedömningar</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-600">{stats.severityBreakdown.pass}</div>
            <div className="text-sm text-gray-500">Godkända</div>
          </div>
        </div>
      </div>

      {/* Vanligaste svagheter */}
      {stats.commonWeaknesses.length > 0 && (
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-md font-semibold text-gray-900 mb-3">Vanligaste svagheter</h3>
          <ul className="space-y-2">
            {stats.commonWeaknesses.map((item, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{item.weakness}</span>
                <span className="text-sm font-medium text-gray-900">{item.count}x</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Identifierade mönster */}
      {stats.patternFlags.length > 0 && (
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-md font-semibold text-gray-900 mb-3">Identifierade mönster</h3>
          <div className="flex flex-wrap gap-2">
            {stats.patternFlags.map((item, i) => (
              <span
                key={i}
                className="px-3 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full"
              >
                {item.pattern} ({item.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Senaste bedömningar */}
      {stats.recentReviews.length > 0 && (
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-md font-semibold text-gray-900 mb-3">Senaste bedömningar</h3>
          <div className="space-y-3">
            {stats.recentReviews.slice(0, 5).map((review, i) => (
              <div key={i} className="border-l-4 border-gray-200 pl-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    Poäng: {review.score.toFixed(1)}/10
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      review.severity === "pass"
                        ? "bg-emerald-100 text-emerald-800"
                        : review.severity === "warn"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {review.severity}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-1">
                  Användare: "{review.userInput.slice(0, 50)}..."
                </div>
                <div className="text-xs text-gray-500">
                  Coach: "{review.coachReply.slice(0, 50)}..."
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

