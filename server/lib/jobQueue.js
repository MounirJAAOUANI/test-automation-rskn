"use strict";
/**
 * server/lib/jobQueue.js — Persistance JSON simple
 *
 * - Zéro dépendance externe
 * - Sauvegarde dans jobs.json
 * - Survit aux redémarrages Railway
 * - Logs détaillés partout
 */

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const jobsFile = path.join(process.cwd(), "jobs.json");

console.log(`[jobQueue] Initialisation — fichier: ${jobsFile}`);

// ─── Charger jobs du fichier ────────────────────────────────────────────────
function loadJobs() {
  try {
    if (fs.existsSync(jobsFile)) {
      const data = fs.readFileSync(jobsFile, "utf8");
      const jobs = JSON.parse(data || "{}");
      console.log(
        `[jobQueue] Chargé ${Object.keys(jobs).length} jobs depuis le fichier`,
      );
      return jobs;
    }
  } catch (err) {
    console.warn(
      `[jobQueue] Erreur lecture fichier: ${err.message} — recommence vierge`,
    );
  }
  return {};
}

// ─── Sauvegarder jobs dans le fichier ────────────────────────────────────────
function saveJobs(jobs) {
  try {
    fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2), "utf8");
    console.log(`[jobQueue] Sauvegardé ${Object.keys(jobs).length} jobs`);
  } catch (err) {
    console.error(`[jobQueue] ERREUR SAUVEGARDE: ${err.message}`);
  }
}

// ─── Nettoyer les vieux jobs ────────────────────────────────────────────────
function cleanOldJobs(jobs) {
  const cutoff = Date.now() - 8 * 60 * 60 * 1000; // 8h
  let deleted = 0;
  for (const [id, job] of Object.entries(jobs)) {
    if (job.createdAt < cutoff) {
      delete jobs[id];
      deleted++;
    }
  }
  if (deleted > 0) {
    console.log(`[jobQueue] Nettoyage: ${deleted} jobs supprimés`);
    saveJobs(jobs);
  }
  return jobs;
}

// État global
let jobs = loadJobs();
jobs = cleanOldJobs(jobs);

console.log(`[jobQueue] ✅ Prêt — ${Object.keys(jobs).length} jobs en attente`);

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Crée un nouveau job.
 */
function createJob() {
  const jobId = randomUUID();

  console.log(`\n[createJob] CRÉATION job: ${jobId}`);

  const ts = () =>
    new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const job = {
    id: jobId,
    status: "running",
    logs: [],
    result: null,
    error: null,
    createdAt: Date.now(),
  };

  // Sauvegarder immédiatement
  jobs[jobId] = job;
  saveJobs(jobs);

  console.log(`[createJob] Job créé et SAUVEGARDÉ: ${jobId}`);
  console.log(`[createJob] Total jobs en fichier: ${Object.keys(jobs).length}`);

  return {
    jobId,

    log(msg, type = "info") {
      const logEntry = { ts: ts(), msg, type };
      const j = jobs[jobId];
      if (j) {
        j.logs.push(logEntry);
        saveJobs(jobs); // Sauvegarder après chaque log
      }
      console.log(`[${jobId}] ${msg}`);
    },

    done(data) {
      const j = jobs[jobId];
      if (j) {
        j.status = "done";
        j.result = data;
        saveJobs(jobs);
      }
      console.log(`[${jobId}] ✅ DONE — sauvegardé`);
    },

    fail(err) {
      const errMsg = err?.message || String(err);
      const j = jobs[jobId];
      if (j) {
        j.status = "error";
        j.error = errMsg;
        j.logs.push({ ts: ts(), msg: `❌ ${errMsg}`, type: "error" });
        saveJobs(jobs);
      }
      console.log(`[${jobId}] ❌ FAIL — ${errMsg} — sauvegardé`);
    },
  };
}

/**
 * Retourne l'état d'un job.
 */
function getJobStatus(jobId, cursor = 0) {
  console.log(
    `[getJobStatus] Demande: ${jobId} | Jobs existants: ${Object.keys(jobs).join(", ")}`,
  );

  const job = jobs[jobId];

  if (!job) {
    console.log(`[getJobStatus] NOT FOUND: ${jobId}`);
    return { found: false };
  }

  const newLogs = job.logs.slice(cursor);
  console.log(
    `[getJobStatus] FOUND: ${jobId} | statut: ${job.status} | nouveaux logs: ${newLogs.length}`,
  );

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
  return Object.values(jobs).map((j) => ({
    id: j.id,
    status: j.status,
    logsCount: j.logs.length,
  }));
}

module.exports = { createJob, getJobStatus, getAllJobs };
