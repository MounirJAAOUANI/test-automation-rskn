"use strict";
/**
 * server/lib/jobQueue.js
 *
 * File d'attente en mémoire pour les tâches longues (build Flutter).
 * Permet de découpler l'exécution longue de la connexion SSE.
 *
 * Architecture :
 *  1. Client POSTe → serveur crée un job, lance en background, répond {jobId}
 *  2. Client poll GET /api/jobs/:jobId/logs toutes les 3s
 *  3. Le job tourne sans limite de temps côté serveur
 *  4. Quand terminé, le poll retourne status=done + data final
 */

const { randomUUID } = require("crypto");

/**
 * Structure d'un job :
 * {
 *   id:        string,
 *   status:    "running" | "done" | "error",
 *   logs:      Array<{ ts, msg, type }>,
 *   result:    object | null,      // données finales quand done
 *   error:     string | null,      // message d'erreur si error
 *   createdAt: number,
 * }
 */
const jobs = new Map();

// Nettoyer les vieux jobs toutes les 30 min (garde 2h)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 30 * 60 * 1000);

/**
 * Crée un nouveau job et retourne un handle pour le piloter.
 * @returns {{ jobId: string, log: fn, done: fn, fail: fn }}
 */
function createJob() {
  const jobId = randomUUID();
  const job   = {
    id:        jobId,
    status:    "running",
    logs:      [],
    result:    null,
    error:     null,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  const ts = () =>
    new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  return {
    jobId,

    /** Ajoute un log au job */
    log(msg, type = "info") {
      job.logs.push({ ts: ts(), msg, type });
    },

    /** Termine le job avec succès */
    done(data) {
      job.status = "done";
      job.result = data;
    },

    /** Termine le job en erreur */
    fail(err) {
      job.status = "error";
      job.error  = err?.message || String(err);
      job.logs.push({ ts: ts(), msg: `❌ ${job.error}`, type: "error" });
    },
  };
}

/**
 * Retourne l'état d'un job à partir du curseur (index du dernier log lu).
 * @param {string} jobId
 * @param {number} cursor — index de départ (0 = tout depuis le début)
 * @returns {{ found, status, newLogs, cursor, result, error }}
 */
function getJobStatus(jobId, cursor = 0) {
  const job = jobs.get(jobId);
  if (!job) return { found: false };

  const newLogs = job.logs.slice(cursor);
  return {
    found:   true,
    status:  job.status,          // "running" | "done" | "error"
    newLogs,                       // uniquement les nouveaux logs
    cursor:  job.logs.length,     // prochain curseur à passer
    result:  job.result,
    error:   job.error,
  };
}

module.exports = { createJob, getJobStatus };
