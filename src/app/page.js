"use client";
// LEN-IA v1.1 — fix cursor
import { useState, useRef, useEffect } from "react";

// ─── SYSTEM PROMPTS ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sei LEN-IA, la Social Media Manager AI del Collettivo LEN — un collettivo di artisti giovani, pop, freschi ed esplosivi. Il tuo tono è energico, diretto, creativo e mai noioso. Parli come una persona vera, non come un robot corporate.

Puoi fare queste cose:
1. Scrivere caption per Instagram e Facebook.
2. Suggerire hashtag: un mix strategico di hashtag di nicchia, community e trending.
3. Pianificare contenuti / calendario editoriale: piani editoriali con idee fresche.
4. Reels & Stories: script, hook, overlay text e sticker copy per il formato verticale.

Tono: pop, giovane, autentico, un po' ironico quando serve. Mescola italiano e inglese. Zero corporate-speak.
Rispondi sempre in italiano (con qualche parola inglese se ci sta bene).`;

const ANALYSIS_SYSTEM = `Sei un esperto di copywriting e social media marketing. Analizza la caption che ti viene fornita e rispondi SOLO con un JSON valido, senza markdown, senza backtick, senza testo aggiuntivo. Il JSON deve avere esattamente questa struttura:
{"voto":<numero 1-10>,"giudizio":"<frase sintetica>","punti_forza":["<p1>","<p2>"],"punti_deboli":["<p1>","<p2>"],"caption_ottimizzata":"<caption riscritta>"}`;

const BRAINSTORM_SYSTEM = `Sei LEN-IA in modalita Brainstorming — il consulente creativo del Collettivo LEN. Qui sei libero da schemi fissi: non devi produrre caption, hashtag o script, ma ragionare insieme al team su idee, direzioni creative, concept, identita, temi, campagne, collaborazioni, strategie.

Il tuo ruolo e' quello di un art director e consulente di comunicazione che conosce benissimo il collettivo. Fai domande, proponi angolazioni inaspettate, sfida le idee, suggerisci connessioni tra concetti. Sii provocatorio quando serve, poetico quando e' giusto, pratico quando necessario.

Alla fine di ogni risposta, se ha senso, proponi 1-3 "prossimi passi concreti" che l'utente puo' portare nelle altre tab (Caption, Hashtag, Calendario, Reels) — preceduti dalla dicitura "→ PORTA NELLE ALTRE TAB:".

Tono: da collega creativo, non da assistente. Parla come un membro del team.`;


const REELS_SYSTEM = `Sei LEN-IA in modalita Video — il tuo assistente per la produzione video del Collettivo LEN. Non sei solo uno script writer: sei un direttore creativo video che guida il team dalla pre-produzione alla post-produzione.

Per ogni richiesta fornisci:
- CONCEPT: idea visiva e narrativa del video
- STORYBOARD: sequenza delle scene con descrizione visiva dettagliata
- RIPRESE: consigli tecnici pratici (angolazioni, movimenti camera, luce, location)
- HOOK: il primo secondo che cattura l'attenzione
- TESTO A SCHERMO: overlay text, titoli, didascalie
- AUDIO: suggerimenti per musica, sound design, voiceover
- MONTAGGIO: ritmo, transizioni, durata consigliata
- TRUCCHI & TIPS: consigli pro per massimizzare l'engagement video

