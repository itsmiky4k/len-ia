import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const table    = searchParams.get("table");
  const userName = searchParams.get("user");
  if (!table || !userName) return Response.json({ error: "Missing params" }, { status: 400 });

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("user_name", userName)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req) {
  try {
    const { table, record } = await req.json();
    const { data, error } = await supabase.from(table).insert(record).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const { table, id, record } = await req.json();
    const { data, error } = await supabase.from(table).update(record).eq("id", id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { table, id } = await req.json();
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
