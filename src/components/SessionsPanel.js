"use client";
// src/components/SessionsPanel.js
// Pannello "Sessioni Brainstorm": elenco delle sessioni salvate (nuova, riprendi, elimina).
// Spostato da page.js senza cambiare il comportamento.
// Stato e funzioni restano in page.js perché toccano messages, history e mode.

import { S } from "../lib/styles";

export default function SessionsPanel({ sessions, activeId, onNew, onLoad, onDelete, onClose, hov }) {
  return (
    <div style={S.drawerOverlay} onClick={onClose}>
      <div style={S.drawer} onClick={e => e.stopPropagation()}>
        <div style={S.drawerHeader}>
          <span style={S.drawerTitle}>💡 Sessioni Brainstorm</span>
          <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={onClose} {...hov}>✕ chiudi</button>
        </div>
        <div style={{ padding:"12px 20px", borderBottom:"1px solid var(--border)" }}>
          <button className="brief-save-btn" onClick={onNew} style={{ ...S.saveBtn, background:"linear-gradient(135deg,#E8354A,#7B4FA0)", width:"100%", textAlign:"center", padding:"10px" }} {...hov}>+ Nuova sessione</button>
        </div>
        {sessions.length === 0 ? (
          <div style={S.drawerEmpty}><div style={{ fontSize:36, marginBottom:12 }}>💭</div><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#bbb" }}>Nessuna sessione salvata ancora.</p><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#ccc", marginTop:6 }}>Le sessioni vengono salvate automaticamente durante il brainstorming.</p></div>
        ) : (
          <div style={S.drawerList}>
            {sessions.map(s => (
              <div key={s.id} style={{ ...S.drawerItem, border:`1px solid ${activeId===s.id?"rgba(232,53,74,0.3)":"var(--border)"}`, background:activeId===s.id?"rgba(232,53,74,0.03)":"#FAFAF8" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13, fontWeight:700, color:"var(--text)", flex:1, marginRight:8 }}>{s.title}</div>
                  <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A", flexShrink:0 }} onClick={() => onDelete(s.id)} {...hov}>✕</button>
                </div>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#bbb" }}>{new Date(s.saved_at||s.created_at).toLocaleString("it-IT")}</div>
                <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A", fontWeight:600 }} onClick={() => onLoad(s)} {...hov}>
                  {activeId===s.id ? "✓ sessione attiva" : "→ riprendi"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