Tono: pratico e creativo. Dai consigli che un vero videomaker darebbe al team.
Rispondi sempre in italiano.`;

const ANALYTICS_SYSTEM = `Sei un esperto di social media analytics. Analizza i dati dei post forniti e rispondi SOLO con un JSON valido, senza markdown, senza backtick. Struttura:
{"sintesi":"<2-3 frasi su trend generale>","top_post":{"motivo":"<perche ha performato bene>"},"bottom_post":{"motivo":"<perche ha performato peggio>"},"consigli":["<consiglio 1>","<consiglio 2>","<consiglio 3>"],"best_giorno":"<giorno della settimana con piu engagement>","best_formato":"<formato che performa meglio>"}`;

const MODES = [
  { id: "brainstorm", label: "💡 Brainstorm",  desc: "Consulente creativo libero da schemi",    color: "#E8354A" },
  { id: "caption",    label: "✍️ Caption",    desc: "Scrivi una caption per il tuo post",       color: "#2BB5AE" },
  { id: "hashtag",    label: "# Hashtag",     desc: "Trova gli hashtag perfetti",               color: "#7B4FA0" },
  { id: "reels",      label: "🎬 Video",       desc: "Assistente per la produzione video",       color: "#2BB5AE" },
  { id: "analytics",  label: "📈 Analytics",   desc: "Traccia e analizza i tuoi post",           color: "#E8354A" },
];
const PLATFORMS   = ["Instagram", "Facebook", "Entrambi"];
const TONE_OPTIONS = ["Ironico","Poetico","Diretto","Provocatorio","Caldo","Misterioso","Giocoso","Urgente"];
const CONTEXTUAL_CHIPS = {
  brainstorm: ["nuova direzione creativa","concept per il prossimo mese","identita visiva del collettivo","come differenziarci","collab da proporre","tema per una campagna"],
  caption:    ["backstage di una performance","nuovo progetto artistico","evento imminente","collab con un artista","behind the scenes","lancio di un brano"],
  hashtag:    ["musica alternativa italiana","arte collettiva urbana","live performance","new release","arte digitale","collettivo underground"],
  reels:      ["teaser nuovo brano","day in the life artista","behind the scenes live","time-lapse studio session","annuncio sorpresa","making of artwork"],
  analytics:  [],
};
const EMPTY_POST = { date:"", platform:"Instagram", format:"Post", caption:"", reach:0, impressions:0, likes:0, comments:0, saves:0, shares:0, followers_delta:0, hashtags:"" };
const FORMATS = ["Post","Reel","Story","Carosello"];

// ─── API HELPERS ─────────────────────────────────────────────────────────────
const callAI = async (body) => {
  const res = await fetch("/api/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  return res.json();
};
const dbGet = (table, user) => fetch(`/api/supabase?table=${table}&user=${encodeURIComponent(user)}`).then(r=>r.json());
const dbPost = (table, record) => fetch("/api/supabase", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({table,record}) }).then(r=>r.json());
const dbDelete = (table, id) => fetch("/api/supabase", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({table,id}) }).then(r=>r.json());
const dbPut = (table, id, record) => fetch("/api/supabase", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({table,id,record}) }).then(r=>r.json());

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function LenIA() {
  // User
  const [userName, setUserName] = useState("");
  const [userInput, setUserInput] = useState("");
  const [userReady, setUserReady] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);

  // Chat
  const [mode, setMode]         = useState("caption");
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
  const [showAddPost, setShowAddPost] = useState(false);
  const [editPost, setEditPost]       = useState(null);
  const [postDraft, setPostDraft]     = useState(EMPTY_POST);
  const [aiInsights, setAiInsights]   = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Calendar
  const [calEvents, setCalEvents]         = useState([]);
  const [calMonth, setCalMonth]           = useState(new Date().getMonth());
  const [calYear, setCalYear]             = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay]     = useState(null);
  const [calDraft, setCalDraft]           = useState({ title:"", platform:"Instagram", format:"Post", note:"" });
  const [editCalEvent, setEditCalEvent]   = useState(null);

  // Attachments (caption + brainstorm only)
  const [attachments, setAttachments] = useState([]); // array of { base64, mediaType, name, preview }
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

  // Load data from Supabase when user logs in
  const loginUser = async () => {
    const name = userInput.trim();
    if (!name) return;
    setLoadingUser(true);
    setUserName(name);

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
    if (postsData?.length > 0) setPosts(postsData.map(p => ({ ...p, id:p.id, date:p.post_date, reach:p.reach||0, impressions:p.impressions||0, likes:p.likes||0, comments:p.comments||0, saves:p.saves||0, shares:p.shares||0, followers_delta:p.followers_delta||0 })));
    if (calData?.length > 0) setCalEvents(calData.map(e => ({ ...e, date: e.event_date })));
    if (bSessionsData?.length > 0) setBSessions(bSessionsData);

    setLoadingUser(false);
    setUserReady(true);
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

  const buildSystemPrompt = () => {
    if (mode === "brainstorm") return BRAINSTORM_SYSTEM;
    if (mode === "reels") return REELS_SYSTEM;
    let extra = "";
    if (brief.tones.length > 0 || brief.keywords || brief.examples) {
      extra += "\n\n--- BRIEF DI STILE ---";
      if (brief.tones.length > 0) extra += `\nTono: ${brief.tones.join(", ")}`;
      if (brief.keywords) extra += `\nKeyword: ${brief.keywords}`;
      if (brief.examples) extra += `\nEsempi: ${brief.examples}`;
      extra += "\n\nUSA QUESTO BRIEF come guida principale.";
    }
    return SYSTEM_PROMPT + extra;
  };
  const hasBrief = brief.tones.length > 0 || brief.keywords.trim() || brief.examples.trim();

  const getModePrompt = () => {
    if (mode==="caption")    return `Scrivi una caption per ${platform} sul seguente argomento/contenuto: `;
    if (mode==="hashtag")    return `Suggerisci hashtag ottimizzati per ${platform} per il seguente contenuto: `;
    if (mode==="reels")      return `Crea una guida completa per produrre questo video: `;
    if (mode==="brainstorm") return "";
    return "";
  };

  const compressImage = (file) => new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxSize = 800;
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", 0.75);
      URL.revokeObjectURL(url);
      resolve(compressed);
    };
    img.src = url;
  });

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const SIZE_THRESHOLD = 1 * 1024 * 1024; // 1MB
    const newAttachments = await Promise.all(files.map(async (file) => {
      if (file.type.startsWith("image/")) {
        if (file.size > SIZE_THRESHOLD) {
          // Comprimi solo se supera 1MB
          const compressed = await compressImage(file);
          const base64 = compressed.split(",")[1];
          return { base64, mediaType:"image/jpeg", name:file.name, preview:compressed };
        } else {
          // Immagine già leggera, usa direttamente
          return await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result;
              res({ base64: dataUrl.split(",")[1], mediaType:file.type, name:file.name, preview:dataUrl });
            };
            reader.readAsDataURL(file);
          });
        }
      } else {
        return await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(",")[1];
            res({ base64, mediaType:file.type, name:file.name, preview:null });
          };
          reader.readAsDataURL(file);
        });
      }
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const sendMessage = async (retryHistory = null) => {
    const isRetry = retryHistory !== null;
    if (!isRetry && (!input.trim() && !attachments.length) || loading) return;
    const textPrompt = isRetry ? "" : getModePrompt() + (input.trim() || (attachments.length ? `Analizza questi file: ${attachments.map(a=>a.name).join(", ")}` : ""));

    let userApiContent;
    let userMsg;

    if (!isRetry) {
      if (attachments.length > 0) {
        const fileBlocks = attachments.map(att =>
          att.mediaType === "application/pdf"
            ? { type:"document", source:{ type:"base64", media_type:"application/pdf", data:att.base64 } }
            : { type:"image", source:{ type:"base64", media_type:att.mediaType, data:att.base64 } }
        );
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
      const data = await callAI({ model:"claude-sonnet-4-20250514", max_tokens:1500, system:buildSystemPrompt(), messages:trimmedHistory });
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
      const data = await callAI({ model:"claude-sonnet-4-20250514", max_tokens:1000, system:ANALYSIS_SYSTEM, messages:[{ role:"user", content:`Analizza questa caption:\n\n${text}` }] });
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

  // ── ANALYTICS ──
  const savePost = async () => {
    if (!postDraft.date) return;
    const record = { user_name:userName, post_date:postDraft.date, platform:postDraft.platform, format:postDraft.format, caption:postDraft.caption, reach:Number(postDraft.reach)||0, impressions:Number(postDraft.impressions)||0, likes:Number(postDraft.likes)||0, comments:Number(postDraft.comments)||0, saves:Number(postDraft.saves)||0, shares:Number(postDraft.shares)||0, followers_delta:Number(postDraft.followers_delta)||0, hashtags:postDraft.hashtags };
    if (editPost !== null) {
      const id = posts[editPost].id;
      await dbPut("analytics_posts", id, record);
      setPosts(p => p.map((x,i) => i===editPost ? { ...record, id, date:record.post_date } : x));
    } else {
      const saved = await dbPost("analytics_posts", record);
      setPosts(p => [...p, { ...record, id:saved.id, date:record.post_date }]);
    }
    setPostDraft(EMPTY_POST); setShowAddPost(false); setEditPost(null); setAiInsights(null);
  };

  const deletePost = async (id) => {
    await dbDelete("analytics_posts", id);
    setPosts(p => p.filter(x => x.id !== id));
    setAiInsights(null);
  };

  const getAiInsights = async () => {
    if (posts.length === 0) return;
    setLoadingInsights(true);
    try {
      const summary = posts.map(p => `Data: ${p.date} | Piattaforma: ${p.platform} | Formato: ${p.format} | Reach: ${p.reach} | Impressioni: ${p.impressions} | Like: ${p.likes} | Commenti: ${p.comments} | Salvataggi: ${p.saves} | Condivisioni: ${p.shares} | Delta follower: ${p.followers_delta} | Hashtag: ${p.hashtags||"n/d"} | Caption: ${p.caption||"n/d"}`).join("\n");
      const data = await callAI({ model:"claude-sonnet-4-20250514", max_tokens:1000, system:ANALYTICS_SYSTEM, messages:[{ role:"user", content:`Analizza questi dati di ${posts.length} post:\n\n${summary}` }] });
      const raw = data.content?.map(b => b.text||"").join("") || "{}";
      setAiInsights(JSON.parse(raw.replace(/```json|```/g,"").trim()));
    } catch { setAiInsights({ error:true }); }
    finally { setLoadingInsights(false); }
  };

  const totalReach = posts.reduce((s,p) => s+Number(p.reach||0), 0);
  const totalLikes = posts.reduce((s,p) => s+Number(p.likes||0), 0);
  const avgEng = posts.length ? (posts.reduce((s,p) => s+Number(p.likes||0)+Number(p.comments||0)+Number(p.saves||0)+Number(p.shares||0), 0)/posts.length).toFixed(0) : 0;
  const topPost = posts.length ? posts.reduce((best,p) => (Number(p.likes||0)+Number(p.comments||0)+Number(p.saves||0)) > (Number(best.likes||0)+Number(best.comments||0)+Number(best.saves||0)) ? p : best) : null;

  // ── HELPERS ──
  const ScoreBar = ({ score }) => (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ flex:1, height:6, background:"#f0ede8", borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", borderRadius:3, width:`${score*10}%`, background:score>=8?"#2BB5AE":score>=5?"#F07D2A":"#E8354A", transition:"width 1s cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
      <span style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:900, color:score>=8?"#2BB5AE":score>=5?"#F07D2A":"#E8354A", minWidth:28 }}>{score}</span>
      <span style={{ fontSize:11, color:"#bbb" }}>/10</span>
    </div>
  );
  const StatCard = ({ label, value, color }) => (
    <div style={{ background:"#fff", border:"1px solid rgba(0,0,0,0.07)", borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:4, boxShadow:"0 2px 8px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize:10, color:"#aaa", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:600 }}>{label}</div>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:900, color:color||"#1a1a1a" }}>{Number(value).toLocaleString("it-IT")}</div>
    </div>
  );
  const numInput = (field, label) => (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <label style={S.briefLabel}>{label}</label>
      <input type="number" min="0" style={{ ...S.briefInput, padding:"8px 12px" }} value={postDraft[field]||""} onChange={e => setPostDraft(d=>({...d,[field]:e.target.value}))} />
    </div>
  );

  // ── LOGIN SCREEN ──
  if (!userReady) {
    return (
      <div style={{ ...S.root, alignItems:"center", justifyContent:"center" }}>
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
          <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#888", textAlign:"center" }}>Chi sei? Inserisci il tuo nome per accedere al tuo profilo.</div>
          <input style={{ ...S.briefInput, textAlign:"center", fontSize:15 }} placeholder="es. Marta, Lorenzo, Sara…" value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") loginUser(); }} autoFocus />
          <button className="brief-save-btn" onClick={loginUser} disabled={!userInput.trim()||loadingUser} style={{ ...S.saveBtn, width:"100%", padding:"12px", fontSize:14, opacity:!userInput.trim()||loadingUser?0.5:1 }} {...hov}>
            {loadingUser ? "caricamento…" : "entra →"}
          </button>
        </div>
      </div>
    );
  }

  // ── CALENDAR FUNCTIONS ──
  const CAL_COLORS = ["#E8354A","#7B4FA0","#2BB5AE"];
  const MONTHS_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const DAYS_IT   = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

  const saveCalEvent = async () => {
    if (!calDraft.title.trim() || !selectedDay) return;
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`;
    const record = { user_name:userName, event_date:dateStr, title:calDraft.title, platform:calDraft.platform, format:calDraft.format, note:calDraft.note };
    if (editCalEvent !== null) {
      await dbPut("calendar_events", editCalEvent, record);
      setCalEvents(p => p.map(e => e.id===editCalEvent ? { ...record, id:editCalEvent, date:dateStr } : e));
    } else {
      const saved = await dbPost("calendar_events", record);
      setCalEvents(p => [...p, { ...record, id:saved.id, date:dateStr }]);
    }
    setCalDraft({ title:"", platform:"Instagram", format:"Post", note:"" });
    setSelectedDay(null);
    setEditCalEvent(null);
  };

  const deleteCalEvent = async (id) => {
    await dbDelete("calendar_events", id);
    setCalEvents(p => p.filter(e => e.id !== id));
  };

  const getDaysInMonth = (y, m) => new Date(y, m+1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => { const d = new Date(y, m, 1).getDay(); return d===0?6:d-1; };
  const eventsForDay = (day) => {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return calEvents.filter(e => e.date === dateStr || e.event_date === dateStr);
  };
  const platformColor = (p) => p==="Instagram"?"#E8354A":p==="Facebook"?"#1877F2":"#7B4FA0";

  // ── CALENDAR PANEL ──
  const CalendarPanel = () => {
    const daysInMonth = getDaysInMonth(calYear, calMonth);
    const firstDay    = getFirstDayOfMonth(calYear, calMonth);
    const today       = new Date();
    const isToday     = (d) => d===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
    const titleRef    = useRef(null);
    const noteRef     = useRef(null);
    const platformRef = useRef(null);
    const formatRef   = useRef(null);

    const handleSave = async () => {
      const title = titleRef.current?.value?.trim();
      if (!title || !selectedDay) return;
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`;
      const record = { user_name:userName, event_date:dateStr, title, platform:platformRef.current?.value||"Instagram", format:formatRef.current?.value||"Post", note:noteRef.current?.value||"" };
      if (editCalEvent !== null) {
        await dbPut("calendar_events", editCalEvent, record);
        setCalEvents(p => p.map(e => e.id===editCalEvent ? { ...record, id:editCalEvent, date:dateStr } : e));
      } else {
        const saved = await dbPost("calendar_events", record);
        setCalEvents(p => [...p, { ...record, id:saved.id, date:dateStr }]);
      }
      setSelectedDay(null);
      setEditCalEvent(null);
    };

    return (
      <div style={{ flex:1, overflowY:"auto", padding:"28px", maxWidth:960, width:"100%", margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:900 }}>📅 Calendario Editoriale</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:14, fontStyle:"italic", color:"#aaa", marginTop:2 }}>Pianifica i post del collettivo</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button className="clear-btn" style={S.clearBtn} onClick={()=>{ if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else{setCalMonth(m=>m-1);} }}>←</button>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:700, minWidth:160, textAlign:"center" }}>{MONTHS_IT[calMonth]} {calYear}</span>
            <button className="clear-btn" style={S.clearBtn} onClick={()=>{ if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else{setCalMonth(m=>m+1);} }}>→</button>
          </div>
        </div>

        {/* Day headers */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
          {DAYS_IT.map(d => <div key={d} style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, fontWeight:700, color:"#bbb", textAlign:"center", letterSpacing:"0.08em", textTransform:"uppercase", padding:"4px 0" }}>{d}</div>)}
        </div>

        {/* Calendar grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
          {Array.from({ length: firstDay }).map((_,i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_,i) => {
            const day = i+1;
            const evs = eventsForDay(day);
            const sel = selectedDay===day;
            return (
              <div key={day} onClick={()=>{ setSelectedDay(sel?null:day); setEditCalEvent(null); }}
                style={{ minHeight:72, background: sel?"rgba(123,79,160,0.08)":isToday(day)?"rgba(232,53,74,0.04)":"#fff", border:`1.5px solid ${sel?"#7B4FA0":isToday(day)?"rgba(232,53,74,0.3)":"rgba(0,0,0,0.07)"}`, borderRadius:10, padding:"6px 7px", cursor:"pointer", position:"relative" }}>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight: isToday(day)?700:500, color: isToday(day)?"#E8354A":"#555", marginBottom:4 }}>{day}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {evs.slice(0,3).map((ev,ei) => (
                    <div key={ev.id} style={{ background: CAL_COLORS[ei % CAL_COLORS.length], borderRadius:4, padding:"2px 5px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:2 }}>
                      <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:9, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{ev.title}</span>
                      <button onClick={e=>{ e.stopPropagation(); deleteCalEvent(ev.id); }} style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.7)", fontSize:9, padding:0, lineHeight:1, cursor:"pointer" }}>✕</button>
                    </div>
                  ))}
                  {evs.length>3 && <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:8, color:"#aaa" }}>+{evs.length-3} altri</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick add form — uncontrolled inputs to avoid re-render flickering */}
        {selectedDay && (
          <div style={{ marginTop:16, background:"#fff", border:"1.5px solid rgba(123,79,160,0.25)", borderRadius:14, padding:"18px 22px", animation:"slideUp 0.25s cubic-bezier(0.22,1,0.36,1)" }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:700, color:"#7B4FA0", marginBottom:14 }}>
              + Post per il {selectedDay} {MONTHS_IT[calMonth]}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:10, marginBottom:10 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={S.briefLabel}>Titolo post *</label>
                <input ref={titleRef} style={{ ...S.briefInput, padding:"8px 12px" }} placeholder="es. Backstage live Milano" defaultValue="" autoFocus />
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={S.briefLabel}>Piattaforma</label>
                <select ref={platformRef} style={{ ...S.briefInput, padding:"8px 12px" }} defaultValue="Instagram">
                  {["Instagram","Facebook","Entrambi"].map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={S.briefLabel}>Formato</label>
                <select ref={formatRef} style={{ ...S.briefInput, padding:"8px 12px" }} defaultValue="Post">
                  {["Post","Reel","Story","Carosello"].map(f=><option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:14 }}>
              <label style={S.briefLabel}>Nota (opzionale)</label>
              <input ref={noteRef} style={{ ...S.briefInput, padding:"8px 12px" }} placeholder="es. usare foto del backstage, tono ironico" defaultValue="" />
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={()=>{ setSelectedDay(null); setEditCalEvent(null); }}>annulla</button>
              <button className="brief-save-btn" style={{ ...S.saveBtn, background:"linear-gradient(135deg,#7B4FA0,#2BB5AE)" }} onClick={handleSave}>salva →</button>
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{ display:"flex", gap:16, marginTop:16, flexWrap:"wrap" }}>
          {[["#E8354A","1° post del giorno"],["#7B4FA0","2° post del giorno"],["#2BB5AE","3° post del giorno"]].map(([c,l])=>(
            <div key={c} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:10, height:10, borderRadius:3, background:c }} />
              <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#aaa" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── ANALYTICS PANEL ──
  const AnalyticsPanel = () => (
    <div style={{ flex:1, overflowY:"auto", padding:"28px", maxWidth:900, width:"100%", margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:900 }}>📈 Analytics</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:14, fontStyle:"italic", color:"#aaa", marginTop:2 }}>Traccia e analizza le performance dei tuoi post</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {posts.length>1 && <button className="send-btn" onClick={getAiInsights} disabled={loadingInsights} style={{ ...S.sendBtn, width:"auto", padding:"0 18px", height:40, fontSize:12, fontWeight:600, background:loadingInsights?"#e8e4df":"#16A34A", color:loadingInsights?"#bbb":"#fff", borderRadius:10 }} {...hov}>{loadingInsights?"⏳ analisi…":"✦ LEN-IA analizza"}</button>}
          <button className="send-btn" onClick={()=>{ setPostDraft(EMPTY_POST); setEditPost(null); setShowAddPost(true); }} style={{ ...S.sendBtn, width:"auto", padding:"0 18px", height:40, fontSize:12, fontWeight:600, background:"#16A34A", color:"#fff", borderRadius:10 }} {...hov}>+ Aggiungi post</button>
        </div>
      </div>
      {posts.length>0 && <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}><StatCard label="Post tracciati" value={posts.length} color="#16A34A" /><StatCard label="Reach totale" value={totalReach} color="#2BB5AE" /><StatCard label="Like totali" value={totalLikes} color="#E8354A" /><StatCard label="Eng. medio/post" value={avgEng} color="#7B4FA0" /></div>}
      {aiInsights && !aiInsights.error && (
        <div style={{ background:"#fff", border:"1.5px solid rgba(22,163,74,0.25)", borderRadius:14, padding:"20px 24px", marginBottom:20, animation:"slideUp 0.4s cubic-bezier(0.22,1,0.36,1)" }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:700, color:"#16A34A", marginBottom:12 }}>✦ Analisi LEN-IA</div>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, fontStyle:"italic", color:"#555", lineHeight:1.7, marginBottom:14 }}>{aiInsights.sintesi}</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <div style={{ background:"rgba(43,181,174,0.06)", borderRadius:10, padding:"12px 14px" }}><div style={S.analysisSubLabel}>🏆 Top post</div><div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"#555", lineHeight:1.6 }}>{aiInsights.top_post?.motivo}</div></div>
            <div style={{ background:"rgba(232,53,74,0.06)", borderRadius:10, padding:"12px 14px" }}><div style={S.analysisSubLabel}>📉 Post debole</div><div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"#555", lineHeight:1.6 }}>{aiInsights.bottom_post?.motivo}</div></div>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
            {aiInsights.best_giorno && <span style={{ background:"rgba(22,163,74,0.08)", border:"1px solid rgba(22,163,74,0.2)", borderRadius:20, padding:"4px 14px", fontSize:11, fontWeight:600, color:"#16A34A" }}>📅 Miglior giorno: {aiInsights.best_giorno}</span>}
            {aiInsights.best_formato && <span style={{ background:"rgba(123,79,160,0.08)", border:"1px solid rgba(123,79,160,0.2)", borderRadius:20, padding:"4px 14px", fontSize:11, fontWeight:600, color:"#7B4FA0" }}>🎬 Formato top: {aiInsights.best_formato}</span>}
          </div>
          <div style={S.analysisSubLabel}>💡 Consigli strategici</div>
          {aiInsights.consigli?.map((c,i) => <div key={i} style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"#444", lineHeight:1.7, paddingLeft:4 }}>→ {c}</div>)}
        </div>
      )}
      {showAddPost && (
        <div style={{ background:"#fff", border:"1.5px solid rgba(22,163,74,0.2)", borderRadius:14, padding:"20px 24px", marginBottom:20, animation:"slideDown 0.25s cubic-bezier(0.22,1,0.36,1)" }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:700, marginBottom:16 }}>{editPost!==null?"✏️ Modifica post":"+ Nuovo post"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={S.briefLabel}>Data</label><input type="date" style={{ ...S.briefInput, padding:"8px 12px" }} value={postDraft.date} onChange={e=>setPostDraft(d=>({...d,date:e.target.value}))} /></div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={S.briefLabel}>Piattaforma</label><select style={{ ...S.briefInput, padding:"8px 12px" }} value={postDraft.platform} onChange={e=>setPostDraft(d=>({...d,platform:e.target.value}))}>{["Instagram","Facebook"].map(p=><option key={p}>{p}</option>)}</select></div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={S.briefLabel}>Formato</label><select style={{ ...S.briefInput, padding:"8px 12px" }} value={postDraft.format} onChange={e=>setPostDraft(d=>({...d,format:e.target.value}))}>{FORMATS.map(f=><option key={f}>{f}</option>)}</select></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:12 }}>{numInput("reach","Reach")}{numInput("impressions","Impressioni")}{numInput("likes","Like")}{numInput("comments","Commenti")}{numInput("saves","Salvataggi")}{numInput("shares","Condivisioni")}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>{numInput("followers_delta","Delta follower")}<div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={S.briefLabel}>Hashtag</label><input style={{ ...S.briefInput, padding:"8px 12px" }} placeholder="#len #musica…" value={postDraft.hashtags} onChange={e=>setPostDraft(d=>({...d,hashtags:e.target.value}))} /></div></div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:16 }}><label style={S.briefLabel}>Caption (opzionale)</label><textarea style={{ ...S.briefInput, minHeight:70, resize:"vertical" }} placeholder="Incolla la caption…" value={postDraft.caption} onChange={e=>setPostDraft(d=>({...d,caption:e.target.value}))} /></div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={()=>{ setShowAddPost(false); setEditPost(null); setPostDraft(EMPTY_POST); }} {...hov}>annulla</button>
            <button className="brief-save-btn" style={{ ...S.saveBtn, background:"linear-gradient(135deg,#16A34A,#2BB5AE)" }} onClick={savePost} {...hov}>{editPost!==null?"aggiorna →":"salva post →"}</button>
          </div>
        </div>
      )}
      {posts.length===0 ? (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 20px", textAlign:"center", gap:12 }}>
          <div style={{ fontSize:42 }}>📊</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:900 }}>Nessun post ancora</div>
          <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#aaa" }}>Aggiungi il tuo primo post per iniziare a tracciare le performance.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[...posts].reverse().map((post,ri) => {
            const idx = posts.length-1-ri;
            const eng = Number(post.likes||0)+Number(post.comments||0)+Number(post.saves||0)+Number(post.shares||0);
            const isTop = topPost && post.id===topPost.id;
            return (
              <div key={post.id} style={{ background:"#fff", border:`1px solid ${isTop?"rgba(22,163,74,0.3)":"rgba(0,0,0,0.07)"}`, borderRadius:12, padding:"14px 18px", boxShadow:isTop?"0 2px 12px rgba(22,163,74,0.1)":"0 2px 8px rgba(0,0,0,0.04)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    {isTop && <span style={{ background:"rgba(22,163,74,0.1)", border:"1px solid rgba(22,163,74,0.3)", borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:700, color:"#16A34A" }}>🏆 top</span>}
                    <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:700, color:"#555" }}>{post.date}</span>
                    <span style={{ ...S.modeTag, background:post.platform==="Instagram"?"#E8354A":"#1877F2" }}>{post.platform}</span>
                    <span style={S.platformTag}>{post.format}</span>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="copy-btn" style={{ ...S.copyBtn, color:"#aaa" }} onClick={()=>{ setPostDraft({...post, date:post.date||post.post_date}); setEditPost(idx); setShowAddPost(true); }} {...hov}>✏️ modifica</button>
                    <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A" }} onClick={()=>deletePost(post.id)} {...hov}>✕</button>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8 }}>
                  {[["Reach",post.reach,"#2BB5AE"],["Impressioni",post.impressions,"#7B4FA0"],["Like",post.likes,"#E8354A"],["Commenti",post.comments,"#F07D2A"],["Salvataggi",post.saves,"#16A34A"],["Engagement",eng,"#1a1a1a"]].map(([lbl,val,col]) => (
                    <div key={lbl} style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <div style={{ fontSize:9, color:"#bbb", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.08em", textTransform:"uppercase" }}>{lbl}</div>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:700, color:col }}>{Number(val||0).toLocaleString("it-IT")}</div>
                    </div>
                  ))}
                </div>
                {post.caption && <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#aaa", marginTop:10, fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>"{post.caption}"</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div style={S.root}>
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

      {showBSessions && (
        <div style={S.drawerOverlay} onClick={()=>setShowBSessions(false)}>
          <div style={S.drawer} onClick={e=>e.stopPropagation()}>
            <div style={S.drawerHeader}>
              <span style={S.drawerTitle}>💡 Sessioni Brainstorm</span>
              <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={()=>setShowBSessions(false)} {...hov}>✕ chiudi</button>
            </div>
            <div style={{ padding:"12px 20px", borderBottom:"1px solid rgba(0,0,0,0.07)" }}>
              <button className="brief-save-btn" onClick={newBrainstormSession} style={{ ...S.saveBtn, background:"linear-gradient(135deg,#E8354A,#7B4FA0)", width:"100%", textAlign:"center", padding:"10px" }} {...hov}>+ Nuova sessione</button>
            </div>
            {bSessions.length===0 ? (
              <div style={S.drawerEmpty}><div style={{ fontSize:36, marginBottom:12 }}>💭</div><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#bbb" }}>Nessuna sessione salvata ancora.</p><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#ccc", marginTop:6 }}>Le sessioni vengono salvate automaticamente durante il brainstorming.</p></div>
            ) : (
              <div style={S.drawerList}>
                {bSessions.map(s => (
                  <div key={s.id} style={{ ...S.drawerItem, border:`1px solid ${bSessionId===s.id?"rgba(232,53,74,0.3)":"rgba(0,0,0,0.07)"}`, background:bSessionId===s.id?"rgba(232,53,74,0.03)":"#FAFAF8" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13, fontWeight:700, color:"#1a1a1a", flex:1, marginRight:8 }}>{s.title}</div>
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
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button className="clear-btn" onClick={()=>setShowHistory(true)} style={{ ...S.clearBtn, borderColor:savedItems.length>0?"#7B4FA0":"rgba(0,0,0,0.12)", color:savedItems.length>0?"#7B4FA0":"#999", position:"relative" }} {...hov}>
              {savedItems.length>0 && <span style={{ position:"absolute", top:3, right:3, width:6, height:6, borderRadius:"50%", background:"#7B4FA0" }} />}
              💾 storico{savedItems.length>0?` (${savedItems.length})`:""}
            </button>
            <button className="clear-btn" onClick={()=>setShowBSessions(true)} style={{ ...S.clearBtn, borderColor:bSessions.length>0?"#E8354A":"rgba(0,0,0,0.12)", color:bSessions.length>0?"#E8354A":"#999", position:"relative" }} {...hov}>
              {bSessions.length>0 && <span style={{ position:"absolute", top:3, right:3, width:6, height:6, borderRadius:"50%", background:"#E8354A" }} />}
              💡 sessioni{bSessions.length>0?` (${bSessions.length})`:""}
            </button>
            <button className="clear-btn" onClick={()=>setShowBrief(b=>!b)} style={{ ...S.clearBtn, borderColor:hasBrief?"#E8354A":"rgba(0,0,0,0.12)", color:hasBrief?"#E8354A":"#999", position:"relative" }} {...hov}>
              {hasBrief && <span style={{ position:"absolute", top:3, right:3, width:6, height:6, borderRadius:"50%", background:"#E8354A" }} />}
              🎨 brief
            </button>
            <button className="clear-btn" onClick={()=>setMode(mode==="calendar"?"caption":"calendar")} style={{ ...S.clearBtn, borderColor:mode==="calendar"?"#7B4FA0":"rgba(0,0,0,0.12)", color:mode==="calendar"?"#7B4FA0":"#999" }} {...hov}>
              📅 calendario
            </button>
            {mode!=="analytics" && mode!=="calendar" && <button className="clear-btn" onClick={clearChat} style={S.clearBtn} {...hov}>↺ reset</button>}
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

      <div style={S.modeBar}>
        {MODES.filter(m=>m.id!=="calendar").map(m => <button key={m.id} className="mode-btn" onClick={()=>setMode(m.id)} style={{ ...S.modeBtn, ...(mode===m.id?{ background:m.color, color:"#fff", borderBottom:`3px solid ${m.color}` }:{ color:"#bbb" }) }} {...hov}><span style={S.modeBtnLabel}>{m.label}</span><span style={S.modeBtnDesc}>{m.desc}</span></button>)}
      </div>

      {mode==="analytics" ? <AnalyticsPanel /> : mode==="calendar" ? <CalendarPanel /> : (
        <>
          {mode !== "brainstorm" && (
            <div style={S.platformBar}>
              <span style={{ fontSize:14, color:"#ccc", marginRight:2 }}>📱</span>
              {PLATFORMS.map(p => <button key={p} className="platform-btn" onClick={()=>setPlatform(p)} style={{ ...S.platformBtn, ...(platform===p?{ background:currentMode.color, color:"#fff", fontWeight:600, border:`2px solid ${currentMode.color}` }:{}) }} {...hov}>{p}</button>)}
              <div style={{ width:1, height:20, background:"rgba(0,0,0,0.08)", margin:"0 6px", flexShrink:0 }} />
              <div style={{ display:"flex", gap:6, overflowX:"auto", flex:1, paddingBottom:2 }}>
                {CONTEXTUAL_CHIPS[mode].map(chip => <button key={chip} className="quick-chip" onClick={()=>setInput(chip)} style={S.ctxChip} {...hov}>{chip} →</button>)}
              </div>
            </div>
          )}
          {mode === "brainstorm" && (
            <div style={{ ...S.platformBar, background:"rgba(14,165,233,0.04)", borderBottom:"1px solid rgba(14,165,233,0.15)" }}>
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
                  {MODES.filter(m=>m.id!=="analytics").map(m => <button key={m.id} className="quick-chip" onClick={()=>setMode(m.id)} style={{ ...S.chip, borderColor:`${m.color}55`, color:m.color, background:`${m.color}08` }} {...hov}>{m.label}</button>)}
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
                        <p style={{ fontSize:13, color:"#333", lineHeight:1.7, fontFamily:"'DM Sans',sans-serif" }}>{msg.display}</p>
                      </div>
                    </div>
                  ) : (
                    <div style={S.assistantRow}>
                      <div style={{ ...S.assistantAvatar, background:`linear-gradient(135deg,${msgMode?.color||"#E8354A"},${msgMode?.color||"#E8354A"}88)` }}>✦</div>
                      <div style={S.assistantContent}>
                        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:12, fontStyle:"italic", color:"#bbb", letterSpacing:"0.05em" }}>LEN-IA</div>
                        <pre style={{ ...S.assistantText, borderColor: msg.isError?"rgba(232,53,74,0.3)":"rgba(0,0,0,0.07)" }}>{msg.content}</pre>
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
                            ].map(t => (
                              <button key={t.id} className="quick-chip" onClick={()=>{ setMode(t.id); setInput(msg.content.slice(0,200)); }}
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
                  <div key={ai} style={{ display:"flex", alignItems:"center", gap:6, background:"#fff", border:`1px solid ${currentMode.color}44`, borderRadius:10, padding:"6px 10px" }}>
                    {att.preview
                      ? <img src={att.preview} alt="preview" style={{ width:32, height:32, borderRadius:4, objectFit:"cover" }} />
                      : <span style={{ fontSize:16 }}>📎</span>}
                    <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#555", maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{att.name}</span>
                    <button onClick={()=>setAttachments(p=>p.filter((_,j)=>j!==ai))} style={{ background:"transparent", border:"none", color:"#ccc", fontSize:14, cursor:"pointer", padding:0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={S.inputWrapper}>
              {(mode==="caption"||mode==="brainstorm") && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple style={{ display:"none" }} onChange={handleFileSelect} />
                  <button className="clear-btn" onClick={()=>fileInputRef.current?.click()} style={{ ...S.clearBtn, width:52, height:52, borderRadius:14, fontSize:20, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", padding:0, border:`1.5px solid ${currentMode.color}55`, color:currentMode.color }} {...hov} title="Allega immagini o PDF">+</button>
                </>
              )}
              <textarea style={{ ...S.textarea, border:`1.5px solid ${currentMode.color}55`, boxShadow:`0 2px 12px ${currentMode.color}15` }} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                placeholder={
                  mode==="caption"    ? "es. foto del backstage dell'ultima performance, mood underground..." :
                  mode==="hashtag"    ? "es. mostra collettiva di arte digitale e musica sperimentale" :
                  mode==="reels"      ? "es. teaser del nuovo singolo, atmosfera notturna e misteriosa — dimmi di che video si tratta!" :
                  mode==="brainstorm" ? "es. voglio rinnovare l'identita visiva del collettivo, da dove partiamo?" :
                                        "Scrivi qui..."
                }
                rows={3} />
              <button className="send-btn" onClick={()=>sendMessage()} disabled={(!input.trim()&&!attachments.length)||loading} style={{ ...S.sendBtn, background:(!input.trim()&&!attachments.length)||loading?"#e8e4df":currentMode.color, color:(!input.trim()&&!attachments.length)||loading?"#bbb":"#fff" }} {...hov}>↑</button>
            </div>
            <p style={{ maxWidth:860, margin:"8px auto 0", fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#ccc", letterSpacing:"0.08em" }}>enter per inviare · shift+enter per andare a capo</p>
          </div>
        </>
      )}
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @media (pointer: fine) { * { cursor: none !important; } }
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

const S = {
  root: { fontFamily:"'DM Sans',sans-serif", background:"#FAFAF8", minHeight:"100vh", display:"flex", flexDirection:"column", position:"relative", overflow:"hidden", color:"#1a1a1a" },
  bgNoise: { position:"fixed", inset:0, backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E")`, pointerEvents:"none", zIndex:0, opacity:0.4 },
  bgA1: { position:"fixed", top:-80, right:-80, width:360, height:360, borderRadius:"50%", background:"radial-gradient(circle,rgba(232,53,74,0.06) 0%,transparent 70%)", pointerEvents:"none", zIndex:0 },
  bgA2: { position:"fixed", bottom:-100, left:-60, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(43,181,174,0.06) 0%,transparent 70%)", pointerEvents:"none", zIndex:0 },
  drawerOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.22)", backdropFilter:"blur(4px)", zIndex:1000, display:"flex", justifyContent:"flex-end" },
  drawer: { width:420, maxWidth:"92vw", background:"#fff", height:"100%", display:"flex", flexDirection:"column", boxShadow:"-8px 0 40px rgba(0,0,0,0.12)", animation:"slideInRight 0.3s cubic-bezier(0.22,1,0.36,1)" },
  drawerHeader: { padding:"22px 24px 18px", borderBottom:"1px solid rgba(0,0,0,0.07)", display:"flex", justifyContent:"space-between", alignItems:"center" },
  drawerTitle: { fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:900, color:"#1a1a1a" },
  drawerEmpty: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, textAlign:"center" },
  drawerList: { flex:1, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 },
  drawerItem: { background:"#FAFAF8", border:"1px solid rgba(0,0,0,0.07)", borderRadius:12, padding:"14px 16px", display:"flex", flexDirection:"column", gap:10 },
  drawerItemMeta: { display:"flex", gap:6, alignItems:"center" },
  drawerItemText: { fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"#444", lineHeight:1.7, whiteSpace:"pre-wrap", maxHeight:110, overflow:"hidden", WebkitMaskImage:"linear-gradient(to bottom,black 60%,transparent 100%)" },
  header: { borderBottom:"1px solid rgba(0,0,0,0.07)", background:"rgba(250,250,248,0.92)", backdropFilter:"blur(20px)", position:"relative", zIndex:10 },
  headerInner: { maxWidth:900, margin:"0 auto", padding:"16px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" },
  logo: { display:"flex", alignItems:"center", gap:14 },
  logoIconWrap: { width:40, height:40, background:"linear-gradient(135deg,#E8354A,#2BB5AE)", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", animation:"floatSymbol 3s ease-in-out infinite" },
  logoMain: { fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:900, background:"linear-gradient(135deg,#E8354A 0%,#7B4FA0 60%,#2BB5AE 100%)", backgroundSize:"200% auto", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", animation:"gradientShift 4s ease infinite", letterSpacing:"-0.02em" },
  logoSub: { fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#aaa", letterSpacing:"0.18em", textTransform:"uppercase", marginTop:1 },
  clearBtn: { background:"transparent", border:"1px solid rgba(0,0,0,0.12)", color:"#888", fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:500, padding:"6px 14px", borderRadius:20, letterSpacing:"0.04em" },
  briefPanel: { borderBottom:"1px solid rgba(0,0,0,0.07)", background:"rgba(255,255,255,0.98)", backdropFilter:"blur(20px)", position:"relative", zIndex:9, animation:"slideDown 0.25s cubic-bezier(0.22,1,0.36,1)", boxShadow:"0 8px 32px rgba(0,0,0,0.06)" },
  briefInner: { maxWidth:900, margin:"0 auto", padding:"26px 28px 20px", display:"flex", flexDirection:"column", gap:18 },
  briefTitle: { fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:700, color:"#1a1a1a" },
  briefSubtitle: { fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#999", letterSpacing:"0.06em", marginTop:3 },
  briefSection: { display:"flex", flexDirection:"column", gap:9 },
  briefLabel: { fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#bbb", letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600 },
  toneChip: { padding:"6px 16px", fontSize:12, fontWeight:500, border:"1.5px solid rgba(0,0,0,0.12)", background:"transparent", color:"#888", borderRadius:20, fontFamily:"'DM Sans',sans-serif" },
  toneChipActive: { background:"rgba(232,53,74,0.08)", borderColor:"#E8354A", color:"#E8354A" },
  briefInput: { background:"#FAFAF8", border:"1.5px solid rgba(0,0,0,0.1)", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#333", width:"100%", lineHeight:1.7, outline:"none", transition:"all 0.2s ease" },
  saveBtn: { background:"linear-gradient(135deg,#E8354A,#7B4FA0)", border:"none", color:"#fff", fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:13, padding:"10px 26px", borderRadius:20, letterSpacing:"0.02em" },
  modeBar: { display:"flex", borderBottom:"1px solid rgba(0,0,0,0.07)", background:"rgba(255,255,255,0.8)", position:"relative", zIndex:10, overflowX:"auto" },
  modeBtn: { flex:1, minWidth:130, padding:"13px 18px", background:"transparent", border:"none", borderBottom:"3px solid transparent", display:"flex", flexDirection:"column", gap:3, color:"#bbb", fontFamily:"'DM Sans',sans-serif" },
  modeBtnLabel: { fontSize:12, fontWeight:700 },
  modeBtnDesc: { fontSize:9.5, opacity:0.6, letterSpacing:"0.03em" },
  platformBar: { display:"flex", alignItems:"center", gap:8, padding:"9px 28px", borderBottom:"1px solid rgba(0,0,0,0.05)", background:"rgba(250,250,248,0.9)", position:"relative", zIndex:10, overflowX:"auto" },
  platformBtn: { padding:"5px 18px", fontSize:12, fontWeight:500, border:"1.5px solid rgba(0,0,0,0.1)", background:"transparent", color:"#999", borderRadius:20, fontFamily:"'DM Sans',sans-serif", flexShrink:0 },
  ctxChip: { padding:"5px 14px", fontSize:11, fontWeight:500, border:"1.5px solid rgba(0,0,0,0.08)", background:"transparent", color:"#aaa", borderRadius:20, fontFamily:"'DM Sans',sans-serif", flexShrink:0, whiteSpace:"nowrap" },
  chat: { flex:1, overflowY:"auto", padding:"36px 28px 120px", maxWidth:900, width:"100%", margin:"0 auto", display:"flex", flexDirection:"column", gap:24, position:"relative", zIndex:5 },
  emptyState: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"60px 20px", textAlign:"center" },
  emptyTitle: { fontFamily:"'Playfair Display',serif", fontSize:32, fontWeight:900, color:"#1a1a1a", letterSpacing:"-0.02em" },
  chip: { fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:500, padding:"8px 18px", border:"1.5px solid rgba(232,53,74,0.3)", borderRadius:24, color:"#E8354A", background:"rgba(232,53,74,0.04)", display:"inline-flex", alignItems:"center" },
  msgWrapper: { display:"flex", flexDirection:"column", gap:4 },
  userBubble: { background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:"18px 18px 4px 18px", padding:"14px 18px", maxWidth:"70%", boxShadow:"0 2px 12px rgba(0,0,0,0.06)" },
  modeTag: { fontSize:10, padding:"2px 10px", borderRadius:10, fontWeight:700, color:"#fff", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.04em" },
  platformTag: { fontSize:10, padding:"2px 10px", borderRadius:10, background:"rgba(0,0,0,0.05)", color:"#aaa", fontFamily:"'DM Sans',sans-serif" },
  assistantRow: { display:"flex", gap:14, alignItems:"flex-start" },
  assistantAvatar: { width:36, height:36, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", boxShadow:"0 4px 14px rgba(0,0,0,0.15)" },
  assistantContent: { display:"flex", flexDirection:"column", gap:8, flex:1 },
  assistantText: { fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#2a2a2a", lineHeight:1.85, whiteSpace:"pre-wrap", background:"#fff", border:"1px solid rgba(0,0,0,0.07)", borderRadius:"4px 18px 18px 18px", padding:"18px 22px", boxShadow:"0 2px 16px rgba(0,0,0,0.05)" },
  copyBtn: { alignSelf:"flex-start", background:"transparent", border:"none", color:"#ccc", fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:500, padding:"4px 0", letterSpacing:"0.06em" },
  analysisCard: { background:"#FAFAF8", border:"1px solid rgba(43,181,174,0.2)", borderRadius:14, padding:"20px 22px", display:"flex", flexDirection:"column", gap:14, animation:"slideUp 0.4s cubic-bezier(0.22,1,0.36,1)" },
  analysisSubLabel: { fontFamily:"'DM Sans',sans-serif", fontSize:10, fontWeight:700, color:"#aaa", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 },
  analysisBullet: { fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"#555", lineHeight:1.7 },
  analysisOptimized: { fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#1a1a1a", lineHeight:1.85, whiteSpace:"pre-wrap", background:"#fff", border:"1px solid rgba(43,181,174,0.25)", borderRadius:10, padding:"14px 16px" },
  inputArea: { borderTop:"1px solid rgba(0,0,0,0.07)", background:"rgba(250,250,248,0.97)", backdropFilter:"blur(20px)", padding:"18px 28px 22px", position:"sticky", bottom:0, zIndex:20 },
  inputWrapper: { maxWidth:900, margin:"0 auto", display:"flex", gap:12, alignItems:"flex-end" },
  textarea: { flex:1, background:"#fff", border:"1.5px solid rgba(0,0,0,0.1)", borderRadius:14, padding:"12px 18px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a1a1a", resize:"none", lineHeight:1.7, transition:"all 0.2s ease", boxShadow:"0 2px 8px rgba(0,0,0,0.04)" },
  sendBtn: { width:52, height:52, border:"none", borderRadius:14, fontSize:20, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 4px 16px rgba(0,0,0,0.1)" },
};
