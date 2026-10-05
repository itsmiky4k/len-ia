// src/lib/api.js
// Chiamate dal browser verso le API di LEN-IA (/api/chat e /api/supabase).
// Condivise da page.js e da tutti i componenti delle tab.
// Ogni richiesta porta il token dell'utente loggato.

import { supabase } from "./supabase";
import { resolveMessages, stripOldAttachments } from "./attachments";

export const authHeaders = async () => {
  const { data:{ session:s } } = await supabase.auth.getSession();
  return s ? { Authorization: `Bearer ${s.access_token}` } : {};
};
export const callAI = async (body) => {
  const headers = { "Content-Type":"application/json", ...(await authHeaders()) };
  // allegati vecchi -> segnaposto; riferimenti storage:// -> URL firmati freschi
  const messages = await resolveMessages(stripOldAttachments(body.messages));
  const res = await fetch("/api/chat", { method:"POST", headers, body:JSON.stringify({ ...body, messages }) });
  return res.json();
};
export const dbGet = async (table, user) => {
  const headers = await authHeaders();
  return fetch(`/api/supabase?table=${table}&user=${encodeURIComponent(user)}`, { headers }).then(r=>r.json());
};
export const dbPost = async (table, record) => {
  const headers = { "Content-Type":"application/json", ...(await authHeaders()) };
  return fetch("/api/supabase", { method:"POST", headers, body:JSON.stringify({table,record}) }).then(r=>r.json());
};
export const dbDelete = async (table, id) => {
  const headers = { "Content-Type":"application/json", ...(await authHeaders()) };
  return fetch("/api/supabase", { method:"DELETE", headers, body:JSON.stringify({table,id}) }).then(r=>r.json());
};
export const dbPut = async (table, id, record) => {
  const headers = { "Content-Type":"application/json", ...(await authHeaders()) };
  return fetch("/api/supabase", { method:"PUT", headers, body:JSON.stringify({table,id,record}) }).then(r=>r.json());
};
