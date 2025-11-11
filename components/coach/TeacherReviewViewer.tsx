"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Enkel sida för att se GPT-5 Teacher feedback
 * Visar alla reviews från data/teacher-reviews/
 * 
 * Feature flag: NEXT_PUBLIC_COACH_REVIEW_UI måste vara "on" för att visa panelen
 */
export function TeacherReviewViewer() {
  // Feature flag check - dölj panelen om inte aktiverad
  if (process.env.NEXT_PUBLIC_COACH_REVIEW_UI !== "on") {
    return null;
  }
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "fail" | "warn" | "pass">("all");
  const [deleting, setDeleting] = useState(false);

  const loadReviews = () => {
    setLoading(true);
    fetch("/api/teacher-reviews")
      .then((res) => res.json())
      .then((data) => {
        setReviews(data.reviews || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load reviews:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    // Feature flag check - dölj panelen om inte aktiverad
    if (process.env.NEXT_PUBLIC_COACH_REVIEW_UI !== "on") {
      return;
    }
    loadReviews();
  }, []);

  // Feature flag check - dölj panelen om inte aktiverad
  if (process.env.NEXT_PUBLIC_COACH_REVIEW_UI !== "on") {
    return null;
  }

  const handleDeleteAll = async () => {
    if (!confirm("Är du säker på att du vill radera alla reviews? Detta går inte att ångra.")) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/teacher-reviews", {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        alert(`Raderade ${data.deleted} reviews`);
        loadReviews(); // Ladda om listan
      } else {
        alert("Fel vid radering: " + (data.error || "Okänt fel"));
      }
    } catch (error) {
      console.error("Failed to delete reviews:", error);
      alert("Fel vid radering av reviews");
    } finally {
      setDeleting(false);
    }
  };

  const filteredReviews = reviews.filter((r) => {
    if (filter === "all") return true;
    return r.feedback?.severity === filter;
  });

  const avgScore =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.feedback?.overallScore || 0), 0) / reviews.length
      : 0;

  if (loading) {
    return <div className="p-6">Laddar reviews...</div>;
  }

  return (
    <div className="p-0 max-w-full">
      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <div className="text-lg">
          Genomsnittlig poäng: <strong>{avgScore.toFixed(1)}/10</strong>
        </div>
        <div className="text-sm text-gray-600">
          Totalt: {reviews.length} reviews
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="border rounded px-3 py-1 text-sm"
        >
          <option value="all">Alla</option>
          <option value="pass">Pass</option>
          <option value="warn">Warn</option>
          <option value="fail">Fail</option>
        </select>
        {reviews.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteAll}
            disabled={deleting}
          >
            {deleting ? "Raderar..." : "Rensa alla reviews"}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="text-gray-500 p-4 border rounded">
            Inga reviews hittades. Kontrollera att GPT-5 Teacher är aktiverad i .env:
            <code className="block mt-2 bg-gray-100 p-2 rounded">
              ENABLE_QUALITY_TEACHER=true
            </code>
          </div>
        ) : (
          filteredReviews.map((review, i) => (
            <div
              key={i}
              className={`border rounded-lg p-4 ${
                review.feedback?.severity === "fail"
                  ? "bg-red-50 border-red-200"
                  : review.feedback?.severity === "warn"
                  ? "bg-amber-50 border-amber-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold">
                    Poäng: {review.feedback?.overallScore?.toFixed(1)}/10
                  </div>
                  <div className="text-sm text-gray-600">
                    {new Date(review.timestamp).toLocaleString("sv-SE")}
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    review.feedback?.severity === "fail"
                      ? "bg-red-200 text-red-800"
                      : review.feedback?.severity === "warn"
                      ? "bg-amber-200 text-amber-800"
                      : "bg-green-200 text-green-800"
                  }`}
                >
                  {review.feedback?.severity || "unknown"}
                </span>
              </div>

              <div className="mb-2">
                <div className="text-sm font-medium mb-1">Användare:</div>
                <div className="text-sm bg-white p-2 rounded border">
                  "{review.userInput}"
                </div>
              </div>

              <div className="mb-2">
                <div className="text-sm font-medium mb-1">Coach:</div>
                <div className="text-sm bg-white p-2 rounded border">
                  "{review.coachReply}"
                </div>
              </div>

              {review.feedback?.weaknesses?.length > 0 && (
                <div className="mb-2">
                  <div className="text-sm font-medium text-red-700 mb-1">
                    Svagheter:
                  </div>
                  <ul className="text-sm list-disc list-inside">
                    {review.feedback.weaknesses.map((w: string, j: number) => (
                      <li key={j}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {review.feedback?.suggestions?.length > 0 && (
                <div className="mb-2">
                  <div className="text-sm font-medium text-blue-700 mb-1">
                    Förslag:
                  </div>
                  <ul className="text-sm list-disc list-inside">
                    {review.feedback.suggestions.map((s: string, j: number) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {review.feedback?.strengths?.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-green-700 mb-1">
                    Styrkor:
                  </div>
                  <ul className="text-sm list-disc list-inside">
                    {review.feedback.strengths.map((s: string, j: number) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

