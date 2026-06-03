/**
 * client/src/api.js
 *
 * FIX : Délai de 3-5s avant de commencer le polling
 * Laisse le backend se stabiliser après redémarrage Railway
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

/**
 * SSE pour agents courts (< 60s)
 * Reconnecte automatiquement si connection perdue
 */
export async function runAgent(endpoint, payload, onLog) {
  return new Promise((resolve, reject) => {
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
      resolve(data.data);
    });

    eventSource.addEventListener("error", (e) => {
      eventSource.close();
      if (!hasEnded) {
        reject(new Error(e.data || "SSE error"));
      }
    });

    // Fallback pour les navigateurs qui ne supportent pas addEventListener
    eventSource.onerror = () => {
      eventSource.close();
      if (!hasEnded) {
        reject(new Error("EventSource connection lost"));
      }
    };
  });
}

/**
 * Polling pour les jobs longs (build-deploy, 3-15 min)
 *
 * FIX : Attends 3-5 secondes avant de commencer le polling
 * → Laisse le backend se stabiliser après redémarrage Railway
 */
export async function runBuildAgent(payload, onLog) {
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

  // ÉTAPE 2 : Attendre 3-5 secondes que le backend se stabilise
  // (Railway peut redémarrer pendant le POST)
  onLog?.({ type: "info", msg: "Stabilisation du serveur..." });
  await new Promise((r) => setTimeout(r, 4000));

  // ÉTAPE 3 : Commencer le polling
  onLog?.({ type: "info", msg: "Démarrage du polling..." });

  let cursor = 0;
  let attempts = 0;
  const maxAttempts = 2700; // 45 minutes (900 * 10s)

  while (attempts < maxAttempts) {
    try {
      const pollRes = await fetch(`${API_URL}/jobs/${jobId}?cursor=${cursor}`);

      if (!pollRes.ok) {
        if (pollRes.status === 404) {
          attempts++;
          onLog?.({
            type: "warn",
            msg: `Poll réseau error (404) — retry... (${attempts}/${maxAttempts})`,
          });
          await new Promise((r) => setTimeout(r, 10000)); // Retry après 10s
          continue;
        }
        throw new Error(`Poll failed: ${pollRes.status}`);
      }

      const state = await pollRes.json();

      // Afficher les nouveaux logs
      if (state.newLogs && state.newLogs.length > 0) {
        for (const log of state.newLogs) {
          onLog?.(log);
        }
      }

      // Mettre à jour le cursor
      cursor = state.cursor;

      // Job terminé ?
      if (state.status === "done") {
        onLog?.({
          type: "success",
          msg: "✅ Job complété",
        });
        return state.result;
      }

      // Job en erreur ?
      if (state.status === "error") {
        onLog?.({
          type: "error",
          msg: `❌ Job échoué: ${state.error}`,
        });
        throw new Error(state.error || "Job failed");
      }

      // Job en cours, attendre avant de re-poller
      attempts++;
      await new Promise((r) => setTimeout(r, 10000));
    } catch (err) {
      if (err.message.includes("404")) {
        attempts++;
        onLog?.({
          type: "warn",
          msg: `Poll réseau error (${err.message}) — retry...`,
        });
        await new Promise((r) => setTimeout(r, 10000));
      } else {
        throw err;
      }
    }
  }

  throw new Error(
    `❌ Timeout client après ${(maxAttempts * 10) / 60} minutes — vérifiez GitHub Actions`,
  );
}

/**
 * Health check — vérifier que le backend est prêt
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export default { runAgent, runBuildAgent, checkHealth };
