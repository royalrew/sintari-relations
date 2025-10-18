import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sintari Relations - AI-driven relationsanalys",
  description: "Analysera och förstå dina relationer med hjälp av AI",
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
