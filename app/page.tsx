"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Reception from "@/components/reception/Reception";
import { PricingJsonLd } from "@/components/marketing/PricingJsonLd";

/** ——— Mini design system (Button, Card, Container, SectionHeading) ——— */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  full?: boolean;
};
function Button({
  asChild,
  href,
  variant = "primary",
  size = "md",
  full,
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "group inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 active:scale-[.98]";
  const sizes = {
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-3 text-base",
  }[size];

  const variants = {
    primary:
      "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-300/30 hover:shadow-purple-400/30 hover:from-purple-700 hover:to-blue-700",
    secondary:
      "border border-purple-200 bg-white/90 text-purple-700 hover:bg-white hover:shadow-md",
    ghost:
      "text-purple-700 hover:bg-purple-50/70",
  }[variant];

  const width = full ? "w-full" : "";

  const cls = [base, sizes, variants, width, className].join(" ");

  if (asChild && href) {
    return (
      <Link href={href} className={cls}>
        <span {...props} />
      </Link>
    );
  }

  if (href) {
    return (
      <Link href={href} className={cls}>
        {props.children}
      </Link>
    );
  }

  return <button className={cls} {...props} />;
}

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  href?: string;
};
function Card({ className = "", href, children, ...rest }: CardProps) {
  const Comp: any = href ? Link : "div";
  return (
    <Comp
      href={href as any}
      className={[
        "group relative rounded-2xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:border-purple-200",
        className,
      ].join(" ")}
      {...rest}
    >
      {/* subtle hover glow */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-gradient-to-tr from-purple-50 to-blue-50" />
      <div className="relative">{children}</div>
    </Comp>
  );
}

function Container(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={["mx-auto max-w-6xl px-6 sm:px-8", props.className].join(" ")} />;
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="text-center">
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{title}</h2>
      {sub && <p className="mt-2 text-gray-600 max-w-3xl mx-auto">{sub}</p>}
    </div>
  );
}

/** ——— Ikoner (enkla placeholders – byt till lucide/shadcn om du vill) ——— */
const Icon = {
  shield: () => <span aria-hidden>🛡️</span>,
  sparkles: () => <span aria-hidden>✨</span>,
  heart: () => <span aria-hidden>💜</span>,
  people: () => <span aria-hidden>👥</span>,
  mail: () => <span aria-hidden>📧</span>,
  check: () => <span aria-hidden>✅</span>,
  star: () => <span aria-hidden>★</span>,
};

