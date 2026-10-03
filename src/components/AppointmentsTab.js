"use client";
// src/components/AppointmentsTab.js
// Tab "Appuntamenti": riunioni, incontri, eventi del collettivo.
// Separata dal calendario editoriale dei post. Chi può fare cosa lo decide il
// database (policy RLS, vedi 03_appuntamenti.sql): qui si mostrano solo i comandi
// che il ruolo può usare. Include il link .ics personale per il calendario del telefono.

import { useState, useEffect, useCallback, useMemo } from "react";
import { canWrite as roleCanWrite, isEditorOrAdmin } from "../lib/roles";

const ACCENT = "#0EA5E9";
const sans = "'DM Sans',sans-serif";

const ui = {
  wrap:    { flex: 1, overflowY: "auto", padding: "24px 16px 60px", position: "relative", zIndex: 5 },
  inner:   { maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 },
  title:   { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", margin: 0 },
  sub:     { fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontStyle: "italic", color: "#aaa", margin: "2px 0 0" },
  card:    { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 8 },
  input:   { background: "var(--surface2)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: sans, color: "var(--text2)", width: "100%", lineHeight: 1.5, outline: "none", boxSizing: "border-box" },
  label:   { fontFamily: sans, fontSize: 10, color: "#bbb", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 },
  pill:    { background: "transparent", border: "1px solid var(--border2)", color: "#888", fontFamily: sans, fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 20, cursor: "pointer" },
  primary: { background: `linear-gradient(135deg,${ACCENT},#7B4FA0)`, border: "none", color: "#fff", fontFamily: sans, fontWeight: 600, fontSize: 13, padding: "10px 22px", borderRadius: 20, cursor: "pointer" },
  meta:    { fontFamily: sans, fontSize: 11.5, color: "#aaa" },
  text:    { fontFamily: sans, fontSize: 13.5, color: "var(--text2)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 },
  error:   { fontFamily: sans, fontSize: 12.5, color: "#E8354A", background: "rgba(232,53,74,0.08)", border: "1px solid rgba(232,53,74,0.25)", borderRadius: 10, padding: "10px 14px" },
  day:     { fontFamily: sans, fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: "0.12em", textTransform: "uppercase", margin: "6px 0 -4px" },
};

const pad = (n) => String(n).padStart(2, "0");
// ISO (UTC) -> valore per <input type="datetime-local"> nell'orario locale
const toLocalInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const hhmm = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
  const base = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  if (dayKey(iso) === dayKey(today.toISOString())) return `Oggi · ${base}`;
  if (dayKey(iso) === dayKey(tomorrow.toISOString())) return `Domani · ${base}`;
  return base;
};
const nextFullHour = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
};
const endOf = (a) => (a.ends_at ? new Date(a.ends_at) : new Date(new Date(a.starts_at).getTime() + 3600 * 1000));

export default function AppointmentsTab({ supabase, userId, role, hov = {} }) {
  const canPost = roleCanWrite(role);
  const isMod = isEditorOrAdmin(role);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // null | { id|null, title, start, end, location, description }
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedToken, setFeedToken] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { data, error: err } = await supabase.from("appointments").select("*").gte("starts_at", since).order("starts_at", { ascending: true });
    if (err) setError("Non riesco a caricare gli appuntamenti: " + err.message);
    else {
      setError("");
      setItems(data || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = (a) => isMod || (a.author_id === userId && canPost);

  const submitForm = async () => {
    const title = form.title.trim();
    if (!title) return setError("Serve un titolo.");
    if (!form.start) return setError("Serve la data e l'ora di inizio.");
    const start = new Date(form.start);
    const end = form.end ? new Date(form.end) : null;
    if (end && end < start) return setError("La fine non può essere prima dell'inizio.");
    const record = {
      title,
      description: form.description.trim(),
      location: form.location.trim(),
      starts_at: start.toISOString(),
      ends_at: end ? end.toISOString() : null,
    };
    setBusy(true);
    setError("");
    const res = form.id
      ? await supabase.from("appointments").update(record).eq("id", form.id).select("id")
      : await supabase.from("appointments").insert(record).select("id");
    setBusy(false);
    if (res.error) return setError("Errore: " + res.error.message);
    if (!res.data?.length) return setError("Non hai i permessi per questa modifica.");
    setForm(null);
    load();
  };

  const remove = async (a) => {
    if (!window.confirm(`Eliminare "${a.title}"?`)) return;
    const { data, error: err } = await supabase.from("appointments").delete().eq("id", a.id).select("id");
    if (err) return setError("Eliminazione non riuscita: " + err.message);
    if (!data?.length) return setError("Non puoi eliminare questo appuntamento.");
    setItems((xs) => xs.filter((x) => x.id !== a.id));
  };

  // ── link .ics personale ──
  const openFeed = async () => {
    const next = !feedOpen;
    setFeedOpen(next);
    if (next && !feedToken) {
      const { data, error: err } = await supabase.rpc("my_feed_token");
      if (err) setError("Non riesco a creare il link: " + err.message);
      else setFeedToken(data);
    }
  };
  const regenerate = async () => {
    if (!window.confirm("Generare un nuovo link? Quello vecchio smetterà di funzionare e dovrai riaggiungerlo al calendario.")) return;
    const { data, error: err } = await supabase.rpc("my_feed_token", { regenerate: true });
    if (err) return setError("Non riesco a rigenerare il link: " + err.message);
    setFeedToken(data);
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const host = typeof window !== "undefined" ? window.location.host : "";
  const feedUrl = feedToken ? `${origin}/api/calendar/${feedToken}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copia non riuscita: selezionale il link a mano.");
    }
  };

  // ── elenco: prossimi raggruppati per giorno, passati a parte ──
  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    return {
      upcoming: items.filter((a) => endOf(a) >= now),
      past: items.filter((a) => endOf(a) < now).reverse(),
    };
  }, [items]);

  const groups = (list) => {
    const out = [];
    for (const a of list) {
      const k = dayKey(a.starts_at);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(a);
      else out.push({ key: k, label: dayLabel(a.starts_at), items: [a] });
    }
    return out;
  };

  const renderItem = (a, dim) => (
    <div key={a.id} style={{ ...ui.card, opacity: dim ? 0.6 : 1, flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
      <div style={{ minWidth: 62, fontFamily: sans, fontSize: 13, fontWeight: 700, color: ACCENT, paddingTop: 2 }}>
        {hhmm(a.starts_at)}
        {a.ends_at && <div style={{ fontWeight: 500, color: "#aaa", fontSize: 11 }}>→ {hhmm(a.ends_at)}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 800, color: "var(--text)", margin: 0, wordBreak: "break-word" }}>{a.title}</h3>
        {a.location && <span style={ui.meta}>📍 {a.location}</span>}
        {a.description && <p style={{ ...ui.text, fontSize: 13 }}>{a.description}</p>}
        <span style={ui.meta}>aggiunto da {a.author_name}</span>
        {canManage(a) && (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button style={ui.pill} onClick={() => setForm({ id: a.id, title: a.title, start: toLocalInput(a.starts_at), end: a.ends_at ? toLocalInput(a.ends_at) : "", location: a.location, description: a.description })} {...hov}>modifica</button>
            <button style={{ ...ui.pill, color: "#E8354A" }} onClick={() => remove(a)} {...hov}>elimina</button>
          </div>
        )}
      </div>
    </div>
  );

  const renderGroups = (list, dim) =>
    groups(list).map((g) => (
      <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={ui.day}>{g.label}</div>
        {g.items.map((a) => renderItem(a, dim))}
      </div>
    ));

  return (
    <div style={ui.wrap}>
      <div style={ui.inner}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={ui.title}>Appuntamenti</h2>
            <p style={ui.sub}>Riunioni, incontri ed eventi del collettivo.</p>
          </div>
          <button style={ui.pill} onClick={openFeed} {...hov}>📲 Aggiungi al telefono</button>
          {canPost && !form && (
            <button style={ui.primary} onClick={() => setForm({ id: null, title: "", start: nextFullHour(), end: "", location: "", description: "" })} {...hov}>＋ Nuovo</button>
          )}
        </div>

        {!canPost && <div style={ui.meta}>Il tuo ruolo è sola lettura: puoi vedere gli appuntamenti ma non crearli.</div>}
        {error && <div style={ui.error} role="alert">{error}</div>}

        {feedOpen && (
          <div style={{ ...ui.card, borderColor: `${ACCENT}66` }}>
            <span style={ui.label}>Il tuo calendario personale</span>
            <p style={{ ...ui.text, fontSize: 13 }}>
              Aggiungi questo link al calendario del telefono: gli appuntamenti compariranno da soli, con un avviso 30 minuti prima. Il link è <b>personale</b>: non condividerlo.
            </p>
            {feedToken ? (
              <>
                <input style={{ ...ui.input, fontSize: 11.5 }} readOnly value={feedUrl} onFocus={(e) => e.target.select()} aria-label="Link del calendario" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={ui.primary} onClick={copy} {...hov}>{copied ? "Copiato ✓" : "Copia il link"}</button>
                  <a href={`webcal://${host}/api/calendar/${feedToken}`} style={{ ...ui.pill, textDecoration: "none", display: "inline-block" }} {...hov}>Apri in Calendario (iPhone/Mac)</a>
                  <button style={{ ...ui.pill, color: "#E8354A" }} onClick={regenerate} {...hov}>Genera nuovo link</button>
                </div>
                <p style={ui.meta}>
                  Su Google Calendar (da computer): "Altri calendari" → "Da URL" e incolla il link. I calendari si aggiornano da soli, ma possono metterci qualche ora; l'avviso a 30 minuti dipende dall'app (su Google Calendar si impostano le notifiche del calendario).
                </p>
              </>
            ) : (
              <span style={ui.meta}>Genero il link…</span>
            )}
          </div>
        )}

        {form && (
          <div style={{ ...ui.card, borderColor: `${ACCENT}66` }}>
            <span style={ui.label}>{form.id ? "Modifica appuntamento" : "Nuovo appuntamento"}</span>
            <input style={ui.input} value={form.title} maxLength={120} placeholder="Titolo (es. Riunione di redazione)" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 190, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={ui.label}>Inizio</span>
                <input type="datetime-local" style={ui.input} value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
              </label>
              <label style={{ flex: 1, minWidth: 190, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={ui.label}>Fine (facoltativa)</span>
                <input type="datetime-local" style={ui.input} value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
              </label>
            </div>
            <input style={ui.input} value={form.location} maxLength={200} placeholder="Luogo (facoltativo)" onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            <textarea style={{ ...ui.input, minHeight: 90, resize: "vertical" }} value={form.description} maxLength={2000} placeholder="Note, ordine del giorno… (facoltativo)" onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...ui.primary, opacity: busy || !form.title.trim() || !form.start ? 0.5 : 1 }} disabled={busy || !form.title.trim() || !form.start} onClick={submitForm} {...hov}>
                {busy ? "Salvo…" : form.id ? "Salva modifiche" : "Aggiungi"}
              </button>
              <button style={ui.pill} onClick={() => setForm(null)} {...hov}>Annulla</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={ui.meta}>Carico gli appuntamenti…</div>
        ) : upcoming.length === 0 ? (
          <div style={{ ...ui.card, alignItems: "center", textAlign: "center", padding: 36 }}>
            <div style={{ fontSize: 34 }}>🗓️</div>
            <p style={{ ...ui.text, color: "#aaa" }}>Nessun appuntamento in programma.</p>
          </div>
        ) : (
          renderGroups(upcoming, false)
        )}

        {past.length > 0 && (
          <>
            <button style={{ ...ui.pill, alignSelf: "flex-start" }} onClick={() => setShowPast((s) => !s)} {...hov}>
              {showPast ? "Nascondi passati" : `Mostra passati (${past.length})`}
            </button>
            {showPast && renderGroups(past, true)}
          </>
        )}
      </div>
    </div>
  );
}
