"use client";
// LEN-IA v1.1 — fix cursor
import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { uploadAttachment, deleteAttachment, toBlock, MAX_FILES_PER_MESSAGE } from "../lib/attachments";
import { callAI, dbGet, dbPost, dbPut, dbDelete } from "../lib/api";
import { S } from "../lib/styles";
import { normalizeRole, canAccessTab, canWrite as roleCanWrite } from "../lib/roles";
import BoardTab from "../components/BoardTab";
import AppointmentsTab from "../components/AppointmentsTab";
import AnalyticsTab from "../components/AnalyticsTab";
import CalendarTab from "../components/CalendarTab";
 
// I prompt dell'AI stanno sul server: src/lib/prompts.js (usati da /api/chat).
 
const MODES = [
  { id: "brainstorm", label: "💡 Brainstorm",  desc: "Consulente creativo libero da schemi",    color: "#E8354A" },
  { id: "caption",    label: "✍️ Caption",    desc: "Scrivi una caption per il tuo post",       color: "#2BB5AE" },
  { id: "hashtag",    label: "# Hashtag",     desc: "Trova gli hashtag perfetti",               color: "#7B4FA0" },
  { id: "reels",      label: "🎬 Video",       desc: "Assistente per la produzione video",       color: "#2BB5AE" },
  { id: "analytics",  label: "📈 Analytics",   desc: "Traccia e analizza i tuoi post",           color: "#E8354A" },
  { id: "live",       label: "📡 Live",        desc: "Sessione condivisa in tempo reale col team", color: "#0EA5E9" },
  { id: "bacheca",    label: "📋 Bacheca",    desc: "Idee, proposte e progetti del collettivo", color: "#F07D2A" },
  { id: "appuntamenti", label: "🗓️ Appuntamenti", desc: "Riunioni, incontri ed eventi del collettivo", color: "#0EA5E9" },
];
const PLATFORMS   = ["Instagram", "Facebook", "Entrambi"];
const TONE_OPTIONS = ["Ironico","Poetico","Diretto","Provocatorio","Caldo","Misterioso","Giocoso","Urgente"];
const CONTEXTUAL_CHIPS = {
  brainstorm: ["nuova direzione creativa","concept per il prossimo mese","identita visiva del collettivo","come differenziarci","collab da proporre","tema per una campagna"],
  caption:    ["backstage di una performance","nuovo progetto artistico","evento imminente","collab con un artista","behind the scenes","lancio di un brano"],
  hashtag:    ["musica alternativa italiana","arte collettiva urbana","live performance","new release","arte digitale","collettivo underground"],
  reels:      ["teaser nuovo brano","day in the life artista","behind the scenes live","time-lapse studio session","annuncio sorpresa","making of artwork"],
  analytics:  [],
  live:       [],
  bacheca:    [],
  appuntamenti: [],
};
 
// Helper API (callAI, dbGet, ...) in src/lib/api.js — stili condivisi in src/lib/styles.js.
// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function LenIA() {
  // User
  const [userName, setUserName] = useState("");
  const [userInput, setUserInput] = useState("");
  const [userReady, setUserReady] = useState(false);
 
  // ── AUTH (Supabase Auth, magic link) ──
  const [session, setSession]         = useState(null);
  const [profile, setProfile]         = useState(null);
  const [authEmail, setAuthEmail]     = useState("");
  const [authStage, setAuthStage]     = useState("idle");
  const [authLoading, setAuthLoading] = useState(false);
  const [nameDraft, setNameDraft]     = useState("");
  const [showTeam, setShowTeam]       = useState(false);
  const [teamProfiles, setTeamProfiles] = useState([]);
  const role = normalizeRole(profile?.role);
  const canWrite = roleCanWrite(role);
  const [loadingUser, setLoadingUser] = useState(false);
 
  // Dark mode
  const [dark, setDark] = useState(false);
 
  // Sessione Live (condivisa in tempo reale)
  const [liveCode, setLiveCode]         = useState("");
  const [activeLive, setActiveLive]     = useState(null);
  const [liveMessages, setLiveMessages] = useState([]);
  const [liveInput, setLiveInput]       = useState("");
  const [liveLoading, setLiveLoading]   = useState(false);
  const [liveOnline, setLiveOnline]     = useState([]);
 
  // Chat
  const [mode, setMode]         = useState("caption");
  const [boardDraft, setBoardDraft] = useState(null); // idea portata da Brainstorm alla Bacheca
  // tab non permessa dal ruolo (es. membro su Caption) -> sposta su una permessa
  useEffect(() => {
    if (!profile) return;
    if (!canAccessTab(role, mode)) setMode(role === "ospite" ? "live" : "brainstorm");
  }, [profile, role, mode]);
  const [platform, setPlatform] = useState("Instagram");
  const [input, setInput]       = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [history, setHistory]   = useState([]);
 
  // Brief
  const [showBrief, setShowBrief]   = useState(false);
  const [brief, setBrief]           = useState({ tones:[], keywords:"", examples:"" });
  const [briefId, setBriefId]       = useState(null);
  const [briefSaved, setBriefSaved] = useState(false);
 
  // Saved
  const [showHistory, setShowHistory] = useState(false);
  const [savedItems, setSavedItems]   = useState([]);
 
  // Brainstorm sessions
  const [bSessions, setBSessions]         = useState([]); // list of saved sessions
  const [bSessionId, setBSessionId]       = useState(null); // current session id
  const [showBSessions, setShowBSessions] = useState(false);
 
  // Analysis
  const [analyzing, setAnalyzing] = useState(null);
  const [analyses, setAnalyses]   = useState({});
 
  // Analytics
  const [posts, setPosts]             = useState([]);
  const [aiInsights, setAiInsights]   = useState(null);
 
  // Calendar
  const [calEvents, setCalEvents]         = useState([]);
 
  // Attachments (tutte le tab chat) — file su Supabase Storage
