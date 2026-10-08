"use client";
// src/components/ChatInput.js
// Area di scrittura della chat condivisa: anteprima allegati, selettore file, campo di testo, invio.
// Spostato da page.js senza cambiare il comportamento.
// Lo stato (input, attachments, uploading) e sendMessage restano in page.js perché
// sendMessage li legge e li svuota. Qui vivono solo la scelta dei file e la loro rimozione.

import { useRef } from "react";
import { uploadAttachment, deleteAttachment, MAX_FILES_PER_MESSAGE } from "../lib/attachments";
import { S } from "../lib/styles";

const PLACEHOLDERS = {
  caption:    "es. foto del backstage dell'ultima performance, mood underground...",
  hashtag:    "es. mostra collettiva di arte digitale e musica sperimentale",
  reels:      "es. teaser del nuovo singolo, atmosfera notturna e misteriosa — dimmi di che video si tratta!",
  brainstorm: "es. voglio rinnovare l'identita visiva del collettivo, da dove partiamo?",
};

export default function ChatInput({
  mode, currentMode, input, setInput,
  attachments, setAttachments, uploading, setUploading,
  loading, canWrite, onSend, hov,
}) {
  const fileInputRef = useRef(null);

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

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } };

  return (
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
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple style={{ display:"none" }} onChange={handleFileSelect} />
        <button className="clear-btn" disabled={uploading || attachments.length >= MAX_FILES_PER_MESSAGE} onClick={()=>fileInputRef.current?.click()} style={{ ...S.clearBtn, width:52, height:52, borderRadius:14, fontSize:20, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", padding:0, border:`1.5px solid ${currentMode.color}55`, color:currentMode.color, opacity:uploading?0.6:1 }} {...hov} title="Allega immagini o PDF">{uploading ? "…" : "+"}</button>
        <textarea style={{ ...S.textarea, border:`1.5px solid ${currentMode.color}55`, boxShadow:`0 2px 12px ${currentMode.color}15` }} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
          placeholder={PLACEHOLDERS[mode] || "Scrivi qui..."}
          rows={3} />
        <button className="send-btn" onClick={()=>onSend()} disabled={(!input.trim()&&!attachments.length)||loading||uploading||!canWrite} title={!canWrite?"Il tuo ruolo è sola lettura":""} style={{ ...S.sendBtn, background:(!input.trim()&&!attachments.length)||loading||!canWrite?"#e8e4df":currentMode.color, color:(!input.trim()&&!attachments.length)||loading?"#bbb":"#fff" }} {...hov}>↑</button>
      </div>
      <p style={{ maxWidth:860, margin:"8px auto 0", fontFamily:"'DM Sans',sans-serif", fontSize:10, color:"#ccc", letterSpacing:"0.08em" }}>enter per inviare · shift+enter per andare a capo</p>
    </div>
  );
}
