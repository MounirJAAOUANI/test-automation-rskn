"use strict";
/**
 * server/lib/jobQueue.js — Redis persistence (ou fallback fichier)
 *
 * - Si REDIS_URL disponible → utilise Redis (persistant à 100%)
 * - Sinon → fallback fichier local (perdu au redémarrage)
 */

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const jobsFile = path.join(process.cwd(), "jobs.json");

// ─── REDIS OPTIONNEL ──────────────────────────────────────────────────────────
let redis = null;

if (process.env.REDIS_URL) {
  try {
    const Redis = require("redis");
    redis = Redis.createClient({ url: process.env.REDIS_URL });
    redis.on("error", (err) => console.warn(`⚠️  Redis error: ${err.message}`));
    redis
      .connect()
      .then(() => {
        console.log("✅ Redis connected — jobs vont persister");
      })
      .catch((err) => {
        console.warn(
          `⚠️  Redis connect failed: ${err.message} — fallback fichier`,
        );
        redis = null;
      });
  } catch (e) {
    console.warn(`⚠️  Redis not available (${e.message}) — fallback fichier`);
    redis = null;
  }
}

// ─── FALLBACK FICHIER ─────────────────────────────────────────────────────────

function loadJobsFile() {
  try {
    if (fs.existsSync(jobsFile)) {
      const data = fs.readFileSync(jobsFile, "utf8");
      return JSON.parse(data || "{}");
    }
  } catch (err) {
    console.warn(`⚠️  Erreur lecture fichier: ${err.message}`);
  }
  return {};
}

function saveJobsFile(jobs) {
  try {
    fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2), "utf8");
  } catch (err) {
    console.error(`❌ Erreur sauvegarde: ${err.message}`);
  }
}

// État global (fichier)
let jobsMemory = loadJobsFile();

console.log(
  `[jobQueue] Initialisation — ${redis ? "Redis" : "fichier"} | ${Object.keys(jobsMemory).length} jobs existants`,
);

// ─── API ──────────────────────────────────────────────────────────────────────

async function saveJob(jobId, job) {
  if (redis) {
    try {
      await redis.set(`job:${jobId}`, JSON.stringify(job));
    } catch (err) {
      console.warn(`⚠️  Redis save failed: ${err.message}`);
      jobsMemory[jobId] = job; // Fallback
    }
  } else {
    jobsMemory[jobId] = job;
    saveJobsFile(jobsMemory);
  }
}

async function getJob(jobId) {
  if (redis) {
    try {
      const data = await redis.get(`job:${jobId}`);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn(`⚠️  Redis get failed: ${err.message}`);
      return jobsMemory[jobId] || null;
    }
  } else {
    return jobsMemory[jobId] || null;
  }
}

async function getAllJobsKeys() {
  if (redis) {
    try {
      const keys = await redis.keys("job:*");
      return keys.map((k) => k.replace("job:", ""));
    } catch (err) {
      console.warn(`⚠️  Redis keys failed: ${err.message}`);
      return Object.keys(jobsMemory);
    }
  } else {
    return Object.keys(jobsMemory);
  }
}

/**
 * Crée un nouveau job.
 */
function createJob() {
  const jobId = randomUUID();

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
  saveJob(jobId, job);
  console.log(`[createJob] Job créé et SAUVEGARDÉ: ${jobId}`);

  return {
    jobId,

    async log(msg, type = "info") {
      const logEntry = { ts: ts(), msg, type };
      const j = await getJob(jobId);
      if (j) {
        j.logs.push(logEntry);
        await saveJob(jobId, j);
      }
      console.log(`[${jobId}] ${msg}`);
    },

    async done(data) {
      const j = await getJob(jobId);
      if (j) {
        j.status = "done";
        j.result = data;
        await saveJob(jobId, j);
      }
      console.log(`[${jobId}] ✅ DONE`);
    },

    async fail(err) {
      const errMsg = err?.message || String(err);
      const j = await getJob(jobId);
      if (j) {
        j.status = "error";
        j.error = errMsg;
        j.logs.push({ ts: ts(), msg: `❌ ${errMsg}`, type: "error" });
        await saveJob(jobId, j);
      }
      console.log(`[${jobId}] ❌ FAIL — ${errMsg}`);
    },
  };
}

/**
 * Retourne l'état d'un job.
 */
async function getJobStatus(jobId, cursor = 0) {
  const job = await getJob(jobId);

  if (!job) {
    const keys = await getAllJobsKeys();
    console.log(
      `[getJobStatus] NOT FOUND: ${jobId} | jobs existants: ${keys.join(", ")}`,
    );
    return { found: false };
  }

  const newLogs = job.logs.slice(cursor);
  console.log(
    `[getJobStatus] FOUND: ${jobId} | ${job.status} | ${newLogs.length} nouveaux logs`,
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
 * Retourne tous les jobs (debug).
 */
async function getAllJobs() {
  const keys = await getAllJobsKeys();
  const jobs = [];
  for (const key of keys) {
    const job = await getJob(key);
    if (job)
      jobs.push({ id: job.id, status: job.status, logsCount: job.logs.length });
  }
  return jobs;
}

module.exports = { createJob, getJobStatus, getAllJobs };
