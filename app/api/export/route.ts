export const runtime = "nodejs"; // viktigt på Vercel för Puppeteer

import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { pdfPayloadSchema } from "@/lib/schemas/pdfSchema";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = pdfPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;
    const now = new Date(data.createdAt ?? Date.now());
    const dateStr = now.toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });

    const html = makeHTML({ ...data, dateStr });

    // Vercel-kompatibel Chrome setup
    const isLocal = process.env.NODE_ENV !== "production";
    const executablePath = isLocal
      ? process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome" // lokalt/Railway
      : await chromium.executablePath(); // Vercel serverless

    const browser = await puppeteer.launch({
      args: isLocal ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
      headless: true,
      executablePath,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "16mm", bottom: "22mm", left: "16mm" },
    });
    await browser.close();

    const filename = `relationsanalys_${data.person1}_${data.person2}.pdf`.replace(/\s+/g, "_");

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!));
}

function makeHTML(data: {
  person1: string;
  person2: string;
  description: string;
  reflections: string[];
  recommendation: string;
  safetyFlag?: boolean;
  dateStr: string;
}) {
  const { person1, person2, description, reflections, recommendation, safetyFlag, dateStr } = data;
  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Relationsanalys – ${esc(person1)} & ${esc(person2)}</title>
  <style>
    @page { size: A4; margin: 20mm 16mm 22mm 16mm; }
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111827; }
    .title { font-size: 22px; font-weight: 800; letter-spacing: .2px; margin: 0; }
    .subtitle { color:#6B7280; margin: 4px 0 0 0; font-size: 12px; }
    .divider { height: 1px; background: #E5E7EB; margin: 16px 0 12px; }
    .section { margin: 14px 0; }
    .h2 { font-size: 14px; font-weight: 700; color:#111827; margin: 0 0 8px 0; }
    .p  { font-size: 12px; line-height: 1.55; margin: 0; white-space: pre-wrap; }
    .card { border:1px solid #E5E7EB; border-radius: 10px; padding: 12px; background:#F9FAFB; }
    .list { padding-left: 18px; margin: 6px 0 0 0; }
    .list li { margin: 6px 0; font-size: 12px; }
    .badge { display:inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; background:#EEF2FF; color:#3730A3; }
    .footer { position: fixed; bottom: 10mm; left: 16mm; right: 16mm; font-size:10px; color:#6B7280; display:flex; justify-content:space-between; align-items:center; }
    .brand { color:#7C3AED; font-weight:700; }
    .etik { font-style: italic; }
  </style>
</head>
<body>
  <header>
    <h1 class="title">Relationsanalys – ${esc(person1)} & ${esc(person2)}</h1>
    <p class="subtitle">
      ${dateStr} • PDF v1 • <span class="badge">MVP</span>${
        safetyFlag 
          ? ' <span class="badge" style="background:#FEE2E2;color:#991B1B;margin-left:6px;">⚠️ TRYGGHET: FLAGGAD</span>' 
          : ''
      }
    </p>
  </header>

  <div class="divider"></div>

  <section class="section">
    <h2 class="h2">Beskrivning</h2>
    <div class="card"><p class="p">${esc(description)}</p></div>
  </section>

  <section class="section">
    <h2 class="h2">Reflektioner (3)</h2>
    <div class="card">
      <ol class="list">
        <li>${esc(reflections[0])}</li>
        <li>${esc(reflections[1])}</li>
        <li>${esc(reflections[2])}</li>
      </ol>
    </div>
  </section>

  <section class="section">
    <h2 class="h2">Rekommendation</h2>
    <div class="card"><p class="p">${esc(recommendation)}</p></div>
  </section>

  <footer class="footer">
    <span class="etik">Etik: AI-genererad analys. Ej terapi/rådgivning. Använd med samtycke. Vid akuta lägen – sök professionell hjälp.</span>
    <span class="brand">Sintari Relations</span>
  </footer>
</body>
</html>`;
}

