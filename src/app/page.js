"use client";
// LEN-IA v1.1 — fix cursor
import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { toBlock } from "../lib/attachments";
import { callAI, dbGet, dbPost, dbPut, dbDelete } from "../lib/api";
import { S } from "../lib/styles";
import { normalizeRole, canAccessTab, canWrite as roleCanWrite } from "../lib/roles";
import BoardTab from "../components/BoardTab";
import AppointmentsTab from "../components/AppointmentsTab";
import AnalyticsTab from "../components/AnalyticsTab";
import CalendarTab from "../components/CalendarTab";
import LiveTab from "../components/LiveTab";
import TeamPanel from "../components/TeamPanel";
import SavedPanel from "../components/SavedPanel";
import BriefPanel from "../components/BriefPanel";
import SessionsPanel from "../components/SessionsPanel";
import ChatMessages from "../components/ChatMessages";
import ChatInput from "../components/ChatInput";
 
// I prompt dell'AI stanno sul server: src/lib/prompts.js (usati da /api/chat).
 
// Gradiente con i 3 colori LEN. Le tab con "gradient" hanno anche un "color" a tinta unita di riserva
// (usato dove serve un colore solo, es. il cursore). "animated" = gradiente in movimento (vedi .tab-turbulence).
const LEN_GRADIENT = "linear-gradient(135deg,#E8354A,#2BB5AE,#7B4FA0)";
const MODES = [
  { id: "brainstorm", label: "💡 Brainstorm",  desc: "Consulente creativo libero da schemi",    color: "#E8354A" },
  { id: "caption",    label: "✍️ Caption",    desc: "Scrivi una caption per il tuo post",       color: "#2BB5AE" },
  { id: "hashtag",    label: "# Hashtag",     desc: "Trova gli hashtag perfetti",               color: "#7B4FA0" },
  { id: "reels",      label: "🎬 Video",       desc: "Assistente per la produzione video",       color: "#E8354A" },
  { id: "analytics",  label: "📈 Analytics",   desc: "Traccia e analizza i tuoi post",           color: "#2BB5AE" },
  { id: "bacheca",    label: "📋 Bacheca",    desc: "Idee, proposte e progetti del collettivo", color: "#7B4FA0" },
  { id: "appuntamenti", label: "🗓️ Appuntamenti", desc: "Riunioni, incontri ed eventi del collettivo", color: "#2BB5AE", gradient: LEN_GRADIENT },
  { id: "live",       label: "📡 Live",        desc: "Sessione condivisa in tempo reale col team", color: "#E8354A", gradient: LEN_GRADIENT, animated: true },
];
const PLATFORMS   = ["Instagram", "Facebook", "Entrambi"];
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
  const role = normalizeRole(profile?.role);
  const canWrite = roleCanWrite(role);
  const [loadingUser, setLoadingUser] = useState(false);
 
  // Dark mode
  const [dark, setDark] = useState(false);
 
 
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
  const [isMobile, setIsMobile]   = useState(false);
  const isHoveringRef  = useRef(false);
  const cursorDotRef   = useRef(null);
  const cursorRingRef  = useRef(null);
  const cursorTrailRefs = useRef([]);
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
 
  const openTeamPanel = () => setShowTeam(true);
 
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
 
  const clearChat = () => { setMessages([]); setHistory([]); setAnalyses({}); };
 
 
 
 
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
 
 
 
 
 
  return (
    <div data-theme={dark?"dark":"light"} style={S.root}>
      <style>{css}</style>
      {!isMobile && <>
        <div ref={cursorRingRef} style={{ position:"fixed", left:-100, top:-100, width:18, height:18, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:99999, transition:"width 0.2s,height 0.2s,background 0.2s", mixBlendMode:"multiply" }} />
        <div ref={cursorDotRef} style={{ position:"fixed", left:-100, top:-100, width:4, height:4, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:100000 }} />
        {[0,1,2,3,4,5,6].map(i => <div key={i} ref={el=>cursorTrailRefs.current[i]=el} style={{ position:"fixed", left:-100, top:-100, borderRadius:"50%", background:"#E8354A", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:99998, width:8, height:8, opacity:0 }} />)}
      </>}
      <div style={S.bgNoise} /><div style={S.bgA1} /><div style={S.bgA2} />
 
      {showHistory && <SavedPanel items={savedItems} modes={MODES} onRemove={removeSaved} onClose={()=>setShowHistory(false)} hov={hov} />}
 
      {showTeam && <TeamPanel onClose={()=>setShowTeam(false)} currentUserId={profile?.id} hov={hov} />}
 
 
      {showBSessions && <SessionsPanel sessions={bSessions} activeId={bSessionId} onNew={newBrainstormSession} onLoad={loadBrainstormSession} onDelete={deleteBrainstormSession} onClose={()=>setShowBSessions(false)} hov={hov} />}
 
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
 
      {showBrief && <BriefPanel brief={brief} setBrief={setBrief} briefSaved={briefSaved} onSave={saveBrief} hov={hov} />}
 
      <div className="hscroll" style={S.modeBar}>
        {MODES.filter(m=>m.id!=="calendar" && canAccessTab(role, m.id)).map(m => <button key={m.id} className={`mode-btn${mode===m.id && m.animated ? " tab-turbulence" : ""}`} onClick={()=>setMode(m.id)} style={{ ...S.modeBtn, ...(mode===m.id ? (m.animated ? { background:undefined, color:"#fff", borderBottom:"3px solid transparent" } : m.gradient ? { background:m.gradient, backgroundOrigin:"border-box", color:"#fff", borderBottom:"3px solid transparent" } : { background:m.color, color:"#fff", borderBottom:`3px solid ${m.color}` }) : { color:"#bbb" }) }} {...hov}><span style={S.modeBtnLabel}>{m.label}</span><span style={S.modeBtnDesc}>{m.desc}</span></button>)}
      </div>
 
      {!canAccessTab(role, mode) ? null : mode==="analytics" ? <AnalyticsTab posts={posts} setPosts={setPosts} aiInsights={aiInsights} setAiInsights={setAiInsights} userName={userName} hov={hov} /> : mode==="calendar" ? <CalendarTab calEvents={calEvents} setCalEvents={setCalEvents} userName={userName} /> : mode==="live" ? null : mode==="appuntamenti" ? <AppointmentsTab supabase={supabase} userId={session?.user?.id} role={role} hov={hov} /> : mode==="bacheca" ? <BoardTab supabase={supabase} userId={session?.user?.id} role={role} draft={boardDraft} onDraftConsumed={()=>setBoardDraft(null)} hov={hov} /> : (
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
 
          <ChatMessages messages={messages} analyses={analyses} savedItems={savedItems} analyzing={analyzing} loading={loading}
            currentMode={currentMode} modes={MODES} userName={userName} role={role}
            onRetry={sendMessage} onSave={saveToHistory} onAnalyze={analyzeCaption}
            onSetMode={setMode} onSetInput={setInput} onBoardDraft={setBoardDraft} hov={hov} />
 
          <ChatInput mode={mode} currentMode={currentMode} input={input} setInput={setInput}
            attachments={attachments} setAttachments={setAttachments} uploading={uploading} setUploading={setUploading}
            loading={loading} canWrite={canWrite} onSend={sendMessage} hov={hov} />
        </>
      )}

      {/* Live resta sempre montato (nascosto fuori dalla sua tab): la stanza e il realtime non si interrompono cambiando tab */}
      {canAccessTab(role, "live") && <LiveTab visible={mode==="live"} userName={userName} canWrite={canWrite} hov={hov} />}
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
  @keyframes lenTurbulence {
    0%   { background-position: 10% 20%, 90% 10%, 40% 95%, 0% 0%; background-size: 160% 160%, 200% 200%, 180% 180%, 100% 100%; }
    25%  { background-position: 70% 60%, 20% 80%, 85% 15%, 0% 0%; background-size: 210% 210%, 170% 170%, 220% 220%, 100% 100%; }
    50%  { background-position: 95% 90%, 55% 30%, 10% 60%, 0% 0%; background-size: 180% 180%, 230% 230%, 160% 160%, 100% 100%; }
    75%  { background-position: 30% 85%, 100% 70%, 60% 5%,  0% 0%; background-size: 220% 220%, 160% 160%, 200% 200%, 100% 100%; }
    100% { background-position: 10% 20%, 90% 10%, 40% 95%, 0% 0%; background-size: 160% 160%, 200% 200%, 180% 180%, 100% 100%; }
  }
  .tab-turbulence {
    background-image:
      radial-gradient(circle at 50% 50%, #E8354A 0%, rgba(232,53,74,0) 52%),
      radial-gradient(circle at 50% 50%, #2BB5AE 0%, rgba(43,181,174,0) 62%),
      radial-gradient(circle at 50% 50%, #7B4FA0 0%, rgba(123,79,160,0) 74%),
      linear-gradient(135deg, #E8354A, #2BB5AE, #7B4FA0);
    background-color: transparent;
    background-repeat: no-repeat;
    background-origin: border-box;
    background-size: 160% 160%, 200% 200%, 180% 180%, 100% 100%;
    background-position: 10% 20%, 90% 10%, 40% 95%, 0% 0%;
    animation: lenTurbulence 11s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) { .tab-turbulence { animation: none; } }
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