const [attachments, setAttachments] = useState([]); // array of { path, mediaType, name, preview, isPdf }
const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [isMobile, setIsMobile]   = useState(false);
  const isHoveringRef  = useRef(false);
  const cursorDotRef   = useRef(null);
  const cursorRingRef  = useRef(null);
  const cursorTrailRefs = useRef([]);
  const bottomRef = useRef(null);
  const currentModeRef = useRef("#E8354A");
 
  // Keep currentModeRef in sync
  useEffect(() => {
    const m = MODES.find(m => m.id === mode);
    if (!m) return;
    currentModeRef.current = m.color;
    // Update cursor color live
    if (cursorDotRef.current)  cursorDotRef.current.style.background  = m.color;
    if (cursorRingRef.current) cursorRingRef.current.style.borderColor = m.color;
  }, [mode]);
 
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.matchMedia("(pointer: coarse)").matches);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
 
  useEffect(() => {
    if (isMobile) return;
    const trail = [];
    const fn = (e) => {
      const x = e.clientX, y = e.clientY;
      if (cursorDotRef.current) {
        cursorDotRef.current.style.left = x + "px";
        cursorDotRef.current.style.top  = y + "px";
      }
      if (cursorRingRef.current) {
        cursorRingRef.current.style.left = x + "px";
        cursorRingRef.current.style.top  = y + "px";
      }
      trail.unshift({ x, y, id: Date.now() });
      if (trail.length > 7) trail.pop();
      cursorTrailRefs.current.forEach((el, i) => {
        if (!el || !trail[i]) return;
        el.style.left    = trail[i].x + "px";
        el.style.top     = trail[i].y + "px";
        el.style.opacity = Math.max(0, 0.5 - i * 0.07);
        const s = Math.max(2, 8 - i) + "px";
        el.style.width  = s;
        el.style.height = s;
      });
    };
    window.addEventListener("mousemove", fn);
    return () => window.removeEventListener("mousemove", fn);
  }, [isMobile]);
 
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, loading]);
 
  // Carica tutti i dati dell'utente dato il suo display_name (stessa logica di sempre)
  const loadUserData = async (name) => {
    const [briefData, savedData, postsData, calData, bSessionsData] = await Promise.all([
      dbGet("briefs", name),
      dbGet("saved_items", name),
      dbGet("analytics_posts", name),
      dbGet("calendar_events", name),
      dbGet("brainstorm_sessions", name),
    ]);
    if (briefData?.length > 0) {
      const b = briefData[0];
      setBrief({ tones: b.tones || [], keywords: b.keywords || "", examples: b.examples || "" });
      setBriefId(b.id);
    }
    if (savedData?.length > 0) setSavedItems(savedData.map(i => ({ id:i.id, content:i.content, mode:i.mode, platform:i.platform, savedAt: new Date(i.saved_at).toLocaleString("it-IT") })));
    if (postsData?.length > 0) setPosts(postsData.map(p => ({ ...p, id:p.id, date:p.post_date, reach:p.reach||0, impressions:p.impressions||0, likes:p.likes||0, comments:p.comments||0, saves:p.saves||0, shares:p.shares||0 })));
    if (calData?.length > 0) setCalEvents(calData.map(e => ({ ...e, date: e.event_date })));
    if (bSessionsData?.length > 0) setBSessions(bSessionsData);
  };
 
  // Carica (o attende) il profilo collegato all'utente autenticato
  const loadProfile = async (userId, retry=0) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) return data;
    if (retry < 5) { await new Promise(r=>setTimeout(r,400)); return loadProfile(userId, retry+1); }
    return null;
  };
 
  // ── AUTH BOOTSTRAP ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session:s } }) => setSession(s));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
 
  useEffect(() => {
    if (!session?.user) { setProfile(null); setUserReady(false); return; }
    let cancelled = false;
    (async () => {
      setLoadingUser(true);
      const p = await loadProfile(session.user.id);
      if (cancelled) return;
      setProfile(p);
      if (p?.display_name) {
        setUserName(p.display_name);
        await loadUserData(p.display_name);
        if (!cancelled) { setLoadingUser(false); setUserReady(true); }
      } else {
        setLoadingUser(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);
 
  const sendMagicLink = async () => {
    const email = authEmail.trim();
    if (!email) return;
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof window!=="undefined" ? window.location.origin : undefined, shouldCreateUser:false } });
    setAuthLoading(false);
    if (error) { alert("Errore invio link: " + error.message); return; }
    setAuthStage("sent");
  };
 
  const confirmDisplayName = async () => {
    const name = nameDraft.trim();
    if (!name || !session?.user) return;
    setLoadingUser(true);
    const { data, error } = await supabase.from("profiles").update({ display_name:name }).eq("id", session.user.id).select().single();
    if (error) { alert("Errore salvataggio nome: " + error.message); setLoadingUser(false); return; }
    setProfile(data);
    setUserName(name);
    await loadUserData(name);
    setLoadingUser(false);
    setUserReady(true);
  };
 
  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setUserReady(false); setUserName("");
    setAuthEmail(""); setAuthStage("idle");
  };
 
  const openTeamPanel = async () => {
    setShowTeam(true);
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending:true });
    setTeamProfiles(data || []);
  };
 
  const changeRole = async (id, newRole) => {
    const { error } = await supabase.from("profiles").update({ role:newRole }).eq("id", id);
    if (error) { alert("Errore aggiornamento ruolo: " + error.message); return; }
    setTeamProfiles(p => p.map(x => x.id===id ? { ...x, role:newRole } : x));
  };
 
  // ── BRAINSTORM SESSION FUNCTIONS ──
  const saveBrainstormSession = async (msgs, hist) => {
    if (msgs.length === 0) return;
    const title = msgs[0]?.display?.slice(0, 60) || "Sessione senza titolo";
    const record = {
      user_name: userName,
      title,
      messages: JSON.stringify(msgs),
      history: JSON.stringify(hist),
      saved_at: new Date().toISOString(),
    };
    if (bSessionId) {
      await dbPut("brainstorm_sessions", bSessionId, record);
    } else {
      const saved = await dbPost("brainstorm_sessions", record);
      if (saved?.id) {
        setBSessionId(saved.id);
        setBSessions(p => [{ ...record, id: saved.id }, ...p.filter(s => s.id !== saved.id)]);
      }
    }
  };
 
  const loadBrainstormSession = (session) => {
    try {
      const msgs = JSON.parse(session.messages || "[]");
      const hist = JSON.parse(session.history || "[]");
      setMessages(msgs);
      setHistory(hist);
      setBSessionId(session.id);
      setShowBSessions(false);
      setMode("brainstorm");
    } catch {}
  };
 
  const deleteBrainstormSession = async (id) => {
    await dbDelete("brainstorm_sessions", id);
    setBSessions(p => p.filter(s => s.id !== id));
    if (bSessionId === id) { setBSessionId(null); }
  };
 
  const newBrainstormSession = () => {
    setMessages([]);
    setHistory([]);
    setBSessionId(null);
    setShowBSessions(false);
  };
 
  const currentMode = MODES.find(m => m.id === mode);
  // ── DARK MODE: carica preferenza salvata e salvala a ogni cambio ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("len-ia-theme");
      if (saved) setDark(saved === "dark");
      else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setDark(true);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("len-ia-theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);
 
  // ── SESSIONE LIVE ──
  const genLiveCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
 
  const createLiveSession = async (title) => {
    if (!canWrite) { alert("Il tuo ruolo è sola lettura: non puoi creare una stanza."); return; }
    const code = genLiveCode();
    const { data, error } = await supabase
      .from("shared_sessions")
      .insert({ code, title: title || "Sessione senza titolo", created_by: userName })
      .select()
      .single();
    if (error) { alert("Errore creazione stanza: " + error.message); return; }
    setActiveLive(data);
  };
 
  const joinLiveSession = async (codeInput) => {
    const code = (codeInput || "").trim().toUpperCase();
    if (!code) return;
    const { data, error } = await supabase.from("shared_sessions").select("*").eq("code", code).single();
    if (error || !data) { alert("Nessuna stanza trovata con questo codice."); return; }
    setActiveLive(data);
  };
 
  const leaveLiveSession = () => { setActiveLive(null); setLiveMessages([]); setLiveOnline([]); };
 
  // Chi scrive è anche l'unico a chiamare l'AI: gli altri vedono tutto arrivare via realtime,
  // così l'AI non risponde mai due volte allo stesso messaggio.
  const sendLiveMessage = async () => {
    if (!liveInput.trim() || !activeLive || liveLoading) return;
    const text = liveInput.trim();
    setLiveInput("");
    setLiveLoading(true);
    try {
      await supabase.from("shared_messages").insert({ session_id: activeLive.id, sender_name: userName, role: "user", content: text });
      const trimmedHistory = liveMessages.slice(-20).map(m => ({
        role: m.role,
        content: m.role === "user" ? `${m.sender_name}: ${m.content}` : m.content,
      }));
      // l'API richiede che la history inizi con un messaggio "user" e alterni i ruoli
      const msgs = [...trimmedHistory, { role: "user", content: `${userName}: ${text}` }];
      const merged = [];
      for (const m of msgs) {
        const last = merged[merged.length - 1];
        if (last && last.role === m.role) last.content += "\n" + m.content;
        else merged.push({ ...m });
      }
      while (merged.length && merged[0].role !== "user") merged.shift();
      const data = await callAI({ mode:"live", messages:merged });
      const reply = (data?.content || []).filter(b => b.type === "text").map(b => b.text).join("\n") || `⚠️ Errore API: ${data?.error?.message || JSON.stringify(data)}`;
      await supabase.from("shared_messages").insert({ session_id: activeLive.id, sender_name: "LEN-IA", role: "assistant", content: reply });
    } catch (e) {
      console.error(e);
    }
    setLiveLoading(false);
  };
 
  // Sottoscrizione realtime + presence
  useEffect(() => {
    if (!activeLive) return;
    let cancelled = false;
 
    supabase.from("shared_messages").select("*").eq("session_id", activeLive.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (!cancelled) setLiveMessages(prev => {
        const ids = new Set((data || []).map(m => m.id));
        return [...(data || []), ...prev.filter(m => !ids.has(m.id))];
      }); });
 
    const channel = supabase
      .channel(`live-session-${activeLive.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "shared_messages", filter: `session_id=eq.${activeLive.id}` },
        (payload) => setLiveMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]))
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setLiveOnline([...new Set(Object.values(state).flat().map(p => p.user_name))]);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ user_name: userName, online_at: new Date().toISOString() });
      });
 
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [activeLive?.id]);
 
  // scroll automatico in fondo alla chat live
  const liveBottomRef = useRef(null);
  useEffect(() => { liveBottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [liveMessages, liveLoading]);
 
  const hov = {
    onMouseEnter: () => {
      isHoveringRef.current = true;
      if (cursorRingRef.current) {
        cursorRingRef.current.style.width  = "48px";
        cursorRingRef.current.style.height = "48px";
        cursorRingRef.current.style.background = "transparent";
        cursorRingRef.current.style.border = `2px solid ${currentModeRef.current}`;
      }
    },
    onMouseLeave: () => {
      isHoveringRef.current = false;
      if (cursorRingRef.current) {
        cursorRingRef.current.style.width  = "18px";
        cursorRingRef.current.style.height = "18px";
        cursorRingRef.current.style.background = currentModeRef.current;
        cursorRingRef.current.style.border = "none";
      }
    },
  };
 
  const hasBrief = brief.tones.length > 0 || brief.keywords.trim() || brief.examples.trim();
 
  const getModePrompt = () => {
    if (mode==="caption")    return `Scrivi una caption per ${platform} sul seguente argomento/contenuto: `;
    if (mode==="hashtag")    return `Suggerisci hashtag ottimizzati per ${platform} per il seguente contenuto: `;
    if (mode==="reels")      return `Crea una guida completa per produrre questo video: `;
    if (mode==="brainstorm") return "";
    return "";
  };
 
const handleFileSelect = async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;
 
  const room = MAX_FILES_PER_MESSAGE - attachments.length;
  if (room <= 0) { alert(`Massimo ${MAX_FILES_PER_MESSAGE} allegati per messaggio.`); return; }
  if (files.length > room) alert(`Massimo ${MAX_FILES_PER_MESSAGE} allegati: aggiungo solo i primi ${room}.`);
  const batch = files.slice(0, room);
 
  setUploading(true);
  const results = await Promise.allSettled(batch.map(uploadAttachment));
  const ok = results.filter(r => r.status === "fulfilled").map(r => r.value);
  const failed = results
    .map((r, i) => r.status === "rejected" ? `${batch[i].name}: ${r.reason?.message || "errore"}` : null)
    .filter(Boolean);
  if (ok.length) setAttachments(prev => [...prev, ...ok]);
  if (failed.length) alert("Alcuni file non sono stati caricati:\n" + failed.join("\n"));
  setUploading(false);
};
 
const removeAttachment = (idx) => {
  const att = attachments[idx];
  setAttachments(p => p.filter((_, j) => j !== idx));
  if (att?.path) deleteAttachment(att.path).catch(() => {});
};
 
  const sendMessage = async (retryHistory = null) => {
    const isRetry = retryHistory !== null;
    if (!isRetry && (!input.trim() && !attachments.length) || loading || uploading) return;
    const textPrompt = isRetry ? "" : getModePrompt() + (input.trim() || (attachments.length ? `Analizza questi file: ${attachments.map(a=>a.name).join(", ")}` : ""));
 
    let userApiContent;
    let userMsg;
 
    if (!isRetry) {
      if (attachments.length > 0) {
        const fileBlocks = attachments.map(toBlock);
        userApiContent = [...fileBlocks, { type:"text", text:textPrompt }];
      } else {
        userApiContent = textPrompt;
      }
      const displayText = input.trim() || attachments.map(a=>`[${a.name}]`).join(" ");
      userMsg = { role:"user", content:userApiContent, display:displayText, mode, platform, attachmentPreviews:attachments.map(a=>a.preview).filter(Boolean), attachmentNames:attachments.filter(a=>!a.preview).map(a=>a.name) };
    }
 
    const trimmedHistory = isRetry
      ? retryHistory
      : [...history, { role:"user", content:userApiContent }].slice(-10);
 
    if (!isRetry) {
      setMessages(p => [...p, userMsg]);
      setHistory(trimmedHistory);
      setInput("");
      setAttachments([]);
    }
    setLoading(true);
    try {
      const data = await callAI({ mode, brief:{ tones:brief.tones, keywords:brief.keywords, examples:brief.examples }, messages:trimmedHistory });
      if (data.error) throw new Error(data.error.message || "API error");
      const text = data.content?.map(b => b.text||"").join("") || "Errore.";
      const newAssistantMsg = { role:"assistant", content:text, mode, platform };
      const finalHistory = [...trimmedHistory, { role:"assistant", content:text }];
      setMessages(p => {
        const base = isRetry ? p.slice(0,-1) : p;
        return [...base, newAssistantMsg];
      });
      setHistory(finalHistory);
      if (mode === "brainstorm") {
        const finalMessages = isRetry
          ? [...messages.slice(0,-1), newAssistantMsg]
          : [...messages, userMsg, newAssistantMsg];
        saveBrainstormSession(finalMessages, finalHistory);
      }
    } catch (err) {
      console.error("API error:", err);
      if (!isRetry) {
        setMessages(p => [...p, { role:"assistant", content:"⚠️ Errore di connessione. Riprova tra qualche secondo!", isError:true, retryHistory:trimmedHistory }]);
      }
    }
    finally { setLoading(false); }
  };
 
  const analyzeCaption = async (msgIndex, text) => {
    setAnalyzing(msgIndex);
    try {
      const data = await callAI({ mode:"caption_analysis", messages:[{ role:"user", content:`Analizza questa caption:\n\n${text}` }] });
      const raw = data.content?.map(b => b.text||"").join("") || "{}";
      setAnalyses(prev => ({ ...prev, [msgIndex]: JSON.parse(raw.replace(/```json|```/g,"").trim()) }));
    } catch { setAnalyses(prev => ({ ...prev, [msgIndex]:{ error:true } })); }
    finally { setAnalyzing(null); }
  };
 
  const saveToHistory = async (msg, msgIndex) => {
    // Dedup basato sul contenuto, non sull'indice
    if (savedItems.find(i => i.content === msg.content)) return;
    const record = { user_name:userName, content:msg.content, mode:msg.mode, platform:msg.platform };
    const saved = await dbPost("saved_items", record);
    if (saved?.id) {
      setSavedItems(prev => [{ id:saved.id, content:msg.content, mode:msg.mode, platform:msg.platform, savedAt:new Date().toLocaleString("it-IT") }, ...prev]);
    }
  };
 
  const removeSaved = async (id) => {
    await dbDelete("saved_items", id);
    setSavedItems(p => p.filter(x => x.id !== id));
  };
 
  const saveBrief = async () => {
    const record = { user_name:userName, tones:brief.tones, keywords:brief.keywords, examples:brief.examples, updated_at:new Date().toISOString() };
    if (briefId) {
      await dbPut("briefs", briefId, record);
    } else {
      const saved = await dbPost("briefs", record);
      if (saved?.id) setBriefId(saved.id);
    }
    setBriefSaved(true);
    setShowBrief(false);
    setTimeout(() => setBriefSaved(false), 2000);
  };
 
  const handleKey = (e) => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const clearChat = () => { setMessages([]); setHistory([]); setAnalyses({}); };
 
 
 
  // ── HELPERS ──
  const ScoreBar = ({ score }) => (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ flex:1, height:6, background:"var(--track)", borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", borderRadius:3, width:`${score*10}%`, background:score>=8?"#2BB5AE":score>=5?"#F07D2A":"#E8354A", transition:"width 1s cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
      <span style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:900, color:score>=8?"#2BB5AE":score>=5?"#F07D2A":"#E8354A", minWidth:28 }}>{score}</span>
      <span style={{ fontSize:11, color:"#bbb" }}>/10</span>
    </div>
  );
 
  // ── LOGIN SCREEN ──
  if (!userReady) {
    return (
      <div data-theme={dark?"dark":"light"} style={{ ...S.root, alignItems:"center", justifyContent:"center" }}>
        <style>{css}</style>
        {!isMobile && <>
          <div ref={cursorRingRef} style={{ position:"fixed", left:-100, top:-100, width:18, height:18, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:99999, transition:"width 0.2s,height 0.2s,background 0.2s,border 0.2s", mixBlendMode:"multiply" }} />
          <div ref={cursorDotRef} style={{ position:"fixed", left:-100, top:-100, width:4, height:4, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:100000 }} />
          {[0,1,2,3,4,5,6].map(i => <div key={i} ref={el=>cursorTrailRefs.current[i]=el} style={{ position:"fixed", left:-100, top:-100, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:99998, width:8, height:8, opacity:0 }} />)}
        </>}
        <div style={S.bgNoise} /><div style={S.bgA1} /><div style={S.bgA2} />
        <div style={{ position:"relative", zIndex:5, display:"flex", flexDirection:"column", alignItems:"center", gap:20, padding:40, maxWidth:420, width:"100%" }}>
          <div style={S.logoIconWrap}><span style={{ fontSize:22, color:"#fff" }}>✦</span></div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:30, fontWeight:900, background:"linear-gradient(135deg,#E8354A 0%,#7B4FA0 60%,#2BB5AE 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", letterSpacing:"-0.02em" }}>LEN-IA</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, fontStyle:"italic", color:"#aaa", marginTop:-10 }}>by Collettivo LEN</div>
          <div style={{ width:"100%", height:1, background:"linear-gradient(90deg,transparent,#E8354A44,transparent)" }} />
 
          {!session?.user ? (
            authStage === "sent" ? (
              <>
                <div style={{ fontSize:36 }}>📬</div>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#888", textAlign:"center" }}>
                  Ti abbiamo mandato un link di accesso a <b>{authEmail}</b>. Aprilo da questo dispositivo per entrare.
                </div>
                <button className="clear-btn" style={S.clearBtn} onClick={()=>setAuthStage("idle")}>← usa un'altra email</button>
              </>
            ) : (
              <>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#888", textAlign:"center" }}>Accedi con la tua email per entrare nel tool del collettivo.</div>
                <input type="email" style={{ ...S.briefInput, textAlign:"center", fontSize:15 }} placeholder="la-tua-email@esempio.it" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") sendMagicLink(); }} autoFocus />
                <button className="brief-save-btn" onClick={sendMagicLink} disabled={!authEmail.trim()||authLoading} style={{ ...S.saveBtn, width:"100%", padding:"12px", fontSize:14, opacity:!authEmail.trim()||authLoading?0.5:1 }} {...hov}>
                  {authLoading ? "invio…" : "invia link di accesso →"}
                </button>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#bbb", textAlign:"center" }}>Accesso solo su invito: se la tua email non è tra i membri del collettivo, chiedi a un admin di invitarti.</div>
              </>
            )
          ) : profile && !profile.display_name ? (
            <>
              <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#888", textAlign:"center" }}>Ultimo passo: come vuoi essere chiamato nel tool?</div>
              <input style={{ ...S.briefInput, textAlign:"center", fontSize:15 }} placeholder="es. Marta, Lorenzo, Sara…" value={nameDraft} onChange={e=>setNameDraft(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") confirmDisplayName(); }} autoFocus />
              <button className="brief-save-btn" onClick={confirmDisplayName} disabled={!nameDraft.trim()||loadingUser} style={{ ...S.saveBtn, width:"100%", padding:"12px", fontSize:14, opacity:!nameDraft.trim()||loadingUser?0.5:1 }} {...hov}>
                {loadingUser ? "caricamento…" : "entra →"}
              </button>
            </>
          ) : (
            <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#888" }}>caricamento del tuo profilo…</div>
          )}
        </div>
      </div>
    );
  }
 
 
  // ── CALENDAR PANEL ──
  const LiveSessionPanel = () => {
    if (!activeLive) {
      return (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px", gap:20, position:"relative", zIndex:5 }}>
          <div style={{ fontSize:42 }}>📡</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:900 }}>Sessione Live</div>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, fontStyle:"italic", color:"#aaa", textAlign:"center", maxWidth:360 }}>
            Crea una stanza condivisa o unisciti con un codice: tutto il team vede la stessa conversazione con LEN-IA in tempo reale.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:10, width:"100%", maxWidth:320 }}>
            <button className="brief-save-btn" style={{ ...S.saveBtn, background:"linear-gradient(135deg,#0EA5E9,#2BB5AE)", textAlign:"center", padding:"12px" }}
              onClick={() => createLiveSession(window.prompt("Titolo della sessione (opzionale):") || "")} {...hov}>
              + Crea nuova stanza
            </button>
            <div style={{ display:"flex", gap:8 }}>
              <input style={{ ...S.briefInput, padding:"10px 12px", flex:1, textTransform:"uppercase" }} placeholder="Codice stanza (es. AB12CD)"
                value={liveCode} onChange={e => setLiveCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") joinLiveSession(liveCode); }} />
              <button className="clear-btn" style={S.clearBtn} onClick={() => joinLiveSession(liveCode)} {...hov}>Entra →</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", position:"relative", zIndex:5, minHeight:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 28px", borderBottom:"1px solid var(--border)" }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:700 }}>{activeLive.title}</div>
            <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#aaa" }}>
              codice: <b>{activeLive.code}</b> · {liveOnline.length} onlin{liveOnline.length===1?"e":"i"}{liveOnline.length>0 ? ` (${liveOnline.join(", ")})` : ""}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button className="copy-btn" style={S.copyBtn} onClick={() => navigator.clipboard.writeText(activeLive.code)} {...hov}>⎘ copia codice</button>
            <button className="clear-btn" style={{ ...S.clearBtn, color:"#E8354A" }} onClick={leaveLiveSession} {...hov}>esci</button>
          </div>
        </div>
        <div style={{ ...S.chat, paddingBottom:24 }}>
          {liveMessages.length === 0 && <div style={{ textAlign:"center", color:"#aaa", fontFamily:"'Cormorant Garamond',serif", fontStyle:"italic", fontSize:15 }}>La stanza è vuota: scrivi il primo messaggio o condividi il codice <b>{activeLive.code}</b> col team.</div>}
          {liveMessages.map((m, i) => (
            <div key={m.id || i} style={{ ...S.msgWrapper, animation:"slideUp 0.35s cubic-bezier(0.22,1,0.36,1)" }}>
              {m.role === "user" ? (
                <div style={{ display:"flex", justifyContent: m.sender_name === userName ? "flex-end" : "flex-start" }}>
                  <div style={S.userBubble}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#0EA5E9", marginBottom:4 }}>{m.sender_name}</div>
                    <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.7, fontFamily:"'DM Sans',sans-serif" }}>{m.content}</p>
                  </div>
                </div>
              ) : (
                <div style={S.assistantRow}>
                  <div style={{ ...S.assistantAvatar, background:"linear-gradient(135deg,#0EA5E9,#0EA5E988)" }}>✦</div>
                  <div style={S.assistantContent}>
                    <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:12, fontStyle:"italic", color:"#bbb", letterSpacing:"0.05em" }}>LEN-IA</div>
                    <pre style={S.assistantText}>{m.content}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
          {liveLoading && <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"#aaa" }}>✦ LEN-IA sta scrivendo…</div>}
          <div ref={liveBottomRef} />
        </div>
        <div style={S.inputArea}>
          <div style={S.inputWrapper}>
            <textarea style={S.textarea} rows={1} placeholder="Scrivi al gruppo…" value={liveInput}
              onChange={e => setLiveInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendLiveMessage(); } }} />
            <button className="send-btn" style={{ ...S.sendBtn, background:"linear-gradient(135deg,#0EA5E9,#2BB5AE)", color:"#fff" }} disabled={liveLoading || !liveInput.trim() || !canWrite} title={!canWrite?"Il tuo ruolo è sola lettura":""} onClick={sendLiveMessage} {...hov}>→</button>
          </div>
        </div>
      </div>
    );
  };
 
 
 
  return (
    <div data-theme={dark?"dark":"light"} style={S.root}>
      <style>{css}</style>
      {!isMobile && <>
        <div ref={cursorRingRef} style={{ position:"fixed", left:-100, top:-100, width:18, height:18, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:99999, transition:"width 0.2s,height 0.2s,background 0.2s", mixBlendMode:"multiply" }} />
        <div ref={cursorDotRef} style={{ position:"fixed", left:-100, top:-100, width:4, height:4, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:100000 }} />
        {[0,1,2,3,4,5,6].map(i => <div key={i} ref={el=>cursorTrailRefs.current[i]=el} style={{ position:"fixed", left:-100, top:-100, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:99998, width:8, height:8, opacity:0 }} />)}
      </>}
      <div style={S.bgNoise} /><div style={S.bgA1} /><div style={S.bgA2} />
 
      {showHistory && (
        <div style={S.drawerOverlay} onClick={()=>setShowHistory(false)}>
          <div style={S.drawer} onClick={e=>e.stopPropagation()}>
            <div style={S.drawerHeader}>
              <span style={S.drawerTitle}>💾 Storico Salvati</span>
              <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={()=>setShowHistory(false)} {...hov}>✕ chiudi</button>
            </div>
            {savedItems.length===0 ? (
              <div style={S.drawerEmpty}><div style={{ fontSize:36, marginBottom:12 }}>📭</div><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#bbb" }}>Nessuna risposta salvata ancora.</p></div>
            ) : (
              <div style={S.drawerList}>
                {savedItems.map(item => {
                  const m = MODES.find(x=>x.id===item.mode);
                  return (
                    <div key={item.id} style={S.drawerItem}>
                      <div style={S.drawerItemMeta}><span style={{ ...S.modeTag, background:m?.color||"#999" }}>{m?.label}</span><span style={S.platformTag}>{item.platform}</span><span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#ccc", marginLeft:"auto" }}>{item.savedAt}</span></div>
                      <pre style={S.drawerItemText}>{item.content}</pre>
                      <div style={{ display:"flex", gap:10 }}>
                        <button className="copy-btn" style={S.copyBtn} onClick={()=>navigator.clipboard.writeText(item.content)} {...hov}>⎘ copia →</button>
                        <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A" }} onClick={()=>removeSaved(item.id)} {...hov}>✕ rimuovi</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
 
      {showTeam && (
        <div style={S.drawerOverlay} onClick={()=>setShowTeam(false)}>
          <div style={S.drawer} onClick={e=>e.stopPropagation()}>
            <div style={S.drawerHeader}>
              <span style={S.drawerTitle}>👥 Team del Collettivo</span>
              <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={()=>setShowTeam(false)} {...hov}>✕ chiudi</button>
            </div>
            {teamProfiles.length===0 ? (
              <div style={S.drawerEmpty}><div style={{ fontSize:36, marginBottom:12 }}>👤</div><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#bbb" }}>Nessun membro trovato.</p></div>
            ) : (
              <div style={S.drawerList}>
                {teamProfiles.map(p => (
                  <div key={p.id} style={S.drawerItem}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                      <div>
                        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:700 }}>{p.display_name || "(nome non impostato)"}</div>
                        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#aaa" }}>{p.id===profile?.id ? "tu" : p.id.slice(0,8)}</div>
                      </div>
                      <select value={p.role} onChange={e=>changeRole(p.id, e.target.value)} disabled={p.id===profile?.id} style={{ ...S.briefInput, padding:"6px 10px", fontSize:12, width:"auto" }}>
                        <option value="admin">admin</option>
                        <option value="editor">editor</option>
                        <option value="membro">membro</option>
                        <option value="ospite">ospite</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding:"14px 20px", fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#aaa" }}>
              Per invitare un nuovo membro: Supabase → Authentication → Users → Invite user, con la sua email.
            </div>
          </div>
        </div>
      )}
 
 
      {showBSessions && (
        <div style={S.drawerOverlay} onClick={()=>setShowBSessions(false)}>
          <div style={S.drawer} onClick={e=>e.stopPropagation()}>
            <div style={S.drawerHeader}>
              <span style={S.drawerTitle}>💡 Sessioni Brainstorm</span>
              <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={()=>setShowBSessions(false)} {...hov}>✕ chiudi</button>
            </div>
            <div style={{ padding:"12px 20px", borderBottom:"1px solid var(--border)" }}>
              <button className="brief-save-btn" onClick={newBrainstormSession} style={{ ...S.saveBtn, background:"linear-gradient(135deg,#E8354A,#7B4FA0)", width:"100%", textAlign:"center", padding:"10px" }} {...hov}>+ Nuova sessione</button>
            </div>
            {bSessions.length===0 ? (
              <div style={S.drawerEmpty}><div style={{ fontSize:36, marginBottom:12 }}>💭</div><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#bbb" }}>Nessuna sessione salvata ancora.</p><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#ccc", marginTop:6 }}>Le sessioni vengono salvate automaticamente durante il brainstorming.</p></div>
            ) : (
              <div style={S.drawerList}>
                {bSessions.map(s => (
                  <div key={s.id} style={{ ...S.drawerItem, border:`1px solid ${bSessionId===s.id?"rgba(232,53,74,0.3)":"var(--border)"}`, background:bSessionId===s.id?"rgba(232,53,74,0.03)":"#FAFAF8" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13, fontWeight:700, color:"var(--text)", flex:1, marginRight:8 }}>{s.title}</div>
                      <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A", flexShrink:0 }} onClick={()=>deleteBrainstormSession(s.id)} {...hov}>✕</button>
                    </div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#bbb" }}>{new Date(s.saved_at||s.created_at).toLocaleString("it-IT")}</div>
                    <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A", fontWeight:600 }} onClick={()=>loadBrainstormSession(s)} {...hov}>
                      {bSessionId===s.id ? "✓ sessione attiva" : "→ riprendi"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
 
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.logo}>
            <div style={S.logoIconWrap}><span style={{ fontSize:18, color:"#fff" }}>✦</span></div>
            <div><div style={S.logoMain}>LEN-IA</div><div style={S.logoSub}>by Collettivo LEN · {userName}</div></div>
          </div>
          <div className="hscroll" style={{ display:"flex", gap:8, alignItems:"center", overflowX:"auto", minWidth:0, maxWidth:"100%", marginLeft:"auto", padding:"2px 0" }}>
            {canAccessTab(role, "brainstorm") && (
            <button className="clear-btn" onClick={()=>setShowHistory(true)} style={{ ...S.clearBtn, borderColor:savedItems.length>0?"#7B4FA0":"var(--border2)", color:savedItems.length>0?"#7B4FA0":"#999", position:"relative" }} {...hov}>
              {savedItems.length>0 && <span style={{ position:"absolute", top:3, right:3, width:6, height:6, borderRadius:"50%", background:"#7B4FA0" }} />}
              💾 storico{savedItems.length>0?` (${savedItems.length})`:""}
            </button>
            )}
            {canAccessTab(role, "brainstorm") && (
            <button className="clear-btn" onClick={()=>setShowBSessions(true)} style={{ ...S.clearBtn, borderColor:bSessions.length>0?"#E8354A":"var(--border2)", color:bSessions.length>0?"#E8354A":"#999", position:"relative" }} {...hov}>
              {bSessions.length>0 && <span style={{ position:"absolute", top:3, right:3, width:6, height:6, borderRadius:"50%", background:"#E8354A" }} />}
              💡 sessioni{bSessions.length>0?` (${bSessions.length})`:""}
            </button>
            )}
            {canAccessTab(role, "caption") && (
            <button className="clear-btn" onClick={()=>setShowBrief(b=>!b)} style={{ ...S.clearBtn, borderColor:hasBrief?"#E8354A":"var(--border2)", color:hasBrief?"#E8354A":"#999", position:"relative" }} {...hov}>
              {hasBrief && <span style={{ position:"absolute", top:3, right:3, width:6, height:6, borderRadius:"50%", background:"#E8354A" }} />}
              🎨 brief
            </button>
            )}
            {canAccessTab(role, "calendar") && (
            <button className="clear-btn" onClick={()=>setMode(mode==="calendar"?"caption":"calendar")} style={{ ...S.clearBtn, borderColor:mode==="calendar"?"#7B4FA0":"var(--border2)", color:mode==="calendar"?"#7B4FA0":"#999" }} {...hov}>
              📅 calendario
            </button>
            )}
            <button className="clear-btn" onClick={()=>setDark(d=>!d)} title={dark?"Passa alla modalità chiara":"Passa alla modalità scura"} style={S.clearBtn} {...hov}>{dark?"☀️ chiaro":"🌙 scuro"}</button>
            {role==="admin" && <button className="clear-btn" onClick={openTeamPanel} style={S.clearBtn} {...hov}>👥 team</button>}
            <button className="clear-btn" onClick={logout} style={S.clearBtn} {...hov}>esci</button>
            {mode!=="analytics" && mode!=="calendar" && mode!=="live" && mode!=="bacheca" && mode!=="appuntamenti" && <button className="clear-btn" onClick={clearChat} style={S.clearBtn} {...hov}>↺ reset</button>}
          </div>
        </div>
      </header>
 
      {showBrief && (
        <div style={S.briefPanel}>
          <div style={S.briefInner}>
            <div><div style={S.briefTitle}>🎨 Brief di Stile</div><div style={S.briefSubtitle}>Insegna a LEN-IA come vuoi che scriva — salvato nel cloud ☁️</div></div>
            <div style={S.briefSection}>
              <label style={S.briefLabel}>Tono / registro</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {TONE_OPTIONS.map(t => <button key={t} className="tone-chip" onClick={()=>setBrief(b=>({...b,tones:b.tones.includes(t)?b.tones.filter(x=>x!==t):[...b.tones,t]}))} style={{ ...S.toneChip, ...(brief.tones.includes(t)?S.toneChipActive:{}) }} {...hov}>{t}</button>)}
              </div>
            </div>
            <div style={S.briefSection}><label style={S.briefLabel}>Parole chiave / mood</label><input style={S.briefInput} value={brief.keywords} onChange={e=>setBrief(b=>({...b,keywords:e.target.value}))} placeholder="es. underground, visuale, identita, notturno…" /></div>
            <div style={S.briefSection}><label style={S.briefLabel}>Esempi di caption che ti piacciono</label><textarea style={{ ...S.briefInput, minHeight:90, resize:"vertical" }} value={brief.examples} onChange={e=>setBrief(b=>({...b,examples:e.target.value}))} placeholder="es. 'notte. studio. domande senza risposta. ✶'" /></div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <button className="clear-btn" onClick={()=>setBrief({ tones:[], keywords:"", examples:"" })} style={{ ...S.clearBtn, fontSize:12 }} {...hov}>🗑 cancella tutto</button>
              <button className="brief-save-btn" onClick={saveBrief} style={S.saveBtn} {...hov}>{briefSaved?"✓ salvato nel cloud!":"salva brief ☁️ →"}</button>
            </div>
          </div>
        </div>
      )}
 
      <div className="hscroll" style={S.modeBar}>
        {MODES.filter(m=>m.id!=="calendar" && canAccessTab(role, m.id)).map(m => <button key={m.id} className="mode-btn" onClick={()=>setMode(m.id)} style={{ ...S.modeBtn, ...(mode===m.id?{ background:m.color, color:"#fff", borderBottom:`3px solid ${m.color}` }:{ color:"#bbb" }) }} {...hov}><span style={S.modeBtnLabel}>{m.label}</span><span style={S.modeBtnDesc}>{m.desc}</span></button>)}
      </div>
 
      {!canAccessTab(role, mode) ? null : mode==="analytics" ? <AnalyticsTab posts={posts} setPosts={setPosts} aiInsights={aiInsights} setAiInsights={setAiInsights} userName={userName} hov={hov} /> : mode==="calendar" ? <CalendarTab calEvents={calEvents} setCalEvents={setCalEvents} userName={userName} /> : mode==="live" ? LiveSessionPanel() : mode==="appuntamenti" ? <AppointmentsTab supabase={supabase} userId={session?.user?.id} role={role} hov={hov} /> : mode==="bacheca" ? <BoardTab supabase={supabase} userId={session?.user?.id} role={role} draft={boardDraft} onDraftConsumed={()=>setBoardDraft(null)} hov={hov} /> : (
        <>
          {mode !== "brainstorm" && (
            <div className="hscroll" style={S.platformBar}>
              <span style={{ fontSize:14, color:"#ccc", marginRight:2 }}>📱</span>
              {PLATFORMS.map(p => <button key={p} className="platform-btn" onClick={()=>setPlatform(p)} style={{ ...S.platformBtn, ...(platform===p?{ background:currentMode.color, color:"#fff", fontWeight:600, border:`2px solid ${currentMode.color}` }:{}) }} {...hov}>{p}</button>)}
              <div style={{ width:1, height:20, background:"rgba(0,0,0,0.08)", margin:"0 6px", flexShrink:0 }} />
              <div style={{ display:"flex", gap:6, overflowX:"auto", flex:1, paddingBottom:2 }}>
                {CONTEXTUAL_CHIPS[mode].map(chip => <button key={chip} className="quick-chip" onClick={()=>setInput(chip)} style={S.ctxChip} {...hov}>{chip} →</button>)}
              </div>
            </div>
          )}
          {mode === "brainstorm" && (
            <div className="hscroll" style={{ ...S.platformBar, background:"rgba(14,165,233,0.04)", borderBottom:"1px solid rgba(14,165,233,0.15)" }}>
              <span style={{ fontSize:11, color:"#0EA5E9", fontFamily:"'DM Sans',sans-serif", fontWeight:600, letterSpacing:"0.06em", marginRight:8 }}>SPUNTI →</span>
              <div style={{ display:"flex", gap:6, overflowX:"auto", flex:1, paddingBottom:2 }}>
                {CONTEXTUAL_CHIPS["brainstorm"].map(chip => <button key={chip} className="quick-chip" onClick={()=>setInput(chip)} style={{ ...S.ctxChip, borderColor:"rgba(14,165,233,0.3)", color:"#0EA5E9" }} {...hov}>{chip} →</button>)}
              </div>
            </div>
          )}
 
          <div style={S.chat}>
            {messages.length===0 && (
              <div style={S.emptyState}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:52, color:"#E8354A", animation:"floatSymbol 3s ease-in-out infinite", lineHeight:1 }}>✦</div>
                <p style={S.emptyTitle}>Ciao, {userName}!</p>
                <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontStyle:"italic", color:"#E8354A" }}>Sono LEN-IA, la tua AI per i social del Collettivo LEN.</p>
                <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:"#aaa", lineHeight:1.8 }}>Scegli una modalita, usa i prompt suggeriti,<br />o scrivi direttamente cosa ti serve.</p>
                <div style={{ width:40, height:2, background:"linear-gradient(90deg,#E8354A,#2BB5AE)", borderRadius:2, margin:"6px 0" }} />
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
                  {MODES.filter(m=>m.id!=="analytics" && canAccessTab(role, m.id)).map(m => <button key={m.id} className="quick-chip" onClick={()=>setMode(m.id)} style={{ ...S.chip, borderColor:`${m.color}55`, color:m.color, background:`${m.color}08` }} {...hov}>{m.label}</button>)}
                </div>
              </div>
            )}
            {messages.map((msg,i) => {
              const isUser = msg.role==="user";
              const analysis = analyses[i];
              const isSaved = savedItems.find(x=>x.id===i);
              const msgMode = MODES.find(m=>m.id===msg.mode);
              return (
                <div key={i} style={{ ...S.msgWrapper, animation:"slideUp 0.35s cubic-bezier(0.22,1,0.36,1)" }}>
                  {isUser ? (
                    <div style={{ display:"flex", justifyContent:"flex-end" }}>
                      <div style={S.userBubble}>
                        <div style={{ display:"flex", gap:6, marginBottom:8 }}><span style={{ ...S.modeTag, background:msgMode?.color||"#999" }}>{msgMode?.label}</span><span style={S.platformTag}>{msg.platform}</span></div>
                        {msg.attachmentPreviews?.length > 0 && (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                            {msg.attachmentPreviews.map((p,pi) => <img key={pi} src={p} alt="allegato" style={{ width:60, height:60, borderRadius:6, objectFit:"cover" }} />)}
                          </div>
                        )}
                        {msg.attachmentNames?.map((n,ni) => <div key={ni} style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#7B4FA0", marginBottom:4 }}>📎 {n}</div>)}
                        {/* legacy single attachment support */}
                        {msg.attachmentPreview && !msg.attachmentPreviews && <img src={msg.attachmentPreview} alt="allegato" style={{ maxWidth:"100%", borderRadius:8, marginBottom:8, maxHeight:160, objectFit:"cover" }} />}
                        {msg.attachmentName && !msg.attachmentPreviews && <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#7B4FA0", marginBottom:6 }}>📎 {msg.attachmentName}</div>}
                        <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.7, fontFamily:"'DM Sans',sans-serif" }}>{msg.display}</p>
                      </div>
                    </div>
                  ) : (
                    <div style={S.assistantRow}>
                      <div style={{ ...S.assistantAvatar, background:`linear-gradient(135deg,${msgMode?.color||"#E8354A"},${msgMode?.color||"#E8354A"}88)` }}>✦</div>
                      <div style={S.assistantContent}>
                        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:12, fontStyle:"italic", color:"#bbb", letterSpacing:"0.05em" }}>LEN-IA</div>
                        <pre style={{ ...S.assistantText, borderColor: msg.isError?"rgba(232,53,74,0.3)":"var(--border)" }}>{msg.content}</pre>
                        {msg.isError ? (
                          <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A", fontWeight:600 }} onClick={()=>sendMessage(msg.retryHistory)} {...hov}>↺ riprova →</button>
                        ) : (
                          <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                            <button className="copy-btn" style={S.copyBtn} onClick={()=>navigator.clipboard.writeText(msg.content)} {...hov}>⎘ copia →</button>
                            <button className="copy-btn" style={{ ...S.copyBtn, color:isSaved?"#7B4FA0":"#ccc" }} onClick={()=>saveToHistory(msg,i)} {...hov}>{isSaved?"✓ salvato":"💾 salva"}</button>
                            {(msg.mode==="caption"||msg.mode==="reels") && !analysis && <button className="copy-btn" style={{ ...S.copyBtn, color:"#2BB5AE" }} onClick={()=>analyzeCaption(i,msg.content)} disabled={analyzing===i} {...hov}>{analyzing===i?"⏳ analisi in corso…":"📊 analizza"}</button>}
                          </div>
                        )}
                        {msg.mode==="brainstorm" && (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                            <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#bbb", letterSpacing:"0.08em", textTransform:"uppercase", alignSelf:"center" }}>porta in →</span>
                            {[
                              { id:"caption", label:"✍️ Caption", color:"#E8354A" },
                              { id:"hashtag", label:"# Hashtag",  color:"#2BB5AE" },
                              { id:"reels",   label:"🎬 Video",    color:"#F07D2A" },
                              { id:"bacheca", label:"📋 Bacheca", color:"#F07D2A" },
                            ].filter(t => canAccessTab(role, t.id)).map(t => (
                              <button key={t.id} className="quick-chip" onClick={()=>{ if (t.id==="bacheca") { setBoardDraft({ title:"", description: msg.content.slice(0,3500) }); setMode("bacheca"); } else { setMode(t.id); setInput(msg.content.slice(0,200)); } }}
                                style={{ padding:"4px 12px", fontSize:10, fontWeight:600, border:`1.5px solid ${t.color}44`, background:`${t.color}08`, color:t.color, borderRadius:20, fontFamily:"'DM Sans',sans-serif" }} {...hov}>
                                {t.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {analysis && !analysis.error && (
                          <div style={S.analysisCard}>
                            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:700, marginBottom:4 }}>📊 Analisi LEN-IA</div>
                            <ScoreBar score={analysis.voto} />
                            <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, fontStyle:"italic", color:"#666", lineHeight:1.6 }}>"{analysis.giudizio}"</p>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                              <div><div style={S.analysisSubLabel}>✅ Punti forza</div>{analysis.punti_forza?.map((p,j)=><div key={j} style={S.analysisBullet}>· {p}</div>)}</div>
                              <div><div style={S.analysisSubLabel}>⚠️ Miglioramenti</div>{analysis.punti_deboli?.map((p,j)=><div key={j} style={S.analysisBullet}>· {p}</div>)}</div>
                            </div>
                            <div style={{ height:1, background:"rgba(0,0,0,0.06)" }} />
                            <div style={S.analysisSubLabel}>✨ Caption ottimizzata</div>
                            <pre style={S.analysisOptimized}>{analysis.caption_ottimizzata}</pre>
                            <button className="copy-btn" style={{ ...S.copyBtn, color:"#2BB5AE" }} onClick={()=>navigator.clipboard.writeText(analysis.caption_ottimizzata)} {...hov}>⎘ copia ottimizzata →</button>
                          </div>
                        )}
                        {analysis?.error && <div style={{ ...S.analysisCard, borderColor:"rgba(232,53,74,0.2)" }}><p style={{ fontSize:12, color:"#E8354A" }}>⚠️ Errore nell'analisi. Riprova.</p></div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {loading && (
              <div style={S.assistantRow}>
                <div style={{ ...S.assistantAvatar, background:`linear-gradient(135deg,${currentMode.color},${currentMode.color}88)` }}>✦</div>
                <div style={{ ...S.assistantText, display:"flex", gap:8, alignItems:"center", padding:"18px 22px" }}>
                  {[0,0.18,0.36].map((d,i)=><span key={i} style={{ width:8, height:8, borderRadius:"50%", background:currentMode.color, display:"inline-block", animation:"bounce 1.2s infinite ease-in-out", animationDelay:`${d}s`, opacity:0.7 }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
 
          <div style={{ ...S.inputArea, background:`${currentMode.color}10`, borderTop:`2px solid ${currentMode.color}33` }}>
            {attachments.length > 0 && (
              <div style={{ maxWidth:860, margin:"0 auto 10px", display:"flex", gap:8, flexWrap:"wrap" }}>
                {attachments.map((att, ai) => (
                  <div key={ai} style={{ display:"flex", alignItems:"center", gap:6, background:"var(--surface)", border:`1px solid ${currentMode.color}44`, borderRadius:10, padding:"6px 10px" }}>
                    {att.preview
                      ? <img src={att.preview} alt="preview" style={{ width:32, height:32, borderRadius:4, objectFit:"cover" }} />
                      : <span style={{ fontSize:16 }}>📎</span>}
                    <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"var(--text2)", maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{att.name}</span>
                    <button onClick={()=>removeAttachment(ai)} style={{ background:"transparent", border:"none", color:"#ccc", fontSize:14, cursor:"pointer", padding:0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={S.inputWrapper}>
              <>
  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple style={{ display:"none" }} onChange={handleFileSelect} />
  <button className="clear-btn" disabled={uploading || attachments.length >= MAX_FILES_PER_MESSAGE} onClick={()=>fileInputRef.current?.click()} style={{ ...S.clearBtn, width:52, height:52, borderRadius:14, fontSize:20, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", padding:0, border:`1.5px solid ${currentMode.color}55`, color:currentMode.color, opacity:uploading?0.6:1 }} {...hov} title="Allega immagini o PDF">{uploading ? "…" : "+"}</button>
</>
              <textarea style={{ ...S.textarea, border:`1.5px solid ${currentMode.color}55`, boxShadow:`0 2px 12px ${currentMode.color}15` }} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                placeholder={
                  mode==="caption"    ? "es. foto del backstage dell'ultima performance, mood underground..." :
                  mode==="hashtag"    ? "es. mostra collettiva di arte digitale e musica sperimentale" :
                  mode==="reels"      ? "es. teaser del nuovo singolo, atmosfera notturna e misteriosa — dimmi di che video si tratta!" :
                  mode==="brainstorm" ? "es. voglio rinnovare l'identita visiva del collettivo, da dove partiamo?" :
                                        "Scrivi qui..."
                }
                rows={3} />
              <button className="send-btn" onClick={()=>sendMessage()} disabled={(!input.trim()&&!attachments.length)||loading||uploading||!canWrite} title={!canWrite?"Il tuo ruolo è sola lettura":""} style={{ ...S.sendBtn, background:(!input.trim()&&!attachments.length)||loading||!canWrite?"#e8e4df":currentMode.color, color:(!input.trim()&&!attachments.length)||loading?"#bbb":"#fff" }} {...hov}>↑</button>
            </div>
            <p style={{ maxWidth:860, margin:"8px auto 0", fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#ccc", letterSpacing:"0.08em" }}>enter per inviare · shift+enter per andare a capo</p>
          </div>
        </>
      )}
    </div>
  );
}
 
const css = `
  [data-theme="light"] { --bg:#FAFAF8; --surface:#fff; --surface2:#FAFAF8; --text:#1a1a1a; --text2:#333; --border:rgba(0,0,0,0.07); --border2:rgba(0,0,0,0.12); --track:#f0ede8; --glass:rgba(250,250,248,0.92); --glass2:rgba(255,255,255,0.85); color-scheme: light; }
  [data-theme="dark"]  { --bg:#111114; --surface:#1d1d22; --surface2:#17171b; --text:#f2efea; --text2:#e2dfd9; --border:rgba(255,255,255,0.10); --border2:rgba(255,255,255,0.18); --track:#2a2a30; --glass:rgba(17,17,20,0.92); --glass2:rgba(24,24,28,0.85); color-scheme: dark; }
  [data-theme="dark"] ::placeholder { color:#777; }
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @media (pointer: fine) { * { cursor: none !important; } }
  .hscroll { overflow-x: auto; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; touch-action: pan-x pan-y; scrollbar-width: none; }
  .hscroll::-webkit-scrollbar { display: none; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: #f5f0eb; }
  ::-webkit-scrollbar-thumb { background: #E8354A; border-radius: 3px; }
  @keyframes floatSymbol { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-8px) rotate(2deg)} }
  @keyframes gradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideInRight { from{opacity:0;transform:translateX(60px)} to{opacity:1;transform:translateX(0)} }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0) scale(1)} 40%{transform:translateY(-7px) scale(1.15)} }
  .mode-btn { transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1) !important; }
  .mode-btn:hover { transform: translateY(-3px) !important; box-shadow: 0 8px 24px rgba(0,0,0,0.1) !important; }
  .platform-btn { transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1) !important; }
  .platform-btn:hover { transform: scale(1.06) !important; }
  .send-btn { transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1) !important; }
  .send-btn:hover:not(:disabled) { transform: scale(1.08) rotate(15deg) !important; box-shadow: 0 8px 30px rgba(232,53,74,0.35) !important; }
  .copy-btn { transition: all 0.2s ease !important; }
  .copy-btn:hover { transform: translateX(4px) !important; }
  .clear-btn { transition: all 0.2s ease !important; }
  .clear-btn:hover { background: rgba(232,53,74,0.06) !important; border-color: #E8354A !important; color: #E8354A !important; }
  .brief-save-btn { transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1) !important; }
  .brief-save-btn:hover { transform: translateY(-2px) scale(1.03) !important; }
  .tone-chip { transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1) !important; }
  .tone-chip:hover { transform: scale(1.07) !important; }
  .quick-chip { transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1) !important; }
  .quick-chip:hover { transform: translateY(-3px) scale(1.04) !important; }
  .cal-day:hover { transform: scale(1.02) !important; box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; }
  textarea:focus, input:focus, select:focus { outline: none !important; border-color: #E8354A !important; box-shadow: 0 0 0 3px rgba(232,53,74,0.1) !important; }
`;