/** ——— Header ——— */
function Header() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Kolla om användaren är inloggad
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/user");
        if (response.ok) {
          const user = await response.json();
          setIsLoggedIn(true);
          setUserName(user.name || user.email);
        } else {
          setIsLoggedIn(false);
          setUserName(null);
        }
      } catch {
        setIsLoggedIn(false);
        setUserName(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Uppdatera när sidan får fokus (t.ex. efter inloggning i annat fönster)
    const handleFocus = () => {
      checkAuth();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setIsLoggedIn(false);
      setUserName(null);
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-purple-100/70 bg-white/70 backdrop-blur">
      <Container className="flex items-center justify-between py-3">
        <Link
          href="/"
          className="font-extrabold text-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent"
        >
          Sintari Relations
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          <Link
            href="#pricing"
            className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:text-purple-700 hover:bg-purple-50 transition-colors"
          >
            Priser
          </Link>
          <Link
            href="#testimonials"
            className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:text-purple-700 hover:bg-purple-50 transition-colors"
          >
            Röster
          </Link>
          <Link
            href="/legal/ethics"
            className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:text-purple-700 hover:bg-purple-50 transition-colors"
          >
            Etik
          </Link>
        </nav>

        <div className="hidden sm:flex items-center gap-2">
          <Button href="/demo" variant="ghost" size="md">
            Testa demo
          </Button>
          {loading ? (
            <div className="w-20 h-8"></div>
          ) : isLoggedIn ? (
            <>
              <Button href="/account" variant="ghost" size="md">
                Mitt konto
              </Button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50/70 rounded-xl transition-all"
              >
                Logga ut
              </button>
            </>
          ) : (
            <Button href="/login" variant="ghost" size="md">
              Logga in
            </Button>
          )}
          <Button href="#pricing" variant="primary" size="md">
            Kom igång
          </Button>
        </div>

        {/* Mobile */}
        <button
          onClick={() => setOpen((v) => !v)}
            aria-label="Meny"
          className="sm:hidden rounded-lg p-2 text-gray-700 hover:bg-purple-50 transition-colors"
        >
          ☰
        </button>
      </Container>

      {open && (
        <div className="sm:hidden border-t border-purple-100/70 bg-white/90 backdrop-blur">
          <Container className="flex flex-col py-2">
            <Link href="#pricing" className="rounded-lg px-3 py-2 text-sm hover:bg-purple-50">
              Priser
            </Link>
            <Link href="#testimonials" className="rounded-lg px-3 py-2 text-sm hover:bg-purple-50">
              Röster
            </Link>
            <Link href="/legal/ethics" className="rounded-lg px-3 py-2 text-sm hover:bg-purple-50">
              Etik
            </Link>
            <div className="mt-2 flex gap-2">
              <Button href="/demo" variant="secondary" full>
                Testa demo
              </Button>
              {loading ? (
                <div className="w-full h-10"></div>
              ) : isLoggedIn ? (
                <>
                  <Button href="/account" variant="secondary" full>
                    Mitt konto
                  </Button>
                  <button
                    onClick={handleLogout}
                    className="w-full py-2 px-4 rounded-lg font-semibold text-purple-700 bg-white border-2 border-purple-200 hover:bg-purple-50 transition-all"
                  >
                    Logga ut
                  </button>
                </>
              ) : (
                <Button href="/login" variant="secondary" full>
                  Logga in
                </Button>
              )}
              <Button href="#pricing" variant="primary" full>
                Kom igång
              </Button>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}

/** ——— Hero ——— */
function Hero() {
  const [variant, setVariant] = useState<"A" | "B" | "C">("A");
  
  useEffect(() => {
    // Hero-copy A/B variant baserat på sessionStorage
    try {
      const stored = sessionStorage.getItem("hero_variant");
      if (stored && ["A", "B", "C"].includes(stored)) {
        setVariant(stored as "A" | "B" | "C");
      } else {
        // Randomisera första gången
        const random = ["A", "B", "C"][Math.floor(Math.random() * 3)] as "A" | "B" | "C";
        sessionStorage.setItem("hero_variant", random);
        setVariant(random);
      }
    } catch {
      // Graceful degradation
    }
  }, []);
  
  const variants = {
    A: {
      title: "Trygg AI som lyssnar – och hjälper dig vidare",
      subtitle: "Mjuk reception → konkret coaching → par-läge. Du styr tempot.",
    },
    B: {
      title: "Välkommen in i värmen",
      subtitle: "En lugn reception som lyssnar först – och lotsar när du vill. Inget tvång.",
    },
    C: {
      title: "AI som faktiskt lyssnar",
      subtitle: "Börja där du är. Vi tar det i din takt – inga krav, bara stöd.",
    },
  };
  
  const currentVariant = variants[variant];
  
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <Container className="pt-16 pb-14">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/70 px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm">
            <Icon.sparkles /> Beta · Välkommen in
          </span>
          <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
            {currentVariant.title}
          </h1>
          <p className="mt-4 text-gray-700 text-base sm:text-lg">
            {currentVariant.subtitle}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button href="/analyze" size="lg">
              Starta ett samtal
            </Button>
            <Button href="/legal/ethics" variant="secondary" size="lg">
              Läs etik & trygghet
            </Button>
          </div>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gray-700">
            <li className="inline-flex items-center gap-1.5"><Icon.shield /> Icke-dömande</li>
            <li className="inline-flex items-center gap-1.5"><Icon.check /> Tydliga sammanfattningar</li>
            <li className="inline-flex items-center gap-1.5"><span>⏱️</span> Snabba svar</li>
          </ul>
        </div>
      </Container>
    </section>
  );
}

/** ——— Reception ——— */
function ChatSection() {
  return (
    <section className="py-14 bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <Container>
        <SectionHeading
          title="Reception"
          sub="Välkommen in i värmen. Skriv fritt – jag lyssnar och lotsar när du vill."
        />
        <div className="mt-8 max-w-4xl mx-auto">
          <Reception />
        </div>
      </Container>
    </section>
  );
}

/** ——— Use cases ——— */
function UseCases() {
  const items = [
    {
      title: "När allt känns för mycket",
      desc: "Lätta på trycket, sortera känslor och hitta vad du behöver nu.",
      icon: <Icon.heart />,
      accent: "from-pink-100 to-purple-100",
    },
    {
      title: "När du vill förändra",
      desc: "Små, konkreta steg. Vi hjälper dig att komma igång – och hålla i.",
      icon: <Icon.sparkles />,
      accent: "from-blue-100 to-sky-100",
    },
    {
      title: "När ni är två",
      desc: "Par-läge som guidar till lyssnande, spegling och nästa steg.",
      icon: <Icon.people />,
      accent: "from-emerald-100 to-teal-100",
    },
  ];
  return (
    <section className="py-14">
      <Container>
        <SectionHeading
          title="Ett digitalt rum för det som är viktigt"
          sub="Ventilera, komma vidare eller reparera – vi anpassar oss efter dina ord."
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {items.map((it) => (
            <Card key={it.title} className={`bg-gradient-to-br ${it.accent}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl text-purple-600">{it.icon}</span>
                <h3 className="text-lg font-semibold text-gray-900">{it.title}</h3>
              </div>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">{it.desc}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** ——— Pricing (7 dagars prov, Bas, Pro, Premium) ——— */
function Pricing() {
  const plans = [
    {
      name: "Bas",
      price: "149 kr/mån",
      tagline: "För dig som vill börja lugnt",
      features: ["Mjuk reception", "Grundläggande coaching", "Sparade sammanfattningar"],
      notIncluded: ["Fördjupad coaching", "Par-läge"],
      cta: "Starta Bas",
      popular: false,
    },
    {
      name: "Pro",
      price: "349 kr/mån",
      tagline: "Mer stöd, fler verktyg",
      features: ["Allt i Bas", "Fördjupad coaching", "Par-läge (light)", "Prioriterad support"],
      notIncluded: [],
      cta: "Starta Pro",
      popular: true,
    },
    {
      name: "Premium",
      price: "799 kr/mån",
      tagline: "Maxat för par och team",
      features: ["Allt i Pro", "Fullt par-läge", "Teamfunktioner / HR", "Export & rapporter"],
      notIncluded: [],
      cta: "Starta Premium",
      popular: false,
    },
  ];

  return (
    <>
      <PricingJsonLd />
      <section id="pricing" className="py-14 bg-gradient-to-br from-white to-purple-50/60">
        <Container>
        <SectionHeading
          title="Prispaket"
          sub="Börja med 7 dagars provperiod – avsluta när som helst."
        />
        <p className="mt-3 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/80 px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm">
            7 dagars prov ingår i alla paket
          </span>
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {plans.map((p) => (
            <Card
              key={p.name}
              className={`relative ${p.popular ? "ring-2 ring-purple-300" : ""}`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-purple-600 px-3 py-1 text-xs font-bold text-white shadow">
                  Mest vald
                </span>
              )}
              <div className={`flex items-baseline justify-between ${p.popular ? "pt-4" : ""}`}>
                <h3 className="text-lg font-semibold text-gray-900">{p.name}</h3>
                <div className="text-2xl font-extrabold text-gray-900">{p.price}</div>
              </div>
              <p className="mt-1 text-sm text-gray-600">{p.tagline}</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Icon.check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {p.notIncluded && p.notIncluded.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm text-gray-400">
                  {p.notIncluded.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-gray-300">✗</span>
                      <span className="line-through">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 flex flex-col gap-2">
                <Button href="/checkout" variant={p.popular ? "primary" : "secondary"} full>
                  {p.cta}
                </Button>
                <Button href="/analyze" variant="ghost" full>
                  Prova gratis i 7 dagar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Container>
    </section>
    </>
  );
}

/** ——— Testimonials ——— */
function Testimonials() {
  const items = [
    {
      quote:
        "Jag kunde ventilera utan att känna mig dömd. Efter tre minuter fick jag konkreta förslag som faktiskt kändes möjliga.",
      name: "Emma, 32",
      role: "Använde Sintari efter ett bråk",
    },
    {
      quote:
        "Vi satt bredvid varandra och läste svaren tillsammans. Det hjälpte oss att pausa och faktiskt lyssna – inte bara vinna bråket.",
      name: "Amina & Felix",
      role: "Par som testade beta-läget",
    },
    {
      quote:
        "Som HR-ansvarig behövde jag ett tryggt sätt att ge stöd mellan samtal med psykolog. Sintari blev en bro.",
      name: "Sara",
      role: "People Lead, techbolag",
    },
  ];
  return (
    <section id="testimonials" className="py-14">
      <Container>
        <SectionHeading
          title="När människor känner sig hörda händer något"
          sub="Ett urval av röster från våra användare."
        />
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {items.map((t) => (
            <Card key={t.name} className="hover:-translate-y-1">
              <div className="flex items-center gap-2 text-yellow-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i}>★</span>
                ))}
              </div>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
              <p className="mt-4 text-sm font-semibold text-gray-900">{t.name}</p>
              <p className="text-xs text-gray-500">{t.role}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** ——— CTA ——— */
function FinalCta() {
  return (
    <section className="py-14">
      <Container>
        <Card className="text-center">
          <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Välkommen in – vi börjar där du är
          </h3>
          <p className="mt-2 text-gray-600 max-w-2xl mx-auto">
            Prova ett samtal eller hör av dig om du vill veta mer för team/HR.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button href="/analyze" size="lg">
              Starta ett samtal
            </Button>
            <Button href="mailto:jimmy@sintari.se" variant="secondary" size="lg">
              <span className="mr-2">
                <Icon.mail />
              </span>
              Hör av dig
            </Button>
          </div>
          <p className="mt-6 text-xs text-gray-500">
            Etik: AI-genererad analys. Inte terapi. Vid akuta lägen – ring 112.
          </p>
        </Card>
      </Container>
    </section>
  );
}

/** ——— Footer ——— */
function Footer() {
  return (
    <footer className="border-t border-purple-100/70 bg-white/80">
      <Container className="py-10 grid gap-8 sm:grid-cols-4 text-sm">
        <div>
          <div className="font-extrabold bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
            Sintari
          </div>
          <p className="mt-2 text-gray-600">Trygg AI för samtal, coaching och par.</p>
        </div>
        <div>
          <div className="font-semibold text-gray-900">Produkt</div>
          <ul className="mt-2 space-y-2">
            <li><Link className="hover:text-purple-700" href="/analyze">Demo</Link></li>
            <li><a className="hover:text-purple-700" href="#pricing">Priser</a></li>
            <li><a className="hover:text-purple-700" href="#testimonials">Röster</a></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-gray-900">Juridik</div>
          <ul className="mt-2 space-y-2">
            <li><Link className="hover:text-purple-700" href="/legal/ethics">Etik</Link></li>
            <li><Link className="hover:text-purple-700" href="/legal/privacy">Integritet</Link></li>
            <li><Link className="hover:text-purple-700" href="/legal/terms">Villkor</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-gray-900">Kontakt</div>
          <ul className="mt-2 space-y-2">
            <li><a className="hover:text-purple-700" href="mailto:jimmy@sintari.se">jimmy@sintari.se</a></li>
            <li><Link className="hover:text-purple-700" href="/about">Om oss</Link></li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-purple-100/70">
        <Container className="py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Sintari. Alla rättigheter förbehållna.</p>
          <p>Klarna/Stripe stöds. 7 dagars prov ingår.</p>
        </Container>
      </div>
    </footer>
  );
}

/** ——— Page ——— */
export default function Page() {
  return (
    <main className="min-h-screen bg-white selection:bg-purple-200/60 selection:text-purple-900">
      <Header />
      <Hero />
      <ChatSection />
      <UseCases />
      <Pricing />
      <Testimonials />
      <FinalCta />
      <Footer />
    </main>
  );
}
