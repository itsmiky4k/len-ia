"use client";
// src/components/BoardTab.js
// Tab "Bacheca": idee, proposte e progetti del collettivo, con voti e commenti.
// Chi può fare cosa è deciso dal database (policy RLS, vedi 02_bacheca.sql):
// qui l'interfaccia mostra solo i comandi che il ruolo può usare.
 
import { useState, useEffect, useCallback, useMemo } from "react";
import { canWrite as roleCanWrite, isEditorOrAdmin } from "../lib/roles";
 
const STATUSES = [
  { id: "idea",           label: "Idea",           color: "#7B4FA0" },
  { id: "in_valutazione", label: "In valutazione", color: "#F07D2A" },
  { id: "approvata",      label: "Approvata",      color: "#2BB5AE" },
  { id: "in_corso",       label: "In corso",       color: "#0EA5E9" },
  { id: "fatta",          label: "Fatta",          color: "#3BA55C" },
];
const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));
 
const TITLE_MAX = 120;
const DESC_MAX = 4000;
const COMMENT_MAX = 1000;
const DESC_PREVIEW = 280;
const ACCENT = "#7B4FA0";
const LEN_GRADIENT = "linear-gradient(135deg,#E8354A,#2BB5AE,#7B4FA0)"; // gradiente statico LEN, come in Live
 
const sans = "'DM Sans',sans-serif";
 
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
};
 
