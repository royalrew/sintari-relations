"use client";

import Link from "next/link";

export function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 sm:px-8 pt-16 pb-14">
      <div className="mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/70 px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm">
          Förhandsvisning · Beta
        </div>
        <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
          Välkommen in i värmen
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-700 leading-relaxed">
          En lugn reception som lyssnar först – och lotsar när du vill. Inget tvång. Bara stöd.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="#reception-demo"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 text-white font-semibold shadow-lg transition-all hover:from-purple-700 hover:to-blue-700"
          >
            Prova direkt
          </Link>
          <Link
            href="#pricing"
            className="inline-flex items-center justify-center rounded-xl border border-purple-200 bg-white px-6 py-3 text-purple-700 font-semibold transition hover:bg-white hover:shadow-md"
          >
            Se paket & 7 dagars prov
          </Link>
        </div>
      </div>
    </section>
  );
}

