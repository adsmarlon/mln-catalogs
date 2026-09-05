import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = (searchParams.get("from") || "EUR").toUpperCase();
  const to = (searchParams.get("to") || "JPY").toUpperCase();
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${from}`, { next: { revalidate: 3600 } });
    const j = await r.json();
    const rate = j?.rates?.[to];
    if (!rate) throw new Error("Taxa não encontrada para " + to);
    return NextResponse.json({ from, to, rate, updated: j.time_last_update_utc });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
