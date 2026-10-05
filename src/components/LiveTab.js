"use client";
// src/components/LiveTab.js
// Sessione Live: stanza condivisa in tempo reale (Supabase realtime + presence) con LEN-IA.
// Spostato da page.js senza cambiare il comportamento.
//
// IMPORTANTE: page.js lo tiene SEMPRE montato (nascosto quando non sei sulla tab Live),
// così la stanza e la connessione realtime restano attive se passi a un'altra tab,
// come succedeva prima. Se lo si smontasse, uscire dalla tab = uscire dalla stanza.

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { callAI } from "../lib/api";
import { S } from "../lib/styles";

export default function LiveTab({ visible, userName, canWrite, hov }) {
  // Sessione Live (condivisa in tempo reale)
  const [liveCode, setLiveCode]         = useState("");
  const [activeLive, setActiveLive]     = useState(null);
  const [liveMessages, setLiveMessages] = useState([]);
  const [liveInput, setLiveInput]       = useState("");
  const [liveLoading, setLiveLoading]   = useState(false);
  const [liveOnline, setLiveOnline]     = useState([]);

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
  useEffect(() => { if (visible) liveBottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [liveMessages, liveLoading, visible]);

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

  // il pannello si richiama come funzione (non come <Componente />) per non rimontarlo a ogni render
  return (
    <div style={{ display: visible ? "flex" : "none", flexDirection:"column", flex:1, minHeight:0 }}>
      {LiveSessionPanel()}
    </div>
  );
}
