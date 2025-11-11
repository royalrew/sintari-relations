"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name?: string;
  subscription?: {
    plan: 'bas' | 'pro' | 'premium';
    status: 'active' | 'cancelled' | 'trial';
    startDate: string;
    endDate?: string;
  };
  consent?: {
    termsAccepted: boolean;
    termsAcceptedAt: string;
    privacyAccepted: boolean;
    privacyAcceptedAt: string;
    marketingConsent: boolean;
  };
  createdAt: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch("/api/user");
      
      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        setError("Kunde inte ladda användardata");
        setLoading(false);
        return;
      }

      const data = await response.json();
      setUser(data);
    } catch (err) {
      setError("Ett fel uppstod");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const getPlanName = (plan?: string) => {
    switch (plan) {
      case 'bas': return 'Bas';
      case 'pro': return 'Pro';
      case 'premium': return 'Premium';
      default: return 'Ingen plan';
    }
  };

  const getPlanPrice = (plan?: string) => {
    switch (plan) {
      case 'bas': return '149 kr/mån';
      case 'pro': return '349 kr/mån';
      case 'premium': return '799 kr/mån';
      default: return '';
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Laddar...</p>
        </div>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <p className="text-red-600 text-center">{error || "Kunde inte ladda användardata"}</p>
          <Link href="/login" className="block mt-4 text-center text-purple-600 hover:text-purple-800">
            Logga in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="inline-block mb-4 text-purple-600 hover:text-purple-800 text-sm">
            ← Tillbaka till startsidan
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
                Mitt konto
              </h1>
              <p className="text-gray-600">Välkommen, {user.name || user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Logga ut
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Betalplan */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Betalplan</h2>
            
            {user.subscription ? (
              <div className="space-y-4">
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-semibold text-gray-900">
                      {getPlanName(user.subscription.plan)}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      user.subscription.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : user.subscription.status === 'trial'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.subscription.status === 'active' ? 'Aktiv' : 
                       user.subscription.status === 'trial' ? 'Provperiod' : 'Avslutad'}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-2">
                    {getPlanPrice(user.subscription.plan)}
                  </p>
                  {user.subscription.startDate && (
                    <p className="text-sm text-gray-600">
                      Startade: {new Date(user.subscription.startDate).toLocaleDateString('sv-SE')}
                    </p>
                  )}
                  {user.subscription.endDate && (
                    <p className="text-sm text-gray-600">
                      Förnyas: {new Date(user.subscription.endDate).toLocaleDateString('sv-SE')}
                    </p>
                  )}
                </div>
                
                <Link
                  href="/#pricing"
                  className="block w-full py-2 px-4 text-center rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors"
                >
                  Ändra plan
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600">Du har ingen aktiv prenumeration.</p>
                <Link
                  href="/#pricing"
                  className="block w-full py-3 px-4 text-center rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:from-purple-700 hover:to-blue-700 transition-all"
                >
                  Välj en plan
                </Link>
              </div>
            )}
          </div>

          {/* Kontoinformation */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Kontoinformation</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">E-post</label>
                <p className="text-gray-900">{user.email}</p>
              </div>
              
              {user.name && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Namn</label>
                  <p className="text-gray-900">{user.name}</p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Medlem sedan</label>
                <p className="text-gray-900">
                  {new Date(user.createdAt).toLocaleDateString('sv-SE', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Samtycke */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 md:col-span-2">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Samtycke</h2>
            
            {user.consent ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={user.consent.termsAccepted ? "text-green-600" : "text-gray-400"}>
                    {user.consent.termsAccepted ? "✓" : "✗"}
                  </span>
                  <span className="text-gray-700">
                    Användarvillkor accepterade{" "}
                    {user.consent.termsAcceptedAt && (
                      <span className="text-sm text-gray-500">
                        ({new Date(user.consent.termsAcceptedAt).toLocaleDateString('sv-SE')})
                      </span>
                    )}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={user.consent.privacyAccepted ? "text-green-600" : "text-gray-400"}>
                    {user.consent.privacyAccepted ? "✓" : "✗"}
                  </span>
                  <span className="text-gray-700">
                    Integritetspolicy accepterad{" "}
                    {user.consent.privacyAcceptedAt && (
                      <span className="text-sm text-gray-500">
                        ({new Date(user.consent.privacyAcceptedAt).toLocaleDateString('sv-SE')})
                      </span>
                    )}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={user.consent.marketingConsent ? "text-green-600" : "text-gray-400"}>
                    {user.consent.marketingConsent ? "✓" : "✗"}
                  </span>
                  <span className="text-gray-700">Marknadsföringssamtycke</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-600">Ingen samtyckesinformation tillgänglig.</p>
            )}
          </div>

          {/* Snabbåtgärder */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 md:col-span-2">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Snabbåtgärder</h2>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                href="/analyze"
                className="p-4 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors text-center"
              >
                <div className="text-2xl mb-2">📊</div>
                <div className="font-semibold text-gray-900">Ny analys</div>
              </Link>
              
              <Link
                href="/#pricing"
                className="p-4 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors text-center"
              >
                <div className="text-2xl mb-2">💳</div>
                <div className="font-semibold text-gray-900">Ändra plan</div>
              </Link>
              
              <Link
                href="/legal/privacy"
                className="p-4 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors text-center"
              >
                <div className="text-2xl mb-2">🔒</div>
                <div className="font-semibold text-gray-900">Integritet</div>
              </Link>
              
              <Link
                href="/legal/terms"
                className="p-4 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors text-center"
              >
                <div className="text-2xl mb-2">📄</div>
                <div className="font-semibold text-gray-900">Villkor</div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

