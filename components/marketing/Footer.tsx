"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-gray-200/70 bg-white/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-10 grid gap-8 sm:grid-cols-4">
        <div>
          <div className="text-lg font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Sintari
          </div>
          <p className="mt-2 text-sm text-gray-600">Varm, snäll AI som lyssnar först.</p>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">Produkt</div>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            <li>
              <Link href="/coach" className="hover:text-purple-700">
                Coach
              </Link>
            </li>
            <li>
              <Link href="/couples" className="hover:text-purple-700">
                Par-läge
              </Link>
            </li>
            <li>
              <Link href="/hr" className="hover:text-purple-700">
                HR/Team
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">Bolag</div>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            <li>
              <Link href="/about" className="hover:text-purple-700">
                Om oss
              </Link>
            </li>
            <li>
              <Link href="/legal/ethics" className="hover:text-purple-700">
                Etik
              </Link>
            </li>
            <li>
              <Link href="/legal/privacy" className="hover:text-purple-700">
                Integritet
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">Kontakt</div>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            <li>
              <a href="mailto:jimmy@sintari.se" className="hover:text-purple-700">
                jimmy@sintari.se
              </a>
            </li>
            <li className="text-xs text-gray-500">Vid akuta lägen – ring 112.</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-200 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Sintari. Alla rättigheter förbehållna.
      </div>
    </footer>
  );
}

