/**
 * client/src/api.js
 *
 * FIX : Appelle correctement onDone et onError callbacks
 * Attend 4s avant de poller (stabilisation Railway)
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

/**
 * SSE pour agents courts (< 60s)
 */
export async function runAgent(endpoint, payload, onLog, onDone, onError) {
  return new Promise((resolve) => {
    const eventSource = new EventSource(
      `${API_URL}${endpoint}?${new URLSearchParams(Object.entries(payload || {}))}`,
    );

    let hasEnded = false;

    eventSource.addEventListener("log", (e) => {
      const data = JSON.parse(e.data);
      onLog?.(data);
    });

    eventSource.addEventListener("done", (e) => {
      hasEnded = true;
      eventSource.close();
      const data = JSON.parse(e.data);
      onDone?.(data.data);
      resolve(data.data);
    });

    eventSource.addEventListener("error", (e) => {
      eventSource.close();
      if (!hasEnded) {
        const err = new Error(e.data || "SSE error");
        onError?.({ msg: err.message });
        resolve(null);
      }
    });

    eventSource.onerror = () => {
      eventSource.close();
      if (!hasEnded) {
        const err = new Error("EventSource connection lost");
        onError?.({ msg: err.message });
        resolve(null);
      }
    };
  });
}

/**
 * Polling pour jobs longs (build-deploy, 3-15 min)
 *
 * FIX CRITIQUE :
 * - Appelle onDone et onError (pas de Promise return)
 * - Attend 4s avant polling (laisse Railway redémarrer)
 * - Retry auto en cas de 404
 */
export function runBuildAgent(payload, onLog, onDone, onError) {
  // Lancer le polling en background (pas d'await)
  (async () => {
    try {
      // ÉTAPE 1 : POST pour créer le job
      onLog?.({ type: "info", msg: "Création du job..." });

      const postRes = await fetch(`${API_URL}/agents/build-deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!postRes.ok) {
        throw new Error(`POST failed: ${postRes.status}`);
      }

      const { jobId } = await postRes.json();
      onLog?.({ type: "data", msg: `Job créé: ${jobId}` });

      // ÉTAPE 2 : Attendre 4 secondes que le backend se stabilise
      onLog?.({ type: "info", msg: "Stabilisation du serveur..." });
      await new Promise((r) => setTimeout(r, 4000));

      // ÉTAPE 3 : Commencer le polling
      onLog?.({ type: "info", msg: "Démarrage du polling..." });

      let cursor = 0;
      let attempts = 0;
      const maxAttempts = 900; // 15 minutes

      while (attempts < maxAttempts) {
        try {
          const pollRes = await fetch(
            `${API_URL}/jobs/${jobId}?cursor=${cursor}`,
          );

          if (!pollRes.ok) {
            if (pollRes.status === 404) {
              attempts++;
              onLog?.({
                type: "warn",
                msg: `Poll réseau error (404) — retry...`,
              });
              await new Promise((r) => setTimeout(r, 10000));
              continue;
            }
            throw new Error(`Poll failed: ${pollRes.status}`);
          }

          const state = await pollRes.json();

          // Afficher nouveaux logs
          if (state.newLogs && state.newLogs.length > 0) {
            for (const log of state.newLogs) {
              onLog?.(log);
            }
          }

          cursor = state.cursor;

          // Terminé ?
          if (state.status === "done") {
            onLog?.({ type: "success", msg: "✅ Job complété" });
            onDone?.(state.result);
            return;
          }

          // Erreur ?
          if (state.status === "error") {
            onLog?.({ type: "error", msg: `❌ ${state.error}` });
            onError?.({ msg: state.error || "Job failed" });
            return;
          }

          // Continuer polling
          attempts++;
          await new Promise((r) => setTimeout(r, 10000));
        } catch (err) {
          if (err.message.includes("404")) {
            attempts++;
            onLog?.({ type: "warn", msg: `Poll error — retry...` });
            await new Promise((r) => setTimeout(r, 10000));
          } else {
            throw err;
          }
        }
      }

      // Timeout
      onError?.({ msg: "Timeout client après 15 minutes" });
    } catch (err) {
      onError?.({ msg: err.message || String(err) });
    }
  })();
}

export default { runAgent, runBuildAgent };
