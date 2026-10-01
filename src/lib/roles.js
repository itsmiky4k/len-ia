// src/lib/roles.js
// Fonte unica di verità per ruoli e permessi.
// Importabile sia dal client (nascondere le tab) sia dal server (/api/chat).
// Non contiene dipendenze: tenerlo così.
 
export const ROLES = ["ospite", "membro", "editor", "admin"];
 
// Ruolo da usare se il profilo manca o ha un valore sconosciuto: il più basso.
export const DEFAULT_ROLE = "ospite";
 
export const normalizeRole = (role) => (ROLES.includes(role) ? role : DEFAULT_ROLE);
 
const MEMBRO_UP = ["membro", "editor", "admin"];
const EDITOR_UP = ["editor", "admin"];
 
// Tab visibili per ruolo. "calendar" = calendario editoriale dei post.
// "bacheca" e "appuntamenti" arrivano con i prossimi passi.
export const TAB_ACCESS = {
  brainstorm:   MEMBRO_UP,
  live:         ["ospite", ...MEMBRO_UP],
  bacheca:      ["ospite", ...MEMBRO_UP],
  appuntamenti: ["ospite", ...MEMBRO_UP],
  caption:      EDITOR_UP,
  hashtag:      EDITOR_UP,
  reels:        EDITOR_UP, // tab "Video"
  analytics:    EDITOR_UP,
  calendar:     EDITOR_UP,
};
 
// Modalità AI che il server accetta, con i ruoli che le possono usare.
// (il client manderà solo il nome della mode, i prompt stanno sul server)
export const MODE_ACCESS = {
  brainstorm:       MEMBRO_UP,
  live:             MEMBRO_UP,
  caption:          EDITOR_UP,
  caption_analysis: EDITOR_UP,
  hashtag:          EDITOR_UP,
  reels:            EDITOR_UP,
  analytics:        EDITOR_UP,
};
 
export const canAccessTab = (role, tab) => !!TAB_ACCESS[tab]?.includes(normalizeRole(role));
export const canUseMode   = (role, mode) => !!MODE_ACCESS[mode]?.includes(normalizeRole(role));
export const tabsForRole  = (role) => Object.keys(TAB_ACCESS).filter((t) => canAccessTab(role, t));
 
// Scrittura generale: tutto tranne l'ospite (sola lettura).
export const canWrite = (role) => normalizeRole(role) !== "ospite";
export const isEditorOrAdmin = (role) => EDITOR_UP.includes(normalizeRole(role));
export const isAdmin = (role) => normalizeRole(role) === "admin";
 
