// src/lib/ics.js
// Costruisce un calendario iCalendar (.ics) dagli appuntamenti.
// Nessuna dipendenza: funzione pura, facile da provare.

const pad = (n) => String(n).padStart(2, "0");

// 2026-10-10T16:00:00Z -> 20261010T160000Z
const utc = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

// Testo: va protetto da \  ;  ,  e a-capo
const esc = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// Righe oltre 75 byte vanno spezzate (senza tagliare i caratteri accentati o le emoji)
function fold(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/**
 * @param {Array<{id,title,description,location,starts_at,ends_at,updated_at}>} events
 * @param {{ name?: string, alarmMinutes?: number }} opts
 */
export function buildIcs(events, { name = "LEN - Appuntamenti", alarmMinutes = 30 } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Collettivo LEN//LEN-IA//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const e of events) {
    const start = new Date(e.starts_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
    const stamp = new Date(e.updated_at || e.starts_at);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@len-ia`);
    lines.push(`DTSTAMP:${utc(stamp)}`);
    lines.push(`DTSTART:${utc(start)}`);
    lines.push(`DTEND:${utc(end)}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (alarmMinutes > 0) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${alarmMinutes}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
