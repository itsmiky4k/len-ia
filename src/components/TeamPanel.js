"use client";
// src/components/TeamPanel.js
// Pannello Team (solo admin): elenco membri e cambio ruolo.
// Spostato da page.js senza cambiare il comportamento.
// page.js lo monta solo quando il pannello è aperto: {showTeam && <TeamPanel .../>}
// e i profili si caricano ogni volta che si apre.

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { S } from "../lib/styles";

export default function TeamPanel({ onClose, currentUserId, hov }) {
  const [teamProfiles, setTeamProfiles] = useState([]);

  useEffect(() => {
    let cancelled = false;
    supabase.from("profiles").select("*").order("created_at", { ascending: true })
      .then(({ data }) => { if (!cancelled) setTeamProfiles(data || []); });
    return () => { cancelled = true; };
  }, []);

  const changeRole = async (id, newRole) => {
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", id);
    if (error) { alert("Errore aggiornamento ruolo: " + error.message); return; }
    setTeamProfiles(p => p.map(x => x.id === id ? { ...x, role: newRole } : x));
  };

  return (
    <div style={S.drawerOverlay} onClick={onClose}>
      <div style={S.drawer} onClick={e => e.stopPropagation()}>
        <div style={S.drawerHeader}>
          <span style={S.drawerTitle}>👥 Team del Collettivo</span>
          <button className="clear-btn" style={{ ...S.clearBtn, fontSize:12 }} onClick={onClose} {...hov}>✕ chiudi</button>
        </div>
        {teamProfiles.length === 0 ? (
          <div style={S.drawerEmpty}><div style={{ fontSize:36, marginBottom:12 }}>👤</div><p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#bbb" }}>Nessun membro trovato.</p></div>
        ) : (
          <div style={S.drawerList}>
            {teamProfiles.map(p => (
              <div key={p.id} style={S.drawerItem}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                  <div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:700 }}>{p.display_name || "(nome non impostato)"}</div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#aaa" }}>{p.id === currentUserId ? "tu" : p.id.slice(0,8)}</div>
                  </div>
                  <select value={p.role} onChange={e => changeRole(p.id, e.target.value)} disabled={p.id === currentUserId} style={{ ...S.briefInput, padding:"6px 10px", fontSize:12, width:"auto" }}>
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
  );
}
