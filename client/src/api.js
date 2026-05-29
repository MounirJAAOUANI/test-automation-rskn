/**
 * api.js — Toutes les communications client → serveur.
 * Utilise SSE (Server-Sent Events) via fetch + ReadableStream
 * pour afficher les logs en temps réel.
 */

const BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * Lance un agent via SSE.
 * @param {string}   agentId    — ex: "market-scout"
 * @param {object}   payload    — données envoyées au serveur
 * @param {function} onLog      — appelé pour chaque log  : ({ event, type, msg, ts })
 * @param {function} onDone     — appelé quand terminé    : (data)
 * @param {function} onError    — appelé si erreur        : ({ msg, detail })
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

  // ─── Lecture SSE depuis le body stream ──────────────────────────────────
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

    // Parser les lignes SSE (format: "data: {...}\n\n")
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // garder le fragment incomplet

    for (const line of lines) {
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

/**
 * Vérifie que le serveur est joignable.
 * @returns {{ ok: boolean, mode: string, debug: boolean } | null}
 */
export async function healthCheck() {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
