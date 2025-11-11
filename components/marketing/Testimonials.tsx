"use client";

export function Testimonials() {
  const items = [
    { quote: "Kändes som att någon faktiskt lyssnade. Inga måsten.", name: "Emma, 32" },
    { quote: "Vi pausade bråket och hittade tillbaka.", name: "Amina & Felix" },
    { quote: "Perfekt som stöd mellan HR-samtal.", name: "Sara, People Lead" },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 sm:px-8 py-14">
      <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-gray-900">Röster från användare</h2>
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {items.map((t) => (
          <div key={t.name} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-lg">
            <div className="text-yellow-500">★★★★★</div>
            <p className="mt-3 text-sm text-gray-700">&ldquo;{t.quote}&rdquo;</p>
            <p className="mt-4 text-sm font-semibold text-gray-900">{t.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

