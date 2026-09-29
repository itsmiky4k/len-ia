import { createClient } from "@supabase/supabase-js";
 
// Client "autenticato come il chiamante": ogni richiesta passa il token
// dell'utente loggato, così le policy RLS di Supabase (auth.uid(), ruoli)
// vengono applicate correttamente anche quando la query parte da questa route.
async function getUserClient(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return { error: "missing_token" };
 
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { error: "invalid_token" };
  return { client, user: data.user };
}
 
export async function GET(req) {
  const { client, error } = await getUserClient(req);
  if (error) return Response.json({ error: "Non autenticato" }, { status: 401 });
 
  const { searchParams } = new URL(req.url);
  const table    = searchParams.get("table");
  const userName = searchParams.get("user");
  if (!table || !userName) return Response.json({ error: "Missing params" }, { status: 400 });
 
  const timestampCol = table === "saved_items" ? "saved_at" : "created_at";
 
  const { data, error: qErr } = await client
    .from(table)
    .select("*")
    .eq("user_name", userName)
    .order(timestampCol, { ascending: false });
 
  if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
  return Response.json(data);
}
 
export async function POST(req) {
  try {
    const { client, error } = await getUserClient(req);
    if (error) return Response.json({ error: "Non autenticato" }, { status: 401 });
    const { table, record } = await req.json();
    const { data, error: qErr } = await client.from(table).insert(record).select().single();
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
    const { data, error: qErr } = await client.from(table).update(record).eq("id", id).select().single();
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
    const { error: qErr } = await client.from(table).delete().eq("id", id);
    if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
 
