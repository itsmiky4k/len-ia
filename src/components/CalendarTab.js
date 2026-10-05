"use client";
// src/components/CalendarTab.js
// Calendario editoriale (solo editor/admin). Spostato da page.js senza cambiare il comportamento.
//
// Resta in page.js (caricato all'accesso, come prima): calEvents. Qui dentro vive lo stato
// di navigazione: mese, anno, giorno selezionato.

import { useState, useRef } from "react";
import { dbPost, dbPut, dbDelete } from "../lib/api";
import { S } from "../lib/styles";

const CAL_COLORS = ["#E8354A","#7B4FA0","#2BB5AE"];
const MONTHS_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAYS_IT   = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
const getDaysInMonth = (y, m) => new Date(y, m+1, 0).getDate();
const getFirstDayOfMonth = (y, m) => { const d = new Date(y, m, 1).getDay(); return d===0?6:d-1; };

export default function CalendarTab({ calEvents, setCalEvents, userName }) {
  const [calMonth, setCalMonth]         = useState(new Date().getMonth());
  const [calYear, setCalYear]           = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay]   = useState(null);
  const [editCalEvent, setEditCalEvent] = useState(null);

  const deleteCalEvent = async (id) => {
    await dbDelete("calendar_events", id);
    setCalEvents(p => p.filter(e => e.id !== id));
  };

  const eventsForDay = (day) => {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return calEvents.filter(e => e.date === dateStr || e.event_date === dateStr);
  };

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
                style={{ minHeight:72, background: sel?"rgba(123,79,160,0.08)":isToday(day)?"rgba(232,53,74,0.04)":"#fff", border:`1.5px solid ${sel?"#7B4FA0":isToday(day)?"rgba(232,53,74,0.3)":"var(--border)"}`, borderRadius:10, padding:"6px 7px", cursor:"pointer", position:"relative" }}>
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
          <div key={selectedDay} style={{ marginTop:16, background:"var(--surface)", border:"1.5px solid rgba(123,79,160,0.25)", borderRadius:14, padding:"18px 22px", animation:"slideUp 0.25s cubic-bezier(0.22,1,0.36,1)" }}>
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
}
