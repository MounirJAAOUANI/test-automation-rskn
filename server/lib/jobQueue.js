"use strict";
/**
 * server/lib/jobQueue.js — avec persistance SQLite
 *
 * Les jobs survivent aux redémarrages Railway.
 * Chaque job est sauvegardé immédiatement dans la DB.
 *
 * Aucune dépendance externe — utilise sqlite3 du système.
 */

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

// ─── Initialiser la DB ─────────────────────────────────────────────────────
const dbPath = path.join(process.cwd(), "jobs.sqlite");
let db;

function initDB() {
  try {
    const Database = require("better-sqlite3");
    db = new Database(dbPath);

    // Créer la table si elle n'existe pas
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT,
        logs TEXT,
        result TEXT,
        error TEXT,
        createdAt INTEGER
      )
    `);

    // Nettoyer les vieux jobs (> 8h)
    const cutoff = Date.now() - 8 * 60 * 60 * 1000;
    const deleted = db
      .prepare("DELETE FROM jobs WHERE createdAt < ?")
      .run(cutoff).changes;
    if (deleted > 0) console.log(`🧹 Nettoyage DB: ${deleted} jobs supprimés`);

    console.log(
      "✅ SQLite DB initialisée — jobs vont persister aux redémarrages",
    );
  } catch (err) {
    console.warn(
      `⚠️  better-sqlite3 non installé — fallback en mémoire.\n` +
        `   Pour persistence: npm install better-sqlite3\n` +
        `   Erreur: ${err.message}`,
    );
    db = null; // Fallback en mémoire
  }
}

// Fallback en mémoire si DB non dispo
const jobsInMemory = new Map();

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

  // Sauvegarder immédiatement en DB
  if (db) {
    db.prepare(
      "INSERT OR REPLACE INTO jobs (id, status, logs, result, error, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      jobId,
      job.status,
      JSON.stringify(job.logs),
      null,
      null,
      job.createdAt,
    );
  } else {
    jobsInMemory.set(jobId, job);
  }

  console.log(`[createJob] Nouveau job créé: ${jobId}`);

  return {
    jobId,

    log(msg, type = "info") {
      const logEntry = { ts: ts(), msg, type };

      if (db) {
        // Récupérer, modifier, resauvegarder
        const row = db.prepare("SELECT logs FROM jobs WHERE id = ?").get(jobId);
        if (row) {
          const logs = JSON.parse(row.logs);
          logs.push(logEntry);
          db.prepare("UPDATE jobs SET logs = ? WHERE id = ?").run(
            JSON.stringify(logs),
            jobId,
          );
        }
      } else {
        const j = jobsInMemory.get(jobId);
        if (j) j.logs.push(logEntry);
      }

      console.log(`[${jobId}] ${msg}`);
    },

    done(data) {
      if (db) {
        db.prepare("UPDATE jobs SET status = ?, result = ? WHERE id = ?").run(
          "done",
          JSON.stringify(data),
          jobId,
        );
      } else {
        const j = jobsInMemory.get(jobId);
        if (j) {
          j.status = "done";
          j.result = data;
        }
      }
      console.log(`[${jobId}] Job terminé avec succès`);
    },

    fail(err) {
      const errMsg = err?.message || String(err);
      if (db) {
        const row = db.prepare("SELECT logs FROM jobs WHERE id = ?").get(jobId);
        if (row) {
          const logs = JSON.parse(row.logs);
          logs.push({ ts: ts(), msg: `❌ ${errMsg}`, type: "error" });
          db.prepare(
            "UPDATE jobs SET status = ?, error = ?, logs = ? WHERE id = ?",
          ).run("error", errMsg, JSON.stringify(logs), jobId);
        }
      } else {
        const j = jobsInMemory.get(jobId);
        if (j) {
          j.status = "error";
          j.error = errMsg;
          j.logs.push({ ts: ts(), msg: `❌ ${errMsg}`, type: "error" });
        }
      }
      console.log(`[${jobId}] Job échoué: ${errMsg}`);
    },
  };
}

/**
 * Retourne l'état d'un job.
 */
function getJobStatus(jobId, cursor = 0) {
  let job;

  if (db) {
    const row = db
      .prepare("SELECT id, status, logs, result, error FROM jobs WHERE id = ?")
      .get(jobId);
    if (!row) return { found: false };

    const logs = JSON.parse(row.logs);
    const result = row.result ? JSON.parse(row.result) : null;
    return {
      found: true,
      status: row.status,
      newLogs: logs.slice(cursor),
      cursor: logs.length,
      result,
      error: row.error,
    };
  } else {
    job = jobsInMemory.get(jobId);
    if (!job) return { found: false };

    return {
      found: true,
      status: job.status,
      newLogs: job.logs.slice(cursor),
      cursor: job.logs.length,
      result: job.result,
      error: job.error,
    };
  }
}

/**
 * Retourne tous les jobs (pour debug).
 */
function getAllJobs() {
  if (db) {
    const rows = db.prepare("SELECT id, status FROM jobs").all();
    return rows.map((r) => ({ id: r.id, status: r.status }));
  } else {
    return Array.from(jobsInMemory.values()).map((j) => ({
      id: j.id,
      status: j.status,
    }));
  }
}

// Initialiser au démarrage
initDB();

module.exports = { createJob, getJobStatus, getAllJobs };
