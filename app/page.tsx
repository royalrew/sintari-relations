"use client";

import Link from "next/link";

/** Fallback-ikoner (byt till lucide-react när du vill) */
// import { ShieldCheck, Sparkles, Clock, CheckCircle2, Mail } from "lucide-react";
const ShieldCheck = () => <span aria-hidden className="inline-block">🛡️</span>;
const Sparkles = () => <span aria-hidden className="inline-block">✨</span>;
const Clock = () => <span aria-hidden className="inline-block">⏱️</span>;
const CheckCircle2 = () => <span aria-hidden className="inline-block">✅</span>;
const Mail = () => <span aria-hidden className="inline-block">📧</span>;

function CtaCard() {
  return (
    <section
      aria-label="Huvudbudskap och call-to-action"
      className="relative mb-8 rounded-3xl border border-purple-200/60 bg-gradient-to-r from-purple-50 to-indigo-50 p-6 sm:p-8 shadow-sm"
    >
      <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/40" />
      <div className="flex items-start gap-3">
        <div className="text-purple-600 text-2xl mt-0.5"><Sparkles /></div>
        <div className="flex-1">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-purple-700 bg-purple-100/60 px-2.5 py-1 rounded-full">
            Nytt • PDF ingår
          </p>
          <h2 className="mt-3 text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
            Få en relationsanalys på några minuter
          </h2>
          <p className="mt-2 text-sm sm:text-base text-gray-700">
            Fyll i tre fält, betala tryggt och få en konkret rekommendation direkt på sidan – plus en nedladdningsbar PDF.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <Link
              href="/analyze"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-white font-semibold shadow-lg shadow-purple-300/30 hover:from-purple-700 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 transition-all"
            >
              Starta nu
            </Link>
            <Link
              href="/legal/ethics"
              className="inline-flex items-center justify-center rounded-xl border border-purple-200 bg-white/80 px-5 py-3 text-purple-700 font-semibold hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-400 transition-all"
            >
              Läs om etik & trygghet
            </Link>
          </div>
          <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-700">
            <li className="inline-flex items-center gap-1.5"><ShieldCheck /> Trygg betalning</li>
            <li className="inline-flex items-center gap-1.5"><Clock /> Klar på ~1–2 min</li>
            <li className="inline-flex items-center gap-1.5"><CheckCircle2 /> PDF ingår</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function FeatureCards() {
  const items = [
    { title: "Tydliga råd", desc: "Praktiska steg att testa redan i dag – inga fluffiga texter.", icon: Sparkles },
    { title: "Etik först", desc: "Samtycke, säkerhet och tydliga gränser är inbyggt.", icon: ShieldCheck },
    { title: "Snabbt & smidigt", desc: "Fyll i, betala, få svar och PDF – på några minuter.", icon: Clock },
  ];
  return (
    <section aria-label="Fördelar" className="mt-10">
      <div className="grid sm:grid-cols-3 gap-4">
        {items.map(({ title, desc, icon: Icon }) => (
          <article
            key={title}
            className="group rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm ring-1 ring-black/0 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="text-purple-600 text-xl"><Icon /></div>
              <h3 className="font-semibold text-gray-900">{title}</h3>
            </div>
            <p className="mt-2 text-sm text-gray-700">{desc}</p>
            <div className="mt-3 h-px bg-gradient-to-r from-purple-100 via-gray-100 to-transparent" />
          </article>
        ))}
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section aria-label="Förtroende" className="mt-14">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-gray-600">Byggd med fokus på trygghet och nytta</p>
        <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-gray-700">
          <li className="inline-flex items-center gap-1"><CheckCircle2 /> Ingen data säljs</li>
          <li className="inline-flex items-center gap-1"><CheckCircle2 /> Svenskt språkstöd</li>
          <li className="inline-flex items-center gap-1"><CheckCircle2 /> PDF för utskrift</li>
        </ul>
      </div>
    </section>
  );
}

function FooterCta() {
  return (
    <section aria-label="Avslutande call-to-action" className="mt-16">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Klar att prova Sintari Relations?
        </h2>
        <p className="mt-2 text-gray-600 max-w-2xl mx-auto">
          Svara på tre frågor och få en konkret rekommendation – direkt på sidan. Du kan ladda ner resultatet som PDF.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/analyze"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 text-white font-semibold shadow-lg hover:from-purple-700 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 transition-all"
          >
            Kom igång nu
          </Link>
          <Link
            href="mailto:hej@sintari.se"
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-3 text-gray-800 font-semibold hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 transition"
          >
            <span className="mr-2"><Mail /></span> Frågor? Maila oss
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 selection:bg-purple-200/60 selection:text-purple-900">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 pb-16">
        {/* Header */}
        <header className="pt-10 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/70 px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm">
            Beta • Månad 1
          </p>
          <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent tracking-tight">
            Sintari Relations
          </h1>
          <p className="mt-3 text-gray-700 text-base sm:text-lg max-w-2xl mx-auto">
            Analysera och förstå dina relationer med AI-driven insikt och praktiska rekommendationer.
          </p>
        </header>

        {/* CTA */}
        <CtaCard />

        {/* Features */}
        <FeatureCards />

        {/* Social proof */}
        <SocialProof />

        {/* Footer CTA */}
        <FooterCta />

        {/* Liten fotnot */}
        <p className="mt-10 text-center text-xs text-gray-500">
          Etik: AI-genererad analys. Inte terapi. Använd med samtycke. Vid akuta lägen – kontakta 112.
        </p>
      </div>
    </main>
  );
}