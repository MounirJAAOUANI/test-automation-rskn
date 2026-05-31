/**
 * client/src/api.js — VERSION FINALE
 *
 * Deux modes de communication :
 *
 * 1. runAgent()   → SSE pour les agents courts (< 60s)
 *    Utilisé pour : market-scout, app-architect, logo-gen, code-gen,
 *                   screenshots, aso, compliance
 *
 * 2. runBuildAgent() → HTTP POST + polling pour build-deploy (5-15 min)
 *    Le serveur répond immédiatement avec { jobId }
 *    Le client poll GET /api/jobs/:jobId toutes les 3s
 *    Pas de SSE → pas de timeout Railway
 */

const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, "")
  : "/api";

// ─── SSE — pour les agents courts ────────────────────────────────────────────
/**
 * Lance un agent via SSE.
 * @param {string}   agentId
 * @param {object}   payload
 * @param {function} onLog    — ({ event, type, msg, ts })
 * @param {function} onDone   — (data)
 * @param {function} onError  — ({ msg, detail })
 */
export async function runAgent(agentId, payload, onLog, onDone, onError) {
  let response;

  try {
    response = await fetch(`${BASE}/agents/${agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    onError({ msg: "Serveur inaccessible", detail: err.message });
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    onError({ msg: `Erreur HTTP ${response.status}`, detail: text });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (err) {
      onError({ msg: "Connexion interrompue", detail: err.message });
      return;
    }

    const { done, value } = chunk;
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      // Ignorer les commentaires SSE (heartbeat ": ping")
      if (line.startsWith(":")) continue;
      if (!line.startsWith("data: ")) continue;

      const raw = line.slice(6).trim();
      if (!raw) continue;

      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }

      if (event.event === "log") onLog(event);
      if (event.event === "done") {
        onDone(event.data);
        return;
      }
      if (event.event === "error") {
        onError(event);
        return;
      }
    }
  }
}

// ─── POLLING — pour build-deploy ─────────────────────────────────────────────
/**
 * Lance le build-deploy via HTTP POST (réponse immédiate avec jobId)
 * puis poll GET /api/jobs/:jobId toutes les POLL_INTERVAL ms.
 *
 * Pas de SSE → pas de timeout Railway quelle que soit la durée.
 *
 * @param {object}   payload
 * @param {function} onLog    — ({ ts, msg, type })
 * @param {function} onDone   — (data)
 * @param {function} onError  — ({ msg, detail })
 */
export async function runBuildAgent(payload, onLog, onDone, onError) {
  const POLL_INTERVAL = 3000; // 3s entre chaque poll
  const MAX_POLLS = 2700; // 900 × 3s = 45 min max côté client

  // 1. Lancer le job (réponse en ~1s)
  let jobId;
  try {
    const res = await fetch(`${BASE}/agents/build-deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      onError({ msg: `Erreur HTTP ${res.status}`, detail: text });
      return;
    }
    const data = await res.json();
    jobId = data.jobId;
    if (!jobId) {
      onError({
        msg: "Pas de jobId retourné par le serveur",
        detail: JSON.stringify(data),
      });
      return;
    }
  } catch (err) {
    onError({ msg: "Serveur inaccessible", detail: err.message });
    return;
  }

  // 2. Poll jusqu'à done ou error
  let cursor = 0;
  let polls = 0;

  while (polls < MAX_POLLS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    polls++;

    let state;
    try {
      const res = await fetch(`${BASE}/jobs/${jobId}?cursor=${cursor}`);
      if (!res.ok) {
        // Erreur réseau temporaire — on continue
        onLog({
          ts: now(),
          msg: `Poll réseau error (${res.status}) — retry...`,
          type: "warn",
        });
        continue;
      }
      state = await res.json();
    } catch (err) {
      onLog({
        ts: now(),
        msg: `Poll réseau error — retry... (${err.message})`,
        type: "warn",
      });
      continue;
    }

    if (!state.found) {
      onError({ msg: "Job introuvable sur le serveur" });
      return;
    }

    // Envoyer les nouveaux logs au composant
    for (const log of state.newLogs || []) {
      onLog(log);
    }
    cursor = state.cursor;

    // Terminé avec succès
    if (state.status === "done") {
      onDone(state.result);
      return;
    }

    // Terminé en erreur
    if (state.status === "error") {
      onError({ msg: state.error, detail: state.error });
      return;
    }

    // status === "running" → continuer le polling
  }

  // Timeout client (ne devrait pas arriver)
  onError({ msg: "Timeout client après 45 minutes — vérifiez GitHub Actions" });
}

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
export async function healthCheck() {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

// ─── HELPER ──────────────────────────────────────────────────────────────────
function now() {
  return new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
