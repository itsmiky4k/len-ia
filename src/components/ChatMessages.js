"use client";
// src/components/ChatMessages.js
// Elenco dei messaggi della chat condivisa (Brainstorm, Caption, Hashtag, Video):
// schermata iniziale, bolle utente/assistente, pulsanti sotto le risposte, analisi caption.
// Spostato da page.js senza cambiare il comportamento.
// Stato e logica (messages, sendMessage, saveToHistory, analyzeCaption...) restano in page.js.

import { useRef, useEffect } from "react";
import { S } from "../lib/styles";
import { canAccessTab } from "../lib/roles";

// Definito fuori dal componente: così non viene ricreato a ogni render.
function ScoreBar({ score }) {
  const col = score>=8?"#2BB5AE":score>=5?"#F07D2A":"#E8354A";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ flex:1, height:6, background:"var(--track)", borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", borderRadius:3, width:`${score*10}%`, background:col, transition:"width 1s cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
      <span style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:900, color:col, minWidth:28 }}>{score}</span>
      <span style={{ fontSize:11, color:"#bbb" }}>/10</span>
    </div>
  );
}

export default function ChatMessages({
  messages, analyses, savedItems, analyzing, loading,
  currentMode, modes, userName, role,
  onRetry, onSave, onAnalyze, onSetMode, onSetInput, onBoardDraft, hov,
}) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, loading]);

  return (
    <div style={S.chat}>
      {messages.length===0 && (
        <div style={S.emptyState}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:52, color:"#E8354A", animation:"floatSymbol 3s ease-in-out infinite", lineHeight:1 }}>✦</div>
          <p style={S.emptyTitle}>Ciao, {userName}!</p>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontStyle:"italic", color:"#E8354A" }}>Sono LEN-IA, la tua assistente per i progetti del Collettivo LEN.</p>
          <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:"#aaa", lineHeight:1.8 }}>Scegli una modalita, usa i prompt suggeriti,<br />o scrivi direttamente cosa ti serve.</p>
          <div style={{ width:40, height:2, background:"linear-gradient(90deg,#E8354A,#2BB5AE)", borderRadius:2, margin:"6px 0" }} />
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
            {modes.filter(m=>m.id!=="analytics" && canAccessTab(role, m.id)).map(m => <button key={m.id} className="quick-chip" onClick={()=>onSetMode(m.id)} style={{ ...S.chip, ...(m.gradient ? { border:"1.5px solid transparent", color:"var(--text2)", background:`linear-gradient(var(--surface),var(--surface)) padding-box, ${m.gradient} border-box` } : { borderColor:`${m.color}55`, color:m.color, background:`${m.color}08` }) }} {...hov}>{m.label}</button>)}
          </div>
        </div>
      )}
      {messages.map((msg,i) => {
        const isUser = msg.role==="user";
        const analysis = analyses[i];
        const isSaved = savedItems.some(x=>x.content===msg.content);
        const msgMode = modes.find(m=>m.id===msg.mode);
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
                    <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A", fontWeight:600 }} onClick={()=>onRetry(msg.retryHistory)} {...hov}>↺ riprova →</button>
                  ) : (
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                      <button className="copy-btn" style={S.copyBtn} onClick={()=>navigator.clipboard.writeText(msg.content)} {...hov}>⎘ copia →</button>
                      <button className="copy-btn" style={{ ...S.copyBtn, color:isSaved?"#7B4FA0":"#ccc" }} onClick={()=>onSave(msg,i)} {...hov}>{isSaved?"✓ salvato":"💾 salva"}</button>
                      {(msg.mode==="caption"||msg.mode==="reels") && !analysis && <button className="copy-btn" style={{ ...S.copyBtn, color:"#2BB5AE" }} onClick={()=>onAnalyze(i,msg.content)} disabled={analyzing===i} {...hov}>{analyzing===i?"⏳ analisi in corso…":"📊 analizza"}</button>}
                    </div>
                  )}
                  {msg.mode==="brainstorm" && (
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                      <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#bbb", letterSpacing:"0.08em", textTransform:"uppercase", alignSelf:"center" }}>porta in →</span>
                      {[
                        { id:"caption", label:"✍️ Caption", color:"#2BB5AE" },
                        { id:"hashtag", label:"# Hashtag",  color:"#7B4FA0" },
                        { id:"reels",   label:"🎬 Video",    color:"#E8354A" },
                        { id:"bacheca", label:"📋 Bacheca", color:"#7B4FA0" },
                      ].filter(t => canAccessTab(role, t.id)).map(t => (
                        <button key={t.id} className="quick-chip" onClick={()=>{ if (t.id==="bacheca") { onBoardDraft({ title:"", description: msg.content.slice(0,3500) }); onSetMode("bacheca"); } else { onSetMode(t.id); onSetInput(msg.content.slice(0,200)); } }}
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
  );
}
