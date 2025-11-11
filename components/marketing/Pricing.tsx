"use client";

function Tier({
  name,
  price,
  period,
  features,
  highlight,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        highlight ? "border-purple-300 bg-white" : "border-gray-200 bg-white/80"
      }`}
    >
      <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <div className="text-3xl font-extrabold text-gray-900">{price}</div>
        <div className="text-sm text-gray-500">/{period}</div>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-gray-700">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span>✅</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button className="mt-5 w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-purple-700 hover:to-blue-700">
        Välj {name}
      </button>
    </div>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 sm:px-8 py-14">
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Prispaket</h2>
        <p className="mt-2 text-gray-600">
          Börja med <span className="font-semibold">7 dagars prov</span>. Uppgradera när du vill.
        </p>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <Tier name="Bas" price="149 kr" period="månad" features={["Reception + Coach-chatt", "Lätt analys", "E-postsupport"]} />
        <Tier name="Pro" price="349 kr" period="månad" features={["Full analys", "Par-läge", "Export / PDF"]} highlight />
        <Tier name="Premium" price="799 kr" period="månad" features={["Prioriterad kö", "HR/Team-panel", "Månatlig genomgång"]} />
      </div>
    </section>
  );
}