const ui = {
  wrap:    { flex: 1, overflowY: "auto", padding: "24px 16px 60px", position: "relative", zIndex: 5 },
  inner:   { maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 },
  title:   { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", margin: 0 },
  sub:     { fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontStyle: "italic", color: "#aaa", margin: "2px 0 0" },
  card:    { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 10 },
  input:   { background: "var(--surface2)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: sans, color: "var(--text2)", width: "100%", lineHeight: 1.6, outline: "none", boxSizing: "border-box" },
  label:   { fontFamily: sans, fontSize: 10, color: "#bbb", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 },
  pill:    { background: "transparent", border: "1px solid var(--border2)", color: "#888", fontFamily: sans, fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 20, cursor: "pointer" },
  primary: { background: LEN_GRADIENT, border: "none", color: "#fff", fontFamily: sans, fontWeight: 600, fontSize: 13, padding: "10px 22px", borderRadius: 20, cursor: "pointer" },
  meta:    { fontFamily: sans, fontSize: 11, color: "#aaa" },
  text:    { fontFamily: sans, fontSize: 13.5, color: "var(--text2)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 },
  error:   { fontFamily: sans, fontSize: 12.5, color: "#E8354A", background: "rgba(232,53,74,0.08)", border: "1px solid rgba(232,53,74,0.25)", borderRadius: 10, padding: "10px 14px" },
};
 
export default function BoardTab({ supabase, userId, role, draft, onDraftConsumed, hov = {} }) {
  const canPost = roleCanWrite(role);
  const isMod = isEditorOrAdmin(role);
 
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [form, setForm] = useState(null); // null | { id: string|null, title, description }
  const [busy, setBusy] = useState(false);
  const [openComments, setOpenComments] = useState({});
  const [expanded, setExpanded] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
 
  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("board_posts")
      .select("*, board_votes(user_id), board_comments(id, author_id, author_name, body, created_at)")
      .order("created_at", { ascending: false });
    if (err) setError("Non riesco a caricare la bacheca: " + err.message);
    else {
      setError("");
      setPosts(data || []);
    }
    setLoading(false);
  }, [supabase]);
 
  useEffect(() => {
    load();
  }, [load]);
 
  // "Porta in bacheca" da Brainstorm: apre il modulo già compilato
  useEffect(() => {
    if (draft && canPost) {
      setForm({ id: null, title: draft.title || "", description: (draft.description || "").slice(0, DESC_MAX) });
      onDraftConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
 
  // ── azioni ──
  const submitForm = async () => {
    const title = form.title.trim();
    const description = form.description.trim();
    if (!title) {
      setError("Serve un titolo.");
      return;
    }
    setBusy(true);
    setError("");
    const res = form.id
      ? await supabase.from("board_posts").update({ title, description }).eq("id", form.id).select("id")
      : await supabase.from("board_posts").insert({ title, description }).select("id");
    setBusy(false);
    if (res.error) return setError("Errore: " + res.error.message);
    if (!res.data?.length) return setError("Non hai i permessi per questa modifica.");
    setForm(null);
    load();
  };
 
  const toggleVote = async (post) => {
    if (!canPost) return;
    const has = post.board_votes.some((v) => v.user_id === userId);
    setPosts((ps) =>
      ps.map((p) =>
        p.id === post.id
          ? { ...p, board_votes: has ? p.board_votes.filter((v) => v.user_id !== userId) : [...p.board_votes, { user_id: userId }] }
          : p
      )
    );
    const { error: err } = has
      ? await supabase.from("board_votes").delete().eq("post_id", post.id).eq("user_id", userId)
      : await supabase.from("board_votes").insert({ post_id: post.id, user_id: userId });
    if (err) {
      setError("Voto non registrato: " + err.message);
      load();
    }
  };
 
  const changeStatus = async (post, status) => {
    const prev = post.status;
    setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, status } : p)));
    const { data, error: err } = await supabase.from("board_posts").update({ status }).eq("id", post.id).select("id");
    if (err || !data?.length) {
      setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, status: prev } : p)));
      setError(err ? "Stato non aggiornato: " + err.message : "Non hai i permessi per cambiare lo stato.");
    }
  };
 
  const removePost = async (post) => {
    if (!window.confirm(`Eliminare "${post.title}"? Verranno eliminati anche voti e commenti.`)) return;
    const { data, error: err } = await supabase.from("board_posts").delete().eq("id", post.id).select("id");
    if (err) return setError("Eliminazione non riuscita: " + err.message);
    if (!data?.length) return setError("Non puoi eliminare questa idea.");
    setPosts((ps) => ps.filter((p) => p.id !== post.id));
  };
 
  const addComment = async (post) => {
    const body = (commentDrafts[post.id] || "").trim();
    if (!body) return;
    const { data, error: err } = await supabase
      .from("board_comments")
      .insert({ post_id: post.id, body })
      .select("id, author_id, author_name, body, created_at")
      .single();
    if (err) return setError("Commento non inviato: " + err.message);
    setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, board_comments: [...p.board_comments, data] } : p)));
    setCommentDrafts((d) => ({ ...d, [post.id]: "" }));
  };
 
  const deleteComment = async (post, comment) => {
    const { data, error: err } = await supabase.from("board_comments").delete().eq("id", comment.id).select("id");
    if (err) return setError("Eliminazione non riuscita: " + err.message);
    if (!data?.length) return setError("Non puoi eliminare questo commento.");
    setPosts((ps) =>
      ps.map((p) => (p.id === post.id ? { ...p, board_comments: p.board_comments.filter((c) => c.id !== comment.id) } : p))
    );
  };
 
  // ── elenco filtrato e ordinato ──
  const counts = useMemo(() => {
    const c = { all: posts.length };
    STATUSES.forEach((s) => (c[s.id] = posts.filter((p) => p.status === s.id).length));
    return c;
  }, [posts]);
 
  const visible = useMemo(() => {
    const list = filter === "all" ? posts : posts.filter((p) => p.status === filter);
    const byDate = (a, b) => new Date(b.created_at) - new Date(a.created_at);
    return [...list].sort(sort === "votes" ? (a, b) => b.board_votes.length - a.board_votes.length || byDate(a, b) : byDate);
  }, [posts, filter, sort]);
 
  // ── interfaccia ──
  const renderForm = () => (
    <div style={{ ...ui.card, borderColor: `${ACCENT}66` }}>
      <span style={ui.label}>{form.id ? "Modifica idea" : "Nuova idea"}</span>
      <input
        style={ui.input}
        value={form.title}
        maxLength={TITLE_MAX}
        placeholder="Titolo (es. murales per la serata di chiusura)"
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      />
      <textarea
        style={{ ...ui.input, minHeight: 140, resize: "vertical" }}
        value={form.description}
        maxLength={DESC_MAX}
        placeholder="Descrivi l'idea: cosa, perché, cosa serve…"
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button style={{ ...ui.primary, opacity: busy || !form.title.trim() ? 0.5 : 1 }} disabled={busy || !form.title.trim()} onClick={submitForm} {...hov}>
          {busy ? "Salvo…" : form.id ? "Salva modifiche" : "Pubblica in bacheca"}
        </button>
        <button style={ui.pill} onClick={() => setForm(null)} {...hov}>Annulla</button>
        <span style={{ ...ui.meta, marginLeft: "auto" }}>{form.description.length}/{DESC_MAX}</span>
      </div>
    </div>
  );
 
  const renderPost = (post) => {
    const st = STATUS_BY_ID[post.status] || STATUS_BY_ID.idea;
    const votes = post.board_votes.length;
    const voted = post.board_votes.some((v) => v.user_id === userId);
    const isAuthor = post.author_id === userId;
    const canEditOwn = isAuthor && post.status === "idea" && canPost;
    const comments = [...post.board_comments].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const long = post.description.length > DESC_PREVIEW;
    const isOpen = !!expanded[post.id];
    const showComments = !!openComments[post.id];
 
    return (
      <div key={post.id} style={ui.card}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}44`, borderRadius: 20, padding: "3px 10px" }}>
            {st.label}
          </span>
          <span style={{ ...ui.meta, marginTop: 3 }}>{post.author_name} · {fmtDate(post.created_at)}</span>
          {isMod && (
            <select
              value={post.status}
              onChange={(e) => changeStatus(post, e.target.value)}
              aria-label="Cambia stato"
              style={{ ...ui.input, width: "auto", padding: "4px 10px", fontSize: 12, marginLeft: "auto" }}
            >
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          )}
        </div>
 
        <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 800, color: "var(--text)", margin: 0, wordBreak: "break-word" }}>{post.title}</h3>
        {post.description && (
          <p style={ui.text}>
            {long && !isOpen ? post.description.slice(0, DESC_PREVIEW).trimEnd() + "…" : post.description}
          </p>
        )}
        {long && (
          <button style={{ ...ui.pill, alignSelf: "flex-start", border: "none", padding: 0, color: ACCENT }} onClick={() => setExpanded((x) => ({ ...x, [post.id]: !isOpen }))}>
            {isOpen ? "mostra meno" : "leggi tutto"}
          </button>
        )}
 
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            style={{ ...ui.pill, color: voted ? ACCENT : "#888", borderColor: voted ? ACCENT : "var(--border2)", fontWeight: voted ? 700 : 500, opacity: canPost ? 1 : 0.7, cursor: canPost ? "pointer" : "default" }}
            onClick={() => toggleVote(post)}
            title={canPost ? (voted ? "Togli il voto" : "Vota questa idea") : "Il tuo ruolo è sola lettura"}
            {...hov}
          >
            ▲ {votes}
          </button>
          <button style={ui.pill} onClick={() => setOpenComments((o) => ({ ...o, [post.id]: !showComments }))} {...hov}>
            💬 {comments.length}
          </button>
          {canEditOwn && (
            <button style={ui.pill} onClick={() => setForm({ id: post.id, title: post.title, description: post.description })} {...hov}>modifica</button>
          )}
          {(isMod || canEditOwn) && (
            <button style={{ ...ui.pill, color: "#E8354A" }} onClick={() => removePost(post)} {...hov}>
              {isMod ? "elimina" : "ritira"}
            </button>
          )}
        </div>
 
        {showComments && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {comments.length === 0 && <span style={ui.meta}>Ancora nessun commento.</span>}
            {comments.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...ui.meta, fontWeight: 600 }}>{c.author_name}</span>{" "}
                  <span style={ui.meta}>· {fmtDate(c.created_at)}</span>
                  <p style={{ ...ui.text, fontSize: 13 }}>{c.body}</p>
                </div>
                {(c.author_id === userId || isMod) && (
                  <button style={{ ...ui.pill, border: "none", padding: "0 4px", color: "#bbb" }} onClick={() => deleteComment(post, c)} aria-label="Elimina commento" {...hov}>✕</button>
                )}
              </div>
            ))}
            {canPost && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...ui.input, flex: 1 }}
                  value={commentDrafts[post.id] || ""}
                  maxLength={COMMENT_MAX}
                  placeholder="Scrivi un commento…"
                  onChange={(e) => setCommentDrafts((d) => ({ ...d, [post.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addComment(post); }}
                />
                <button style={ui.pill} onClick={() => addComment(post)} disabled={!(commentDrafts[post.id] || "").trim()} {...hov}>Invia</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
 
  return (
    <div style={ui.wrap}>
      <div style={ui.inner}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={ui.title}>Bacheca</h2>
            <p style={ui.sub}>Idee, proposte e progetti del collettivo.</p>
          </div>
          {canPost && !form && (
            <button style={ui.primary} onClick={() => setForm({ id: null, title: "", description: "" })} {...hov}>＋ Nuova idea</button>
          )}
        </div>
 
        {!canPost && <div style={{ ...ui.meta, fontSize: 12 }}>Il tuo ruolo è sola lettura: puoi leggere la bacheca ma non pubblicare, votare o commentare.</div>}
        {error && <div style={ui.error} role="alert">{error}</div>}
        {form && renderForm()}
 
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[{ id: "all", label: "Tutte", color: "#888" }, ...STATUSES].map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              style={{ ...ui.pill, padding: "5px 12px", fontSize: 11, color: filter === s.id ? "#fff" : s.color, background: filter === s.id ? s.color : "transparent", borderColor: filter === s.id ? s.color : `${s.color}55` }}
              {...hov}
            >
              {s.label} ({counts[s.id] ?? 0})
            </button>
          ))}
          <button style={{ ...ui.pill, marginLeft: "auto", padding: "5px 12px", fontSize: 11 }} onClick={() => setSort((x) => (x === "recent" ? "votes" : "recent"))} {...hov}>
            {sort === "recent" ? "↓ più recenti" : "↓ più votate"}
          </button>
        </div>
 
        {loading ? (
          <div style={ui.meta}>Carico la bacheca…</div>
        ) : visible.length === 0 ? (
          <div style={{ ...ui.card, alignItems: "center", textAlign: "center", padding: 36 }}>
            <div style={{ fontSize: 34 }}>📋</div>
            <p style={{ ...ui.text, color: "#aaa" }}>
              {posts.length === 0 ? "La bacheca è vuota: sii il primo a proporre qualcosa!" : "Nessuna idea in questo stato."}
            </p>
          </div>
        ) : (
          visible.map(renderPost)
        )}
      </div>
    </div>
  );
}
