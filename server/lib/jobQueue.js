"use strict";
/**
 * server/lib/jobQueue.js
 *
 * File d'attente en mémoire pour les tâches longues.
 * FIX : cleanup interval maintenant à 8h (au lieu de 2h)
 *       pour éviter que les jobs disparaissent pendant le polling.
 *
 * Architecture :
 *  1. POST /api/agents/build-deploy → crée job en background → répond {jobId}
 *  2. GET /api/jobs/:jobId → poll avec cursor
 */

const { randomUUID } = require("crypto");

const jobs = new Map();

// Nettoyer les vieux jobs toutes les 4h (garde 8h)
// → permet au polling de durer jusqu'à 15 min sans que le job disparaisse
setInterval(
  () => {
    const cutoff = Date.now() - 8 * 60 * 60 * 1000; // 8 heures
    let deleted = 0;
    for (const [id, job] of jobs.entries()) {
      if (job.createdAt < cutoff) {
        jobs.delete(id);
        deleted++;
      }
    }
    if (deleted > 0)
      console.log(`🧹 Nettoyage jobQueue : ${deleted} jobs supprimés`);
  },
  4 * 60 * 60 * 1000,
);

/**
 * Crée un nouveau job.
 * @returns {{ jobId: string, log: fn, done: fn, fail: fn }}
 */
function createJob() {
  const jobId = randomUUID();
  console.log(`[${process.pid}] createJob => ${jobId}`);
  const job = {
    id: jobId,
    status: "running",
    logs: [],
    result: null,
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  const ts = () =>
    new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return {
    jobId,
    log(msg, type = "info") {
      job.logs.push({ ts: ts(), msg, type });
    },
    done(data) {
      job.status = "done";
      job.result = data;
    },
    fail(err) {
      job.status = "error";
      job.error = err?.message || String(err);
      job.logs.push({ ts: ts(), msg: `❌ ${job.error}`, type: "error" });
    },
  };
}

/**
 * Retourne l'état d'un job.
 * @param {string} jobId
 * @param {number} cursor — index du dernier log lu
 * @returns {{ found, status, newLogs, cursor, result, error }}
 */
function getJobStatus(jobId, cursor = 0) {
  console.log(`[${process.pid}] getJobStatus => ${jobId}`);
  const job = jobs.get(jobId);
  if (!job) return { found: false };

  const newLogs = job.logs.slice(cursor);
  return {
    found: true,
    status: job.status,
    newLogs,
    cursor: job.logs.length,
    result: job.result,
    error: job.error,
  };
}

module.exports = { createJob, getJobStatus };
