"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const AdmZip = require("adm-zip");

const { createJob, getJobStatus, getAllJobs } = require("./lib/jobQueue");
const { startGitHubPoller } = require("./lib/github-poller");

let claudeLib, openaiLib, playstoreLib, firebaseLib, githubLib, ppLib;

try {
  claudeLib = require("./lib/claude");
  console.log("✅ claudeLib");
} catch (e) {
  console.warn(`⚠️  claudeLib: ${e.message}`);
}

try {
  openaiLib = require("./lib/openai");
  console.log("✅ openaiLib");
} catch (e) {
  console.warn(`⚠️  openaiLib: ${e.message}`);
}

try {
  playstoreLib = require("./lib/playstore");
  console.log("✅ playstoreLib");
} catch (e) {
  console.warn(`⚠️  playstoreLib: ${e.message}`);
}

try {
  firebaseLib = require("./lib/firebase");
  console.log("✅ firebaseLib");
} catch (e) {
  console.warn(`⚠️  firebaseLib: ${e.message}`);
}

try {
  githubLib = require("./lib/github");
  console.log("✅ githubLib");
} catch (e) {
  console.warn(`⚠️  githubLib: ${e.message}`);
}

try {
  ppLib = require("./lib/privacypolicy");
  console.log("✅ ppLib");
} catch (e) {
  console.warn(`⚠️  ppLib: ${e.message}`);
}

const app = express();
const PORT = process.env.PORT || 4000;

const MODE_ENV = (process.env.MODE_ENV || "development").toLowerCase();
const MOT_DEBUG = (process.env.MOT_DEBUG || "false").toLowerCase() === "true";
const IS_PROD = MODE_ENV === "production";

console.log(
  `\n🔧 App Factory Server — mode: ${MODE_ENV} | debug: ${MOT_DEBUG}\n`,
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) =>
      !origin || allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("CORS")),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── SSE ──────────────────────────────────────────────────────────────────────
function createSSE(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const hb = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, 5000);

  const send = (obj) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  return {
    log(msg, type = "info") {
      send({
        event: "log",
        type,
        msg,
        ts: new Date().toLocaleTimeString("fr-FR"),
      });
    },
    done(data) {
      clearInterval(hb);
      send({ event: "done", data });
      res.end();
    },
    fail(err) {
      clearInterval(hb);
      const detail = MOT_DEBUG
        ? err?.stack || String(err)
        : err?.message || "Erreur";
      send({ event: "error", msg: err?.message || "Erreur", detail });
      res.end();
    },
  };
}

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: MODE_ENV, debug: MOT_DEBUG });
});

// ─── POLL ─────────────────────────────────────────────────────────────────────
app.get("/api/jobs/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const cursor = parseInt(req.query.cursor || "0", 10);
  const state = await getJobStatus(jobId, cursor);

  if (!state.found) {
    return res.json({
      found: false,
      status: "lost",
      error: "Job introuvable après redémarrage serveur",
      newLogs: [],
      cursor: 0,
    });
  }

  res.json(state);
});

