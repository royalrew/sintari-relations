/**
 * Structured Data (JSON-LD) för Pricing-sidan
 * Förbättrar SEO och rich snippets
 */
export function PricingJsonLd() {
  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Sintari",
    description: "AI som lyssnar först och lotsar när du vill. 7 dagars prov.",
    brand: {
      "@type": "Brand",
      name: "Sintari",
    },
    offers: [
      {
        "@type": "Offer",
        name: "Bas",
        price: "149",
        priceCurrency: "SEK",
        availability: "https://schema.org/InStock",
        priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "349",
        priceCurrency: "SEK",
        availability: "https://schema.org/InStock",
        eligibleDuration: "P7D",
        priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
      {
        "@type": "Offer",
        name: "Premium",
        price: "799",
        priceCurrency: "SEK",
        availability: "https://schema.org/InStock",
        priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
    ],
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

