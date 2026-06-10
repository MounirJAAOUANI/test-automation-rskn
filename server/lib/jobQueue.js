"use strict";
/**
 * server/lib/jobQueue.js — FIXED
 *
 * FIXES:
 * 1. setWorkflowRunId() relance immédiatement le poller GitHub
 * 2. initRedis() relance les pollers avec callbacks corrects
 * 3. Tous les callbacks de poller mettent à jour le job correctement
 */

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { startGitHubPoller } = require("./github-poller");

let redis = null;
let jobsMemory = {};

// ─── INIT REDIS ───────────────────────────────────────────────────────────────
async function initRedis() {
  if (process.env.REDIS_URL) {
    try {
      const Redis = require("redis");
      redis = Redis.createClient({ url: process.env.REDIS_URL });
      redis.on("error", (err) =>
        console.warn(`⚠️  Redis error: ${err.message}`),
      );

      await redis.connect();
      console.log("✅ Redis connected");

      // ── Reprendre les jobs `running` après redémarrage ──
      const jobKeys = await redis.keys("job:*");
      console.log(
        `[jobQueue] Scanning ${jobKeys.length} jobs après redémarrage...`,
      );

      for (const key of jobKeys) {
        const data = await redis.get(key);
        if (data) {
          const job = JSON.parse(data);
          if (job.status === "running" && job.workflowRunId) {
            console.log(
              `[jobQueue] 🔄 Reprise surveillance: ${job.id} (run ${job.workflowRunId})`,
            );

            // ── RELANCER LE POLLER avec callback correct ──
            startGitHubPoller(
              job.id,
              job.workflowRunId,
              // onLog callback
              async (msg, type = "info") => {
                const j = await getJob(job.id);
                if (j) {
                  j.logs.push({
                    ts: new Date().toLocaleTimeString("fr-FR"),
                    msg,
                    type,
                  });
                  await saveJob(job.id, j);
                }
                console.log(`[${job.id}] ${msg}`);
              },
              // onStatusChange callback — TRÈS IMPORTANT
              async (status, data) => {
                console.log(`[poller] Job ${job.id} → status: ${status}`);

                if (status === "completed") {
                  const j = await getJob(job.id);
                  if (j) {
                    j.status = "done";
                    j.result = data;
                    await saveJob(job.id, j);
                    console.log(`[jobQueue] ✅ Job ${job.id} marqué DONE`);
                  }
                } else if (status === "failure") {
                  const j = await getJob(job.id);
                  if (j) {
                    j.status = "error";
                    j.error = "GitHub Actions build failed";
                    await saveJob(job.id, j);
                    console.log(`[jobQueue] ❌ Job ${job.id} marqué ERROR`);
                  }
                } else if (status === "timeout") {
                  const j = await getJob(job.id);
                  if (j) {
                    j.status = "error";
                    j.error = "Build timeout (> 15 min)";
                    await saveJob(job.id, j);
                    console.log(`[jobQueue] ⏱️ Job ${job.id} timeout`);
                  }
                }
              },
            );
          }
        }
      }

      return redis;
    } catch (e) {
      console.warn(`⚠️  Redis failed: ${e.message}`);
      redis = null;
    }
  }

  // Fallback fichier
  const jobsFile = path.join(process.cwd(), "jobs.json");
  try {
    if (fs.existsSync(jobsFile)) {
      jobsMemory = JSON.parse(fs.readFileSync(jobsFile, "utf8") || "{}");
      console.log(`[jobQueue] Chargé ${Object.keys(jobsMemory).length} jobs`);
    }
  } catch (err) {
    console.warn(`⚠️  Fichier erreur: ${err.message}`);
    jobsMemory = {};
  }

  return null;
}

// Init au démarrage
initRedis().catch((err) =>
  console.error(`[jobQueue] Init error: ${err.message}`),
);

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────

async function saveJob(jobId, job) {
  if (redis) {
    try {
      await redis.set(`job:${jobId}`, JSON.stringify(job), { EX: 86400 });
    } catch (err) {
      console.warn(`⚠️  Redis save failed: ${err.message}`);
      jobsMemory[jobId] = job;
    }
  } else {
    jobsMemory[jobId] = job;
    try {
      fs.writeFileSync(
        path.join(process.cwd(), "jobs.json"),
        JSON.stringify(jobsMemory, null, 2),
      );
    } catch (err) {
      console.error(`❌ Fichier save failed: ${err.message}`);
    }
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

async function getAllJobKeys() {
  if (redis) {
    try {
      return await redis.keys("job:*");
    } catch (err) {
      console.warn(`⚠️  Redis keys failed: ${err.message}`);
      return Object.keys(jobsMemory).map((k) => `job:${k}`);
    }
  } else {
    return Object.keys(jobsMemory).map((k) => `job:${k}`);
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

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
    workflowRunId: null,
    createdAt: Date.now(),
  };

  saveJob(jobId, job);
  console.log(`[createJob] Job créé: ${jobId}`);

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

    async setWorkflowRunId(runId) {
      const j = await getJob(jobId);
      if (j) {
        j.workflowRunId = runId;
        await saveJob(jobId, j);

        // ✅ FIX A: RELANCER IMMÉDIATEMENT LE POLLER
        console.log(
          `[setWorkflowRunId] Lancement poller pour job ${jobId} (run ${runId})`,
        );

        startGitHubPoller(
          jobId,
          runId,
          // onLog callback
          async (msg, type = "info") => {
            const job = await getJob(jobId);
            if (job) {
              job.logs.push({ ts: ts(), msg, type });
              await saveJob(jobId, job);
            }
            console.log(`[${jobId}] ${msg}`);
          },
          // onStatusChange callback ✅ TRÈS IMPORTANT
          async (status, data) => {
            console.log(`[poller] Job ${jobId} → status: ${status}`);

            if (status === "completed") {
              const job = await getJob(jobId);
              if (job) {
                job.status = "done";
                job.result = data;
                await saveJob(jobId, job);
                console.log(`[jobQueue] ✅ Job ${jobId} marqué DONE`);
              }
            } else if (status === "failure") {
              const job = await getJob(jobId);
              if (job) {
                job.status = "error";
                job.error = "GitHub Actions build failed";
                await saveJob(jobId, job);
                console.log(`[jobQueue] ❌ Job ${jobId} marqué ERROR`);
              }
            } else if (status === "timeout") {
              const job = await getJob(jobId);
              if (job) {
                job.status = "error";
                job.error = "Build timeout (> 15 min)";
                await saveJob(jobId, job);
                console.log(`[jobQueue] ⏱️ Job ${jobId} timeout`);
              }
            }
          },
        );
      }
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
      console.log(`[${jobId}] ❌ FAIL`);
    },
  };
}

/**
 * Retourne l'état d'un job.
 */
async function getJobStatus(jobId, cursor = 0) {
  const job = await getJob(jobId);

  if (!job) {
    return {
      found: false,
      status: "lost",
      error: "Job introuvable",
    };
  }

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
 * Retourne tous les jobs (debug).
 */
async function getAllJobs() {
  const keys = await getAllJobKeys();
  const jobs = [];
  for (const key of keys) {
    const jobId = key.replace("job:", "");
    const job = await getJob(jobId);
    if (job) {
      jobs.push({
        id: job.id,
        status: job.status,
        logsCount: job.logs.length,
      });
    }
  }
  return jobs;
}

module.exports = { createJob, getJobStatus, getAllJobs };
