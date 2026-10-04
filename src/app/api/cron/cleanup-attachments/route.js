// src/app/api/cron/cleanup-attachments/route.js
// Pulizia dei file vecchi nel bucket privato "attachments".
// Chiamata una volta al giorno da un cron di Vercel (vedi vercel.json).
//
//  - protetta: risponde solo se la richiesta porta "Authorization: Bearer <CRON_SECRET>"
//    (Vercel lo aggiunge da solo ai suoi cron quando CRON_SECRET è impostata)
//  - cancella con l'API di Storage (service role), mai con SQL su storage.objects
//  - soglia: ATTACHMENT_RETENTION_DAYS (default 30, minimo 1)
//  - ?dry=1 = prova a secco: elenca cosa cancellerebbe, senza cancellare niente
//
// La service role key salta le policy RLS: va usata SOLO qui, lato server.

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // secondi (Vercel)

const BUCKET = "attachments";
const PAGE = 100;          // elementi per pagina di list() e per blocco di remove()
const MAX_PER_RUN = 1000;  // tetto di sicurezza per esecuzione; il resto va al giorno dopo

function retentionDays() {
  const n = Number(process.env.ATTACHMENT_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 30;
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Elenca tutto il contenuto di una "cartella" del bucket, pagina per pagina.
async function listFolder(storage, prefix) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function GET(req) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET non configurata" }, { status: 500 });
  }
  if (!isAuthorized(req)) {
    return Response.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: "Supabase non configurato sul server" }, { status: 500 });
  }

  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const days = retentionDays();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const storage = supabase.storage.from(BUCKET);

    // 1) raccolgo i file vecchi (prima elenco, poi cancello: cancellare mentre si sfoglia
    //    sposterebbe le pagine)
    let scanned = 0;
    let skippedNoDate = 0;
    let oldest = null;
    let capped = false;
    const candidates = [];

    const consider = (path, item) => {
      if (item.name.startsWith(".")) return; // es. .emptyFolderPlaceholder
      scanned += 1;
      const ts = Date.parse(item.created_at || item.updated_at || "");
      if (!Number.isFinite(ts)) { skippedNoDate += 1; return; } // senza data non cancello
      if (oldest === null || ts < oldest) oldest = ts;
      if (ts >= cutoff) return;
      if (candidates.length >= MAX_PER_RUN) { capped = true; return; }
      candidates.push(path);
    };

    const root = await listFolder(storage, "");
    for (const entry of root) {
      if (entry.id === null) {
        // cartella = id di un utente
        const files = await listFolder(storage, entry.name);
        for (const f of files) {
          if (f.id === null) continue; // sottocartelle: non ce ne dovrebbero essere
          consider(`${entry.name}/${f.name}`, f);
        }
      } else {
        consider(entry.name, entry); // file direttamente alla radice (non previsto)
      }
    }

    // 2) cancello a blocchi con l'API di Storage
    let deleted = 0;
    const errors = [];
    if (!dryRun) {
      for (let i = 0; i < candidates.length; i += PAGE) {
        const batch = candidates.slice(i, i + PAGE);
        const { data, error } = await storage.remove(batch);
        if (error) errors.push(error.message);
        else deleted += data?.length ?? 0;
      }
    }

    const summary = {
      dryRun,
      retentionDays: days,
      cutoff: new Date(cutoff).toISOString(),
      scanned,
      oldestFile: oldest ? new Date(oldest).toISOString() : null,
      skippedNoDate,
      toDelete: candidates.length,
      deleted,
      capped, // true = ce ne sono altri oltre il tetto per esecuzione, li prende la prossima
      errors,
    };
    if (dryRun) summary.sample = candidates.slice(0, 20);

    console.log("cleanup-attachments:", JSON.stringify({ ...summary, sample: undefined }));
    return Response.json(summary, { status: errors.length ? 207 : 200 });
  } catch (err) {
    console.error("cleanup-attachments error:", err);
    return Response.json({ error: "Errore durante la pulizia" }, { status: 500 });
  }
}
