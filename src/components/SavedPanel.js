"use client";
// src/components/SavedPanel.js
// Pannello "Storico Salvati": elenco delle risposte salvate, con copia e rimozione.
// Spostato da page.js senza cambiare il comportamento.
// Lo stato (savedItems) e removeSaved restano in page.js perché servono anche al
// pulsante con il contatore e al salvataggio sotto le risposte.

import { S } from "../lib/styles";

export default function SavedPanel({ items, modes, onRemove, onClose, hov }) {
  return (
    <div style={S.drawerOverlay} onClick={onClose}>
      <div style={S.drawer} onClick={e => e.stopPropagation()}>
        <div style={S.drawerHeader}>
          <span style={S.drawerTitle}>💾 Storico Salvati</span>
          <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={onClose} {...hov}>✕ chiudi</button>
        </div>
        {items.length === 0 ? (
          <div style={S.drawerEmpty}><div style={{ fontSize:36, marginBottom:12 }}>📭</div><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#bbb" }}>Nessuna risposta salvata ancora.</p></div>
        ) : (
          <div style={S.drawerList}>
            {items.map(item => {
              const m = modes.find(x => x.id === item.mode);
              return (
                <div key={item.id} style={S.drawerItem}>
                  <div style={S.drawerItemMeta}><span style={{ ...S.modeTag, background:m?.color||"#999" }}>{m?.label}</span><span style={S.platformTag}>{item.platform}</span><span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#ccc", marginLeft:"auto" }}>{item.savedAt}</span></div>
                  <pre style={S.drawerItemText}>{item.content}</pre>
                  <div style={{ display:"flex", gap:10 }}>
                    <button className="copy-btn" style={S.copyBtn} onClick={() => navigator.clipboard.writeText(item.content)} {...hov}>⎘ copia →</button>
                    <button className="copy-btn" style={{ ...S.copyBtn, color:"#E8354A" }} onClick={() => onRemove(item.id)} {...hov}>✕ rimuovi</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
