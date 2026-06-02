"use strict";
const { randomUUID } = require("crypto");

const jobs = new Map();

// Cleanup toutes les 4h (garde 8h)
setInterval(
  () => {
    const cutoff = Date.now() - 8 * 60 * 60 * 1000;
    let deleted = 0;
    for (const [id, job] of jobs.entries()) {
      if (job.createdAt < cutoff) {
        jobs.delete(id);
        deleted++;
      }
    }
    if (deleted > 0) console.log(`🧹 Nettoyage : ${deleted} jobs supprimés`);
  },
  4 * 60 * 60 * 1000,
);

/**
 * Crée un nouveau job.
 */
function createJob() {
  const jobId = randomUUID();
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

  console.log(`[createJob] Nouveau job créé: ${jobId}`);

  return {
    jobId,
    log(msg, type = "info") {
      if (job.status !== "running") return; // Ignore si déjà terminé
      job.logs.push({ ts: ts(), msg, type });
      console.log(`[${jobId}] ${msg}`);
    },
    done(data) {
      job.status = "done";
      job.result = data;
      console.log(`[${jobId}] Job terminé avec succès`);
    },
    fail(err) {
      job.status = "error";
      job.error = err?.message || String(err);
      job.logs.push({ ts: ts(), msg: `❌ ${job.error}`, type: "error" });
      console.log(`[${jobId}] Job échoué: ${job.error}`);
    },
  };
}

/**
 * Retourne l'état d'un job.
 */
function getJobStatus(jobId, cursor = 0) {
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

/**
 * Retourne tous les jobs (pour debug).
 */
function getAllJobs() {
  return Array.from(jobs.values());
}

module.exports = { createJob, getJobStatus, getAllJobs };
