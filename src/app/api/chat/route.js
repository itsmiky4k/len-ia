// src/app/api/chat/route.js
// Proxy verso l'API Anthropic, blindato:
//  - richiede login Supabase
//  - il client manda solo la "mode" (brainstorm, caption, ...): prompt e max_tokens
//    li decide il server, e il ruolo dell'utente deve poter usare quella mode
//  - modello deciso dal server (variabile ANTHROPIC_MODEL)
//  - accetta solo i campi mode / brief / messages
//  - allegati ammessi solo come URL firmati del TUO bucket Supabase "attachments"
//  - rate limit "best effort" per utente
 
import { createClient } from "@supabase/supabase-js";
import { canUseMode } from "../../../lib/roles";
import { buildSystem, MODE_MAX_TOKENS } from "../../../lib/prompts";
 
export const maxDuration = 60; // secondi (Vercel)
 
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 
// Modello: cambialo da Vercel con la variabile ANTHROPIC_MODEL, senza toccare il codice
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_TOKENS_CAP = Number(process.env.MAX_TOKENS_CAP) || 2000;
 
const MAX_MESSAGES = 30;
const MAX_TEXT_CHARS = 60000;
const MAX_ATTACHMENTS = 10;
const RATE_LIMIT_PER_MIN = 20;
 
const ALLOWED_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/sign/attachments/`;
 
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
 
// ── rate limit in memoria (per istanza serverless: è un freno, non una garanzia) ──
const hits = new Map();
function rateLimited(userId) {
  const now = Date.now();
  const entry = hits.get(userId);
  if (!entry || now > entry.resetAt) {
    hits.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_PER_MIN;
}
 
// ── validazione dei messaggi ──
function cleanText(text) {
  if (typeof text !== "string") fail(400, "Testo non valido");
  if (text.length > MAX_TEXT_CHARS) fail(413, "Messaggio troppo lungo");
  return text;
}
 
function cleanBlock(b, counters) {
  if (!b || typeof b !== "object") fail(400, "Blocco non valido");
 
  if (b.type === "text") return { type: "text", text: cleanText(b.text) };
 
  if (b.type === "image" || b.type === "document") {
    const url = b.source?.url;
    if (b.source?.type !== "url" || typeof url !== "string" || !url.startsWith(ALLOWED_URL_PREFIX)) {
      fail(400, "Allegato non valido");
    }
    counters.files += 1;
    if (counters.files > MAX_ATTACHMENTS) fail(400, "Troppi allegati");
    return { type: b.type, source: { type: "url", url } };
  }
 
  return fail(400, "Tipo di contenuto non consentito");
}
 
function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    fail(400, "Elenco messaggi non valido");
  }
  const counters = { files: 0 };
  return messages.map((m) => {
    if (!m || (m.role !== "user" && m.role !== "assistant")) fail(400, "Ruolo non valido");
    if (typeof m.content === "string") return { role: m.role, content: cleanText(m.content) };
    if (Array.isArray(m.content) && m.content.length > 0) {
      return { role: m.role, content: m.content.map((b) => cleanBlock(b, counters)) };
    }
    return fail(400, "Contenuto non valido");
  });
}
 
// ── handler ──
export async function POST(req) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) fail(401, "Non autenticato");
 
    // client che agisce "come l'utente" (RLS attiva)
    const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
 
    const { data, error: authError } = await db.auth.getUser(token);
    const user = data?.user;
    if (authError || !user) fail(401, "Non autenticato");
 
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
    if (!profile) fail(403, "Profilo non trovato");
 
    if (rateLimited(user.id)) fail(429, "Troppe richieste, riprova tra un minuto");
 
    const body = await req.json().catch(() => fail(400, "JSON non valido"));
 
    // modalità richiesta: deve esistere ed essere permessa al ruolo di chi chiama
    const mode = body.mode;
    const system = typeof mode === "string" ? buildSystem(mode, body.brief) : null;
    if (!system) fail(400, "Modalità non valida");
    if (!canUseMode(profile.role, mode)) fail(403, "Il tuo ruolo non può usare questa funzione");
 
    const payload = {
      model: MODEL,
      max_tokens: Math.min(MODE_MAX_TOKENS[mode] || 1000, MAX_TOKENS_CAP),
      system,
      messages: cleanMessages(body.messages),
    };
 
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
 
    const result = await upstream.json();
    return Response.json(result, { status: upstream.status });
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: { message: err.message } }, { status: err.status });
    }
    console.error("api/chat error:", err);
    return Response.json({ error: { message: "Errore interno del server" } }, { status: 500 });
  }
}
 