// ─── ADMIN DEBUG ENDPOINT ──────────────────────────────────────────────────────
// Relancer la surveillance d'un job `running`
app.post("/api/admin/resume-job", async (req, res) => {
  const { jobId } = req.body;

  if (!jobId) {
    return res.status(400).json({ error: "jobId required" });
  }

  try {
    // Récupérer le job depuis Redis/fichier
    const job = await (async () => {
      const jobQueue = require("./lib/jobQueue");
      // Note: getJobStatus est public, mais il faudrait exporter getJob aussi
      // Pour simplifier, on accepte que ce endpoint soit une aide temporaire
      return null; // À implémenter : exporter getJob depuis jobQueue
    })();

    if (!job || !job.workflowRunId) {
      return res
        .status(404)
        .json({ error: "Job not found or no workflowRunId" });
    }

    console.log(
      `[admin] Relancement surveillance: ${jobId} (run ${job.workflowRunId})`,
    );

    // Relancer le poller
    startGitHubPoller(jobId, job.workflowRunId, async (status, data) => {
      if (status === "completed") {
        console.log(`[admin] Job ${jobId} marqué DONE`);
      } else if (status === "failure") {
        console.log(`[admin] Job ${jobId} marqué ERROR`);
      }
    });

    res.json({ ok: true, message: `Surveillance relancée pour ${jobId}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BUILD & DEPLOY ───────────────────────────────────────────────────────────
// ─── BUILD & DEPLOY — AVEC UPLOAD PLAY CONSOLE ───────────────────────────────
app.post("/api/agents/build-deploy", async (req, res) => {
  const { jobId, log, done, fail, setWorkflowRunId } = createJob();
  res.json({ jobId });

  (async () => {
    try {
      const {
        appName,
        packageId,
        code,
        listing,
        policyUrl,
        logoBase64,
        screenshots,
      } = req.body;

      if (!IS_PROD) {
        log("🟡 [DEV] Mode développement");
        await delay(500);
        log("Simulation build...");
        await delay(1000);
        return done({
          apkUrl: "#sim",
          apkName: `${packageId}-debug.apk`,
          apkSize: "~42 MB",
          playConsoleStatus: "DRAFT",
          draftUrl: "https://play.google.com/console",
        });
      }

      log("Préparation fichiers Flutter...");
      log("Déclenchement GitHub Actions...");

      const workflowRun = await githubLib.triggerBuild({
        appName,
        packageId,
        primaryColor: code?.theme?.primaryColor || "7C3AED",
      });

      log(`Workflow ID: ${workflowRun.id}`, "data");
      log(
        `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
        "data",
      );

      await setWorkflowRunId(workflowRun.id);
      log("Build en cours (3-8 min)...");

      // ── Lancer la surveillance GitHub ──
      startGitHubPoller(
        jobId,
        workflowRun.id,
        async (msg, type = "info") => {
          await log(msg, type);
        },
        async (status, data) => {
          if (status === "completed") {
            log("", "");
            log("📦 Téléchargement des artefacts...");

            let aabBuffer;
            try {
              const zipBuffer = await githubLib.downloadArtifact(
                workflowRun.id,
                "app-release-aab",
              );
              log(
                `ZIP téléchargé: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`,
                "data",
              );

              log("Extraction .aab depuis ZIP...");
              const zip = new AdmZip(zipBuffer);
              const aabEntry = zip
                .getEntries()
                .find((e) => e.entryName.endsWith(".aab"));

              if (!aabEntry) {
                const names = zip
                  .getEntries()
                  .map((e) => e.entryName)
                  .join(", ");
                throw new Error(`Aucun .aab trouvé. Fichiers: ${names}`);
              }

              aabBuffer = aabEntry.getData();
              log(
                `AAB extrait: ${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB ✅`,
                "success",
              );
            } catch (zipErr) {
              throw new Error(`Extraction artefacts: ${zipErr.message}`);
            }

            // ── ✅ NOUVEAU: UPLOAD À PLAY CONSOLE ──
            try {
              log("", "");
              log("🎯 Upload à Play Console...");

              const uploadResult = await playstoreLib.uploadAABToPlayConsole(
                packageId,
                aabBuffer,
                process.env.GOOGLE_PLAY_CREDENTIALS,
              );

              log(`✅ AAB uploadé à Play Console`, "success");
              log(`Version Code: ${uploadResult.versionCode}`, "data");
              log(
                `Size: ${(uploadResult.size / 1024 / 1024).toFixed(1)} MB`,
                "data",
              );

              log("", "");
              log("Prêt pour review Google Play →", "info");
              log("https://play.google.com/console", "info");

              done({
                apkUrl: uploadResult.url || "https://play.google.com/console",
                apkName: `${packageId}-release.aab`,
                apkSize: `${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB`,
                playConsoleStatus: "DRAFT (prêt pour review)",
                draftUrl: "https://play.google.com/console",
                versionCode: uploadResult.versionCode,
                workflowRunUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
              });
            } catch (uploadErr) {
              log(``, "");
              log(
                `⚠️  Erreur upload Play Console: ${uploadErr.message}`,
                "warn",
              );
              log(
                `AAB extraits mais non uploadés — tu peux l'uploader manuellement`,
                "info",
              );
              log(`https://play.google.com/console`, "info");

              done({
                apkUrl: "#manual",
                apkName: `${packageId}-release.aab`,
                apkSize: `${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB`,
                playConsoleStatus: "MANUAL UPLOAD REQUIRED",
                draftUrl: "https://play.google.com/console",
                error: uploadErr.message,
                workflowRunUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
              });
            }
          } else if (status === "failure") {
            log("", "");
            fail(new Error("❌ GitHub Actions build échoué"));
          } else if (status === "timeout") {
            log("", "");
            fail(new Error("⏱️ Build GitHub timeout (> 15 min)"));
          }
        },
      );
    } catch (err) {
      if (MOT_DEBUG) console.error(`[Job ${jobId}]`, err);
      fail(err);
    }
  })();
});

