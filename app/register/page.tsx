"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Lösenorden matchar inte");
      return;
    }

    if (password.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken");
      return;
    }

    if (!termsAccepted || !privacyAccepted) {
      setError("Du måste acceptera villkor och integritetspolicy");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          email,
          password,
          name: name || undefined,
          consent: {
            termsAccepted: true,
            privacyAccepted: true,
            marketingConsent: marketingConsent,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Registrering misslyckades");
        setLoading(false);
        return;
      }

      // Redirect till dashboard (samtycke sparas redan i API:et)
      setLoading(false);
      window.location.href = "/account";
    } catch (err) {
      console.error("Registreringsfel:", err);
      setError("Ett fel uppstod. Försök igen.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <div className="text-center mb-8">
            <Link href="/" className="inline-block mb-4 text-purple-600 hover:text-purple-800 text-sm">
              ← Tillbaka till startsidan
            </Link>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
              Skapa konto
            </h1>
            <p className="text-gray-600">Börja din resa med Sintari</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                Namn (valfritt)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="Ditt namn"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                E-post *
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="din@epost.se"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                Lösenord *
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="Minst 8 tecken"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                Bekräfta lösenord *
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <input
                  id="terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  required
                  className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="terms" className="text-sm text-gray-700">
                  Jag accepterar{" "}
                  <Link href="/legal/terms" target="_blank" className="text-purple-600 hover:text-purple-800 underline">
                    användarvillkoren
                  </Link>
                  {" "}*
                </label>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="privacy"
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(e) => setPrivacyAccepted(e.target.checked)}
                  required
                  className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="privacy" className="text-sm text-gray-700">
                  Jag accepterar{" "}
                  <Link href="/legal/privacy" target="_blank" className="text-purple-600 hover:text-purple-800 underline">
                    integritetspolicyn
                  </Link>
                  {" "}*
                </label>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="marketing"
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="marketing" className="text-sm text-gray-700">
                  Jag vill få nyheter och erbjudanden via e-post (valfritt)
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg font-semibold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
                loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl"
              }`}
            >
              {loading ? "Skapar konto..." : "Skapa konto"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Har du redan ett konto?{" "}
              <Link href="/login" className="text-purple-600 hover:text-purple-800 font-semibold">
                Logga in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

