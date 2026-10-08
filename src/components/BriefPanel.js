"use client";
// src/components/BriefPanel.js
// Pannello "Brief di Stile": toni, parole chiave ed esempi che guidano caption e hashtag.
// Spostato da page.js senza cambiare il comportamento.
// Lo stato (brief, briefSaved) e saveBrief restano in page.js perché il brief viene
// letto all'accesso, mandato all'AI e mostrato dal pallino sul pulsante "🎨 brief".

import { S } from "../lib/styles";

const TONE_OPTIONS = ["Ironico","Poetico","Diretto","Provocatorio","Caldo","Misterioso","Giocoso","Urgente"];

export default function BriefPanel({ brief, setBrief, briefSaved, onSave, hov }) {
  return (
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
          <button className="brief-save-btn" onClick={onSave} style={S.saveBtn} {...hov}>{briefSaved?"✓ salvato nel cloud!":"salva brief ☁️ →"}</button>
        </div>
      </div>
    </div>
  );
}
