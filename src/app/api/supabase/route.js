// src/app/api/supabase/route.js
// Accesso ai dati personali. Ogni richiesta passa il token dell'utente, quindi le
// policy RLS di Supabase (auth.uid(), ruoli) valgono anche qui.
//  - solo le tabelle personali elencate sotto
//  - la lettura filtra per user_id dell'utente loggato (non per nome)
//  - user_id lo imposta il database (trigger), il client non può falsificarlo

import { createClient } from "@supabase/supabase-js";

const PERSONAL_TABLES = new Set([
  "saved_items",
  "brainstorm_sessions",
  "briefs",
  "analytics_posts",
  "calendar_events",
]);

async function getUserClient(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "missing_token" };

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { error: "invalid_token" };
  return { client, user: data.user };
}

const badTable = (table) =>
  !PERSONAL_TABLES.has(table) ? Response.json({ error: "Tabella non consentita" }, { status: 400 }) : null;

export async function GET(req) {
  const { client, user, error } = await getUserClient(req);
  if (error) return Response.json({ error: "Non autenticato" }, { status: 401 });

  const table = new URL(req.url).searchParams.get("table");
  const denied = badTable(table);
  if (denied) return denied;

  const timestampCol = table === "saved_items" ? "saved_at" : "created_at";

  const { data, error: qErr } = await client
    .from(table)
    .select("*")
    .eq("user_id", user.id)
    .order(timestampCol, { ascending: false });

  if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req) {
  try {
    const { client, error } = await getUserClient(req);
    if (error) return Response.json({ error: "Non autenticato" }, { status: 401 });
    const { table, record } = await req.json();
    const denied = badTable(table);
    if (denied) return denied;
    const { user_id, ...clean } = record || {}; // user_id lo mette il database
    const { data, error: qErr } = await client.from(table).insert(clean).select().single();
    if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const { client, error } = await getUserClient(req);
    if (error) return Response.json({ error: "Non autenticato" }, { status: 401 });
    const { table, id, record } = await req.json();
    const denied = badTable(table);
    if (denied) return denied;
    const { user_id, ...clean } = record || {};
    const { data, error: qErr } = await client.from(table).update(clean).eq("id", id).select().single();
    if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { client, error } = await getUserClient(req);
    if (error) return Response.json({ error: "Non autenticato" }, { status: 401 });
    const { table, id } = await req.json();
    const denied = badTable(table);
    if (denied) return denied;
    const { error: qErr } = await client.from(table).delete().eq("id", id);
    if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
