"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import PromptWithFollowCards from "@/components/PromptWithFollowCards";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CouplesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = searchParams.get("context");
  const [hasContext, setHasContext] = useState(false);

  useEffect(() => {
    if (context) {
      setHasContext(true);
      // Här kan vi spara kontexten i localStorage eller state för att använda i chatten
      if (typeof window !== "undefined") {
        sessionStorage.setItem("couples_context", context);
      }
    }
  }, [context]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
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
            <h1 className="text-2xl font-bold text-gray-900">Par-terapi AI</h1>
            <p className="text-sm text-gray-600">Arbeta med er relation tillsammans</p>
          </div>
        </div>

        {/* Context banner */}
        {hasContext && (
          <div className="mb-6 bg-emerald-100 border border-emerald-300 rounded-lg p-4">
            <p className="text-sm text-emerald-900">
              <strong>Kontext från reception:</strong> {decodeURIComponent(context || "")}
            </p>
          </div>
        )}

        {/* Chat */}
        <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-4 sm:p-6">
          <PromptWithFollowCards />
        </div>
      </Container>
    </div>
  );
}

