"use client";
// src/components/AnalyticsTab.js
// Tab Analytics (solo editor/admin): elenco post, statistiche, form con lettura da
// screenshot e analisi AI. Spostato da page.js senza cambiare il comportamento.
//
// Resta in page.js (caricati all'accesso, come prima): posts e aiInsights, così
// cambiando tab non si perde l'ultima analisi. Qui dentro vive lo stato del form.

import { useState, useRef } from "react";
import { uploadAttachment, deleteAttachment, toBlock } from "../lib/attachments";
import { callAI, dbPost, dbPut, dbDelete } from "../lib/api";
import { S } from "../lib/styles";

const EMPTY_POST = { date:"", platform:"Instagram", format:"Post", caption:"", reach:0, impressions:0, likes:0, comments:0, saves:0, shares:0, followers_delta:0, hashtags:"" };
const FORMATS = ["Post","Reel","Story","Carosello"];

export default function AnalyticsTab({ posts, setPosts, aiInsights, setAiInsights, userName, hov }) {
  const [showAddPost, setShowAddPost]         = useState(false);
  const [editPost, setEditPost]               = useState(null);
  const [postDraft, setPostDraft]             = useState(EMPTY_POST);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const shotInputRef = useRef(null);
  const [extracting, setExtracting] = useState(false);
  const [shotNote, setShotNote]     = useState("");

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
    setPostDraft(EMPTY_POST); setShowAddPost(false); setEditPost(null); setAiInsights(null); setShotNote("");
  };
 
  const deletePost = async (id) => {
    await dbDelete("analytics_posts", id);
    setPosts(p => p.filter(x => x.id !== id));
    setAiInsights(null);
  };
 
  // Legge uno screenshot di Insights e compila i campi del form. L'AI non salva nulla:
  // la persona controlla i valori e preme "salva post". Campi non letti = restano come sono,
  // così si possono caricare più screenshot di fila (es. uno per le interazioni, uno per la reach).
  const fillFromScreenshot = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || extracting) return;
    setExtracting(true);
    setShotNote("");
    let att = null;
    try {
      att = await uploadAttachment(file);
      const data = await callAI({
        mode: "analytics_extract",
        messages: [{ role:"user", content:[ toBlock(att), { type:"text", text:"Leggi le statistiche di questo screenshot." } ] }],
      });
      const raw = (data?.content || []).map(b => b.text || "").join("");
      if (!raw) throw new Error(data?.error?.message || "risposta vuota");
      const x = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (x.error) { setShotNote("⚠️ Non sembra uno screenshot di statistiche."); return; }

      const patch = {}, filled = [];
      const nums = { reach:"reach", impressions:"impressioni", likes:"like", comments:"commenti", saves:"salvataggi", shares:"condivisioni", followers_delta:"delta follower" };
      for (const [k, label] of Object.entries(nums)) {
        const v = x[k];
        if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) { patch[k] = Math.round(Number(v)); filled.push(label); }
      }
      if (typeof x.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) { patch.date = x.date; filled.push("data"); }
      if (["Instagram","Facebook"].includes(x.platform)) { patch.platform = x.platform; filled.push("piattaforma"); }
      if (FORMATS.includes(x.format)) { patch.format = x.format; filled.push("formato"); }
      if (typeof x.hashtags === "string" && x.hashtags.trim()) { patch.hashtags = x.hashtags.trim().slice(0, 500); filled.push("hashtag"); }
      if (typeof x.caption === "string" && x.caption.trim()) { patch.caption = x.caption.trim().slice(0, 3000); filled.push("caption"); }

      if (!filled.length) { setShotNote("⚠️ Non sono riuscita a leggere dati da questo screenshot."); return; }
      setPostDraft(d => ({ ...d, ...patch }));
      setShotNote(`✓ Compilato: ${filled.join(", ")}. Controlla i valori prima di salvare. Puoi caricare un altro screenshot per i campi mancanti.`);
    } catch (err) {
      console.error(err);
      setShotNote(`⚠️ Lettura non riuscita: ${err?.message || "errore"}`);
    } finally {
      // lo screenshot serve solo per leggere i numeri: lo togliamo da Storage
      if (att?.path) deleteAttachment(att.path).catch(() => {});
      setExtracting(false);
    }
  };

  const getAiInsights = async () => {
    if (posts.length === 0) return;
    setLoadingInsights(true);
    let data = null;
    try {
      const summary = posts.map(p => `Data: ${p.date} | Piattaforma: ${p.platform} | Formato: ${p.format} | Reach: ${p.reach} | Impressioni: ${p.impressions} | Like: ${p.likes} | Commenti: ${p.comments} | Salvataggi: ${p.saves} | Condivisioni: ${p.shares} | Delta follower: ${p.followers_delta} | Hashtag: ${p.hashtags||"n/d"} | Caption: ${p.caption||"n/d"}`).join("\n");
      data = await callAI({ mode:"analytics", messages:[{ role:"user", content:`Analizza questi dati di ${posts.length} post:\n\n${summary}` }] });
      if (data?.error) throw new Error(data.error.message || "errore del server");
      const raw = (data?.content || []).map(b => b.text || "").join("");
      // prendo solo la parte tra la prima { e l'ultima }: regge anche testo o ``` attorno al JSON
      const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
      if (start === -1 || end <= start) throw new Error("risposta non in formato JSON");
      setAiInsights(JSON.parse(raw.slice(start, end + 1)));
    } catch (err) {
      console.error("analisi AI:", err, data);
      const msg = data?.stop_reason === "max_tokens" ? "risposta troncata (troppo lunga)" : (err?.message || "errore");
      setAiInsights({ error: msg });
    }
    finally { setLoadingInsights(false); }
  };

  const totalReach = posts.reduce((s,p) => s+Number(p.reach||0), 0);
  const totalLikes = posts.reduce((s,p) => s+Number(p.likes||0), 0);
  const avgEng = posts.length ? (posts.reduce((s,p) => s+Number(p.likes||0)+Number(p.comments||0)+Number(p.saves||0)+Number(p.shares||0), 0)/posts.length).toFixed(0) : 0;
  const topPost = posts.length ? posts.reduce((best,p) => (Number(p.likes||0)+Number(p.comments||0)+Number(p.saves||0)) > (Number(best.likes||0)+Number(best.comments||0)+Number(best.saves||0)) ? p : best) : null;

  const StatCard = ({ label, value, color }) => (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:4, boxShadow:"0 2px 8px rgba(0,0,0,0.04)" }}>
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

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px", maxWidth:900, width:"100%", margin:"0 auto" }}>
      <input ref={shotInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={fillFromScreenshot} />
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
        <div style={{ background:"var(--surface)", border:"1.5px solid rgba(22,163,74,0.25)", borderRadius:14, padding:"20px 24px", marginBottom:20, animation:"slideUp 0.4s cubic-bezier(0.22,1,0.36,1)" }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:700, color:"#16A34A", marginBottom:12 }}>✦ Analisi LEN-IA</div>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, fontStyle:"italic", color:"var(--text2)", lineHeight:1.7, marginBottom:14 }}>{aiInsights.sintesi}</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <div style={{ background:"rgba(43,181,174,0.06)", borderRadius:10, padding:"12px 14px" }}><div style={S.analysisSubLabel}>🏆 Top post</div><div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"var(--text2)", lineHeight:1.6 }}>{aiInsights.top_post?.motivo}</div></div>
            <div style={{ background:"rgba(232,53,74,0.06)", borderRadius:10, padding:"12px 14px" }}><div style={S.analysisSubLabel}>📉 Post debole</div><div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"var(--text2)", lineHeight:1.6 }}>{aiInsights.bottom_post?.motivo}</div></div>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
            {aiInsights.best_giorno && <span style={{ background:"rgba(22,163,74,0.08)", border:"1px solid rgba(22,163,74,0.2)", borderRadius:20, padding:"4px 14px", fontSize:11, fontWeight:600, color:"#16A34A" }}>📅 Miglior giorno: {aiInsights.best_giorno}</span>}
            {aiInsights.best_formato && <span style={{ background:"rgba(123,79,160,0.08)", border:"1px solid rgba(123,79,160,0.2)", borderRadius:20, padding:"4px 14px", fontSize:11, fontWeight:600, color:"#7B4FA0" }}>🎬 Formato top: {aiInsights.best_formato}</span>}
          </div>
          <div style={S.analysisSubLabel}>💡 Consigli strategici</div>
          {aiInsights.consigli?.map((c,i) => <div key={i} style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"var(--text2)", lineHeight:1.7, paddingLeft:4 }}>→ {c}</div>)}
        </div>
      )}
      {aiInsights?.error && (
        <div style={{ background:"rgba(232,53,74,0.06)", border:"1px solid rgba(232,53,74,0.25)", borderRadius:12, padding:"12px 16px", marginBottom:20, fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"var(--text2)", lineHeight:1.5 }}>
          ⚠️ Analisi non riuscita{typeof aiInsights.error === "string" ? `: ${aiInsights.error}` : ""}. Riprova tra poco.
        </div>
      )}
      {showAddPost && (
        <div style={{ background:"var(--surface)", border:"1.5px solid rgba(22,163,74,0.2)", borderRadius:14, padding:"20px 24px", marginBottom:20, animation:"slideDown 0.25s cubic-bezier(0.22,1,0.36,1)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom: shotNote ? 8 : 16 }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:700 }}>{editPost!==null?"✏️ Modifica post":"+ Nuovo post"}</div>
            <button className="clear-btn" disabled={extracting} onClick={()=>shotInputRef.current?.click()} style={{ ...S.clearBtn, fontSize:12, color:"#16A34A", border:"1.5px solid rgba(22,163,74,0.35)", opacity:extracting?0.6:1 }} {...hov} title="Carica uno screenshot di Insights e compila i campi">{extracting ? "leggo lo screenshot…" : "📷 compila da screenshot"}</button>
          </div>
          {shotNote && <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"var(--text2)", marginBottom:14, lineHeight:1.5 }}>{shotNote}</div>}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={S.briefLabel}>Data</label><input type="date" style={{ ...S.briefInput, padding:"8px 12px" }} value={postDraft.date} onChange={e=>setPostDraft(d=>({...d,date:e.target.value}))} /></div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={S.briefLabel}>Piattaforma</label><select style={{ ...S.briefInput, padding:"8px 12px" }} value={postDraft.platform} onChange={e=>setPostDraft(d=>({...d,platform:e.target.value}))}>{["Instagram","Facebook"].map(p=><option key={p}>{p}</option>)}</select></div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={S.briefLabel}>Formato</label><select style={{ ...S.briefInput, padding:"8px 12px" }} value={postDraft.format} onChange={e=>setPostDraft(d=>({...d,format:e.target.value}))}>{FORMATS.map(f=><option key={f}>{f}</option>)}</select></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:12 }}>{numInput("reach","Reach")}{numInput("impressions","Impressioni")}{numInput("likes","Like")}{numInput("comments","Commenti")}{numInput("saves","Salvataggi")}{numInput("shares","Condivisioni")}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>{numInput("followers_delta","Delta follower")}<div style={{ display:"flex", flexDirection:"column", gap:4 }}><label style={S.briefLabel}>Hashtag</label><input style={{ ...S.briefInput, padding:"8px 12px" }} placeholder="#len #musica…" value={postDraft.hashtags} onChange={e=>setPostDraft(d=>({...d,hashtags:e.target.value}))} /></div></div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:16 }}><label style={S.briefLabel}>Caption (opzionale)</label><textarea style={{ ...S.briefInput, minHeight:70, resize:"vertical" }} placeholder="Incolla la caption…" value={postDraft.caption} onChange={e=>setPostDraft(d=>({...d,caption:e.target.value}))} /></div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={()=>{ setShowAddPost(false); setEditPost(null); setPostDraft(EMPTY_POST); setShotNote(""); }} {...hov}>annulla</button>
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
              <div key={post.id} style={{ background:"var(--surface)", border:`1px solid ${isTop?"rgba(22,163,74,0.3)":"var(--border)"}`, borderRadius:12, padding:"14px 18px", boxShadow:isTop?"0 2px 12px rgba(22,163,74,0.1)":"0 2px 8px rgba(0,0,0,0.04)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    {isTop && <span style={{ background:"rgba(22,163,74,0.1)", border:"1px solid rgba(22,163,74,0.3)", borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:700, color:"#16A34A" }}>🏆 top</span>}
                    <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:700, color:"var(--text2)" }}>{post.date}</span>
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
}
