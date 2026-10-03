// src/app/api/calendar/[token]/route.js
// Feed .ics personale: il calendario del telefono lo scarica con il link
// https://<sito>/api/calendar/<codice>. Non c'è login: il codice lungo e segreto
// (generato dal database, rigenerabile) fa da chiave. Il database controlla il codice.
 
import { createClient } from "@supabase/supabase-js";
import { buildIcs } from "../../../../lib/ics";
 
export const dynamic = "force-dynamic";
 
const text = (body, status) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
 
export async function GET(_req, { params }) {
  const { token: raw } = await params;
  const token = String(raw || "").replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{64}$/.test(token)) return text("Link non valido", 404);
 
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
 
  const { data: valid, error: vErr } = await db.rpc("feed_token_valid", { p_token: token });
  if (vErr) return text("Servizio non disponibile", 502);
  if (!valid) return text("Link non valido o rigenerato", 404);
 
  const { data, error } = await db.rpc("feed_appointments", { p_token: token });
  if (error) return text("Servizio non disponibile", 502);
 
  return new Response(buildIcs(data || []), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="len-appuntamenti.ics"',
      "Cache-Control": "no-store",
    },
  });
}
 