// ─── MARKET SCOUT ──────────────────────────────────────────────────────────────
app.post("/api/agents/market-scout", async (req, res) => {
  const sse = createSSE(res);
  const { niche } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(600);
    return sse.done({ niche, topCompetitors: [], analysis: {} });
  }

  try {
    sse.log(`Recherche "${niche}"...`);
    const apps = await playstoreLib.search(niche, 50);
    sse.log(`${apps.length} apps ✅`, "success");
    const analysis = await claudeLib.analyzeNiche(niche, apps.slice(0, 10));
    sse.done({ niche, topCompetitors: apps.slice(0, 8), analysis });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── APP ARCHITECT ────────────────────────────────────────────────────────────
app.post("/api/agents/app-architect", async (req, res) => {
  const sse = createSSE(res);
  const { niche, marketData } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(800);
    return sse.done({ appName: niche, packageId: "com.app.test" });
  }

  try {
    sse.log("Génération architecture Claude...");
    const result = await claudeLib.generateArchitecture(niche, marketData);
    sse.done(result);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── LOGO GEN ─────────────────────────────────────────────────────────────────
app.post("/api/agents/logo-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, primaryColor } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(1000);
    return sse.done({ logoUrl: "#", formats: {} });
  }

  try {
    sse.log("Génération logo...");
    const prompt = await claudeLib.generateLogoPrompt(
      appName,
      niche,
      primaryColor,
    );
    const { url, b64 } = await openaiLib.generateLogo(prompt);
    sse.log("Image 1024×1024 ✅", "success");
    const formats = await openaiLib.resizeLogo(b64);
    sse.done({ logoUrl: url, formats });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── CODE GEN ─────────────────────────────────────────────────────────────────
app.post("/api/agents/code-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(1200);
    return sse.done({ files: {} });
  }

  try {
    sse.log("Génération code Flutter...");
    const code = await claudeLib.generateFlutterCode(
      appName,
      packageId,
      architecture,
    );
    sse.done(code);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── SCREENSHOTS ──────────────────────────────────────────────────────────────
app.post("/api/agents/screenshots", async (req, res) => {
  const sse = createSSE(res);

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(1000);
    return sse.done({ screenshots: [] });
  }

  try {
    sse.log("Génération screenshots...");
    const screenshots = [];
    sse.done({ screenshots });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── ASO ──────────────────────────────────────────────────────────────────────
app.post("/api/agents/aso", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(700);
    return sse.done({ title: appName });
  }

  try {
    sse.log("Génération ASO...");
    const listing = await claudeLib.generateASO(appName, niche, {});
    sse.done(listing);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── COMPLIANCE ───────────────────────────────────────────────────────────────
app.post("/api/agents/compliance", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, features = [] } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(600);
    return sse.done({ policyUrl: "#" });
  }

  try {
    sse.log("Génération Privacy Policy...");
    const html = ppLib.generatePrivacyPolicyHTML(
      appName,
      packageId,
      features,
      "7C3AED",
      "privacy@appfactory.dev",
    );
    const dataSafety = ppLib.generateDataSafetyJSON(features);
    const policyUrl = await githubLib.publishPrivacyPolicy(
      appName,
      packageId,
      html,
    );
    sse.done({ policyUrl, policy: { html }, dataSafety });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── WEBHOOK GITHUB ───────────────────────────────────────────────────────────
// GitHub Actions appelle ce endpoint à la fin du workflow
app.post("/api/webhook/github", async (req, res) => {
  const { workflow_run } = req.body;

  if (!workflow_run) {
    return res.status(400).json({ error: "No workflow_run data" });
  }

  const { id: runId, conclusion, html_url } = workflow_run;

  console.log(`\n[webhook] GitHub Actions run #${runId} → ${conclusion}`);
  console.log(`[webhook] URL: ${html_url}\n`);

  // Répondre immédiatement (non-bloquant)
  res.json({ ok: true, received: runId });

  // Rechercher tous les jobs `running` avec ce workflowRunId
  const { getJobStatus, getAllJobs } = require("./lib/jobQueue");
  const allJobs = await getAllJobs();

  for (const job of allJobs) {
    const state = await getJobStatus(job.id, 0);

    if (state.status === "running") {
      // Ce job attend peut-être ce workflow !
      console.log(
        `[webhook] Job ${job.id} en running — cherche workflowRunId...`,
      );

      // Note: Sans exporter getJob, on ne peut pas vérifier le workflowRunId ici
      // En production, tu peux exporter getJob depuis jobQueue.js et vérifier :
      // if (jobData.workflowRunId === String(runId)) { ... }

      // Pour maintenant, on log juste
      console.log(
        `[webhook] Job ${job.id} pourrait être affecté par run ${runId}`,
      );
    }
  }
});

// ─── DEBUG ENDPOINTS ──────────────────────────────────────────────────────────

/**
 * GET /api/debug/jobs
 * Retourne TOUS les jobs actuels avec leur statut complet
 */
app.get("/api/debug/jobs", async (req, res) => {
  try {
    const { getAllJobs } = require("./lib/jobQueue");
    const jobs = await getAllJobs();

    res.json({
      totalJobs: jobs.length,
      jobs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/debug/jobs/:jobId/full
 * Retourne les détails COMPLETS d'un job (tous les logs, status, etc.)
 */
app.get("/api/debug/jobs/:jobId/full", async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobQueue = require("./lib/jobQueue");

    // Importer getJob depuis jobQueue (tu dois l'exporter)
    // Pour maintenant, on utilise getJobStatus
    const state = await require("./lib/jobQueue").getJobStatus(jobId, 0);

    if (!state.found) {
      return res.status(404).json({ error: `Job ${jobId} not found` });
    }

    res.json({
      jobId,
      ...state,
      allLogs: state.newLogs || [],
      totalLogs: (state.newLogs || []).length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/debug/pollers
 * Retourne les pollers GitHub Actions actuellement actifs
 */
app.get("/api/debug/pollers", (req, res) => {
  try {
    const { getActivePollers } = require("./lib/github-poller");
    const activePollers = getActivePollers();

    res.json({
      activeCount: activePollers.length,
      pollers: activePollers,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/debug/job/:jobId/force-complete
 * ADMIN : Force un job à se terminer (pour test/debug)
 */
app.post("/api/debug/job/:jobId/force-complete", async (req, res) => {
  try {
    const { jobId } = req.params;
    const { result = { message: "Force completed by admin" } } = req.body;

    console.log(`[admin] Force completing job ${jobId}`);

    // Cette endpoint est dangereuse — à protéger avec une clé API en production
    res.json({
      ok: true,
      message: `Job ${jobId} forcé à se compléter`,
      jobId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/jobs/all-detailed", async (req, res) => {
  try {
    const jobQueue = require("./lib/jobQueue");
    const allJobs = await jobQueue.getAllJobs();

    // Pour chaque job, on fait un appel complet
    const detailed = await Promise.all(
      allJobs.map(async (job) => {
        const state = await jobQueue.getJobStatus(job.id, 0);
        return {
          id: job.id,
          status: job.status,
          logsCount: job.logsCount,
          allLogs: state.newLogs || [],
          found: state.found,
          error: state.error,
          result: state.result,
        };
      }),
    );

    const running = detailed.filter((j) => j.status === "running").length;
    const done = detailed.filter((j) => j.status === "done").length;
    const error = detailed.filter((j) => j.status === "error").length;

    res.json({
      summary: {
        total: detailed.length,
        running,
        done,
        error,
      },
      jobs: detailed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

/**
 * GET /api/debug/webhook-test
 * Teste le webhook en simulant un appel GitHub
 */
app.get("/api/debug/webhook-test", async (req, res) => {
  const testPayload = {
    action: "completed",
    workflow_run: {
      id: 999999999,
      conclusion: "success",
      html_url: "https://github.com/test/actions/runs/999999999",
    },
  };

  console.log("[webhook-test] Envoi test payload:", testPayload);

  try {
    // Appeler nous-mêmes le webhook
    const response = await fetch(
      `http://localhost:${PORT}/api/webhook/github`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      },
    );

    const result = await response.json();
    res.json({
      ok: true,
      message: "Test webhook envoyé",
      response: result,
    });
  } catch (err) {
    res.status(500).json({
      error: "Webhook test failed",
      details: err.message,
    });
  }
});

/**
 * GET /api/debug/system
 * Retourne l'état du système
 */
app.get("/api/debug/system", (req, res) => {
  res.json({
    mode: MODE_ENV,
    debug: MOT_DEBUG,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed:
        Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
      heapTotal:
        Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + " MB",
    },
  });
});

// ─── PREVIEW ENDPOINT ─────────────────────────────────────────────────────────
/**
 * GET /api/preview/:jobId
 * Affiche les logos et screenshots générés pour un job
 */
app.get("/api/preview/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobQueue = require("./lib/jobQueue");

    const state = await jobQueue.getJobStatus(jobId, 0);

    if (!state.found) {
      return res.status(404).json({ error: `Job ${jobId} not found` });
    }

    const result = state.result || {};
    const logos = result.formats || {};
    const screenshots = result.screenshots || [];

    // Générer le HTML d'aperçu
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Preview - ${jobId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 40px;
      font-size: 32px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .section {
      background: white;
      border-radius: 16px;
      padding: 40px;
      margin-bottom: 30px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    .section h2 {
      color: #333;
      margin-bottom: 30px;
      font-size: 24px;
      border-bottom: 3px solid #667eea;
      padding-bottom: 15px;
    }
    .logos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 30px;
      margin-bottom: 20px;
    }
    .logo-card {
      text-align: center;
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      border: 2px solid #e0e0e0;
      transition: all 0.3s ease;
    }
    .logo-card:hover {
      border-color: #667eea;
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.2);
      transform: translateY(-5px);
    }
    .logo-card img {
      max-width: 100%;
      height: 120px;
      margin-bottom: 10px;
      border-radius: 8px;
      object-fit: contain;
    }
    .logo-card p {
      font-size: 12px;
      color: #666;
      margin: 0;
    }
    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 30px;
      margin-bottom: 20px;
    }
    .screenshot-card {
      background: #f8f9fa;
      border-radius: 12px;
      overflow: hidden;
      border: 2px solid #e0e0e0;
      transition: all 0.3s ease;
    }
    .screenshot-card:hover {
      border-color: #667eea;
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.2);
      transform: translateY(-5px);
    }
    .screenshot-card img {
      width: 100%;
      height: auto;
      display: block;
    }
    .screenshot-name {
      padding: 15px;
      text-align: center;
      font-size: 14px;
      color: #333;
      font-weight: 600;
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #999;
    }
    .empty-state p {
      font-size: 16px;
      margin-bottom: 10px;
    }
    .download-btn {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      margin-top: 20px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.3s ease;
    }
    .download-btn:hover {
      background: #764ba2;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    }
    .job-info {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid #667eea;
    }
    .job-info p {
      margin: 8px 0;
      color: #333;
      font-family: monospace;
      font-size: 13px;
    }
    .job-info strong {
      color: #667eea;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎨 App Preview</h1>
    
    <div class="section">
      <div class="job-info">
        <p><strong>Job ID:</strong> ${jobId}</p>
        <p><strong>Status:</strong> ${state.status}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString("fr-FR")}</p>
      </div>
    </div>

    ${
      logos.logo512 || logos.logo192 || logos.logo48
        ? `
    <div class="section">
      <h2>🎯 Logo Assets</h2>
      <div class="logos-grid">
        ${
          logos.logo512
            ? `
        <div class="logo-card">
          <img src="data:image/png;base64,${logos.logo512}" alt="Logo 512x512">
          <p>512×512</p>
        </div>
        `
            : ""
        }
        ${
          logos.logo192
            ? `
        <div class="logo-card">
          <img src="data:image/png;base64,${logos.logo192}" alt="Logo 192x192">
          <p>192×192</p>
        </div>
        `
            : ""
        }
        ${
          logos.logo48
            ? `
        <div class="logo-card">
          <img src="data:image/png;base64,${logos.logo48}" alt="Logo 48x48">
          <p>48×48</p>
        </div>
        `
            : ""
        }
      </div>
    </div>
    `
        : `
    <div class="section">
      <div class="empty-state">
        <p>📭 Aucun logo disponible</p>
      </div>
    </div>
    `
    }

    ${
      screenshots && screenshots.length > 0
        ? `
    <div class="section">
      <h2>📱 Screenshots</h2>
      <div class="screenshots-grid">
        ${screenshots
          .map(
            (ss, i) => `
        <div class="screenshot-card">
          <img src="data:image/png;base64,${ss.b64}" alt="${ss.name || "Screenshot " + (i + 1)}">
          <div class="screenshot-name">${ss.name || "Screenshot " + (i + 1)}</div>
        </div>
        `,
          )
          .join("")}
      </div>
    </div>
    `
        : `
    <div class="section">
      <div class="empty-state">
        <p>📭 Aucun screenshot disponible</p>
      </div>
    </div>
    `
    }

    <div class="section" style="text-align: center;">
      <button class="download-btn" onclick="window.history.back()">← Retour</button>
    </div>
  </div>
</body>
</html>
    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, "public")));

// ─── STATIC ───────────────────────────────────────────────────────────────────
if (IS_PROD) {
  const clientBuild = path.join(__dirname, "../client/dist");
  app.use(express.static(clientBuild));
  app.get("*", (_req, res) =>
    res.sendFile(path.join(clientBuild, "index.html")),
  );
}

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ App Factory Server — PORT ${PORT}`);
  console.log(`   Mode: ${MODE_ENV} | Debug: ${MOT_DEBUG}`);
  console.log(`   CORS: ${allowedOrigins.join(", ")}\n`);
});
