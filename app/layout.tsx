import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sintari – Varm reception, noll tvång",
  description: "AI som lyssnar först och lotsar när du vill. 7 dagars prov.",
  openGraph: {
    title: "Sintari",
    description: "Varm reception, noll tvång.",
    type: "website",
    locale: "sv_SE",
    siteName: "Sintari",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sintari",
    description: "Varm reception, noll tvång.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
