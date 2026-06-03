"use strict";
/**
 * server/lib/github-poller.js — WITH LIVE LOGS
 *
 * Gère la surveillance des workflows GitHub Actions.
 * Affiche les logs du polling en temps réel dans l'application.
 */

const githubLib = require("./github");

// Map des pollers actifs : jobId → intervalHandle
const activePollers = new Map();

/**
 * Démarre la surveillance d'un workflow GitHub.
 * Affiche les logs du polling en temps réel.
 *
 * @param {string} jobId - ID du job
 * @param {string} workflowRunId - ID du run GitHub Actions
 * @param {function} onLog - Callback(msg, type) pour afficher les logs
 * @param {function} onStatusChange - Callback(status) quand le statut change
 */
async function startGitHubPoller(jobId, workflowRunId, onLog, onStatusChange) {
  // Déjà en cours ?
  if (activePollers.has(jobId)) {
    onLog?.(`[Poller déjà actif pour ce job]`, "info");
    return;
  }

  onLog?.(
    `Démarrage surveillance GitHub Actions (runId: ${workflowRunId})`,
    "info",
  );

  let attempts = 0;
  const maxAttempts = 90; // 15 minutes (90 * 10s)
  const startTime = Date.now();

  const poll = async () => {
    try {
      attempts++;
      const status = await githubLib.getWorkflowStatus(workflowRunId);

      // Calculer le temps écoulé
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      const timeStr = `${mins}min ${secs}s`;

      if (status === "completed") {
        onLog?.(`✅ Build GitHub terminé (${timeStr})`, "success");
        clearInterval(pollerId);
        activePollers.delete(jobId);
        onStatusChange?.(status, { runId: workflowRunId });
        return;
      }

      if (status === "failure") {
        onLog?.(`❌ Build GitHub échoué (${timeStr})`, "error");
        clearInterval(pollerId);
        activePollers.delete(jobId);
        onStatusChange?.(status, { runId: workflowRunId });
        return;
      }

      // Status : queued ou in_progress
      const displayStatus = status === "queued" ? "en attente" : "en cours";
      onLog?.(`Build GitHub ${displayStatus} (${timeStr})...`, "data");

      console.log(
        `[github-poller] Run ${workflowRunId} → ${status} (${timeStr})`,
      );
    } catch (err) {
      onLog?.(`⚠️  Erreur poll GitHub: ${err.message}`, "warn");
      console.warn(`[github-poller] Poll error: ${err.message}`);
    }

    // Timeout ?
    if (attempts >= maxAttempts) {
      const elapsedMin = Math.floor((Date.now() - startTime) / 1000 / 60);
      onLog?.(`⏱️ Timeout après ${elapsedMin} minutes`, "warn");
      clearInterval(pollerId);
      activePollers.delete(jobId);
      onStatusChange?.("timeout", {});
    }
  };

  // Lancer le polling toutes les 10 secondes
  const pollerId = setInterval(poll, 10000);
  activePollers.set(jobId, pollerId);

  // Première vérification immédiate
  await poll();
}

/**
 * Arrête la surveillance d'un workflow.
 */
function stopGitHubPoller(jobId) {
  const pollerId = activePollers.get(jobId);
  if (pollerId) {
    clearInterval(pollerId);
    activePollers.delete(jobId);
    console.log(`[github-poller] Poller arrêté pour ${jobId}`);
  }
}

/**
 * Retourne les pollers actifs (pour debug).
 */
function getActivePollers() {
  return Array.from(activePollers.keys());
}

module.exports = { startGitHubPoller, stopGitHubPoller, getActivePollers };
