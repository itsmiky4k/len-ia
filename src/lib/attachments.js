// src/lib/attachments.js
// Gestione allegati su Supabase Storage (bucket privato "attachments").
//
// Flusso:
//  1. il file viene caricato subito su Storage (immagini: ridimensionate e compresse prima)
//  2. nei messaggi salviamo solo un riferimento leggero:  storage://<percorso>
//  3. poco prima di chiamare l'AI, i riferimenti diventano URL firmati (validi 1 ora)
//     -> nessun base64 nelle richieste, nella cronologia o nelle sessioni salvate.
 
import { supabase } from "./supabase";
 
export const BUCKET = "attachments";
export const MAX_FILES_PER_MESSAGE = 5;
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024; // originale, prima della compressione
 
const IMG_MAX_SIDE = 1568; // oltre questo lato il modello ridimensiona comunque
const THUMB_SIDE = 120;
const REF_PREFIX = "storage://";
const SIGNED_URL_SECONDS = 3600;
const KEEP_ATTACHMENTS_IN_LAST_N_TURNS = 2;
 
// ── immagini ──
const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.width || !img.height) reject(new Error("immagine non leggibile"));
      else resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("formato immagine non supportato"));
    };
    img.src = url;
  });
 
const drawScaled = (img, maxSide) => {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // PNG trasparenti: sfondo bianco invece che nero
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
};
 
const canvasToBlob = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compressione fallita"))), "image/jpeg", quality)
  );
 
async function prepareImage(file) {
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error("immagine troppo grande (max 25 MB)");
  const img = await loadImage(file);
  const blob = await canvasToBlob(drawScaled(img, IMG_MAX_SIDE), 0.85);
  const thumb = drawScaled(img, THUMB_SIDE).toDataURL("image/jpeg", 0.7);
  return { blob, thumb };
}
 
// ── upload / delete ──
// Ritorna { path, mediaType, name, preview, isPdf }
export async function uploadAttachment(file) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("non autenticato");
 
  const isPdf = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");
  if (!isPdf && !isImage) throw new Error("formato non supportato (solo immagini e PDF)");
 
  let body, contentType, preview = null;
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) throw new Error("PDF troppo pesante (max 10 MB)");
    body = file;
    contentType = "application/pdf";
  } else {
    const prepared = await prepareImage(file);
    body = prepared.blob;
    contentType = "image/jpeg";
    preview = prepared.thumb;
  }
 
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(-50) || "file";
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const path = `${session.user.id}/${stamp}-${base}.${isPdf ? "pdf" : "jpg"}`;
 
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(error.message);
 
  return { path, mediaType: contentType, name: file.name, preview, isPdf };
}
 
export async function deleteAttachment(path) {
  await supabase.storage.from(BUCKET).remove([path]);
}
 
// ── blocchi per i messaggi ──
// Riferimento leggero: lo trasformiamo in URL firmato solo al momento dell'invio.
export const toBlock = (att) => ({
  type: att.isPdf ? "document" : "image",
  source: { type: "url", url: `${REF_PREFIX}${att.path}` },
});
 
const isRefBlock = (b) =>
  b && (b.type === "image" || b.type === "document") && typeof b.source?.url === "string" && b.source.url.startsWith(REF_PREFIX);
 
const nameFromRef = (ref) => ref.split("/").pop().replace(/^\d+-[a-z0-9]+-/, "");
 
// Tiene gli allegati solo negli ultimi N turni con allegati; i più vecchi diventano un segnaposto
// di testo, così i follow-up costano meno e restano leggeri.
export function stripOldAttachments(messages, keep = KEEP_ATTACHMENTS_IN_LAST_N_TURNS) {
  const withFiles = [];
  messages.forEach((m, i) => {
    if (Array.isArray(m.content) && m.content.some(isRefBlock)) withFiles.push(i);
  });
  const keepSet = new Set(withFiles.slice(-keep));
  return messages.map((m, i) => {
    if (!withFiles.includes(i) || keepSet.has(i)) return m;
    return {
      ...m,
      content: m.content.map((b) =>
        isRefBlock(b) ? { type: "text", text: `[allegato precedente: ${nameFromRef(b.source.url)}]` } : b
      ),
    };
  });
}
 
// Sostituisce i riferimenti storage:// con URL firmati freschi.
export async function resolveMessages(messages) {
  const paths = new Set();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) if (isRefBlock(b)) paths.add(b.source.url.slice(REF_PREFIX.length));
  }
  if (paths.size === 0) return messages;
 
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls([...paths], SIGNED_URL_SECONDS);
  if (error) throw new Error(error.message);
  const signed = new Map((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
 
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content.map((b) => {
        if (!isRefBlock(b)) return b;
        const url = signed.get(b.source.url.slice(REF_PREFIX.length));
        return url
          ? { type: b.type, source: { type: "url", url } }
          : { type: "text", text: "[allegato non più disponibile]" };
      }),
    };
  });
}
 