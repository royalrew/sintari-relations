"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import PromptWithFollowCards from "@/components/PromptWithFollowCards";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Toolbox, type ToolKey } from "@/components/coach/Toolbox";
import { GuideRunner } from "@/components/coach/GuideRunner";
import { TeacherReviewViewer } from "@/components/coach/TeacherReviewViewer";

export default function CoachPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = searchParams.get("context");
  const [hasContext, setHasContext] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [showTeacherReviews, setShowTeacherReviews] = useState(false);

  useEffect(() => {
    if (context) {
      setHasContext(true);
      // Här kan vi spara kontexten i localStorage eller state för att använda i chatten
      if (typeof window !== "undefined") {
        sessionStorage.setItem("coach_context", context);
      }
    }
  }, [context]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <Container className="py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka till reception
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI-coachen</h1>
            <p className="text-sm text-gray-600">Arbeta med dina personliga mål och utveckling</p>
          </div>
        </div>

        {/* Context banner */}
        {hasContext && (
          <div className="mb-6 bg-purple-100 border border-purple-300 rounded-lg p-4">
            <p className="text-sm text-purple-900">
              <strong>Kontext från reception:</strong> {decodeURIComponent(context || "")}
            </p>
          </div>
        )}

        {/* Chat */}
        <div className="bg-white rounded-2xl shadow-lg border border-purple-100 p-4 sm:p-6 mb-6">
          <PromptWithFollowCards 
            activeTool={activeTool} 
            onToolComplete={() => setActiveTool(null)}
            onStartTool={(tool) => setActiveTool(tool)}
          />
        </div>

        {/* Toolbox */}
        <div className="bg-white rounded-2xl shadow-lg border border-purple-100 p-4 sm:p-6 mb-6">
          <Toolbox
            onStart={(tool) => {
              setActiveTool(tool);
            }}
          />
        </div>

        {/* Guide Runner */}
        {activeTool && (
          <div className="bg-white rounded-2xl shadow-lg border border-purple-100 p-4 sm:p-6 mb-6">
            <GuideRunner
              tool={activeTool}
              onDone={() => {
                setActiveTool(null);
              }}
            />
          </div>
        )}

        {/* Teacher Reviews (endast om feature flag är aktiverad) */}
        {process.env.NEXT_PUBLIC_COACH_REVIEW_UI === "on" && (
          <div className="bg-white rounded-2xl shadow-lg border border-purple-100 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">GPT-5 Teacher Reviews</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTeacherReviews(!showTeacherReviews)}
              >
                {showTeacherReviews ? "Dölj" : "Visa"} reviews
              </Button>
            </div>
            {showTeacherReviews && (
              <div className="border-t pt-4">
                <TeacherReviewViewer />
              </div>
            )}
          </div>
        )}
      </Container>
    </div>
  );
}

