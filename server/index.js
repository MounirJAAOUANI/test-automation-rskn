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
                process.env.GOOGLE_PLAY_CREDENTIALS ||
                  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT,
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
// app.get("/api/preview/:jobId", async (req, res) => {
//   try {
//     const { jobId } = req.params;
//     const jobQueue = require("./lib/jobQueue");

//     const state = await jobQueue.getJobStatus(jobId, 0);

//     if (!state.found) {
//       return res.status(404).json({ error: `Job ${jobId} not found` });
//     }

//     const result = state.result || {};
//     const logos = result.formats || {};
//     const screenshots = result.screenshots || [];

//     // Générer le HTML d'aperçu
//     const html = `
// <!DOCTYPE html>
// <html lang="fr">
// <head>
//   <meta charset="UTF-8">
//   <meta name="viewport" content="width=device-width, initial-scale=1.0">
//   <title>App Preview - ${jobId}</title>
//   <style>
//     * { margin: 0; padding: 0; box-sizing: border-box; }
//     body {
//       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
//       background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//       min-height: 100vh;
//       padding: 40px 20px;
//     }
//     .container {
//       max-width: 1200px;
//       margin: 0 auto;
//     }
//     h1 {
//       color: white;
//       text-align: center;
//       margin-bottom: 40px;
//       font-size: 32px;
//       text-shadow: 0 2px 4px rgba(0,0,0,0.2);
//     }
//     .section {
//       background: white;
//       border-radius: 16px;
//       padding: 40px;
//       margin-bottom: 30px;
//       box-shadow: 0 10px 40px rgba(0,0,0,0.1);
//     }
//     .section h2 {
//       color: #333;
//       margin-bottom: 30px;
//       font-size: 24px;
//       border-bottom: 3px solid #667eea;
//       padding-bottom: 15px;
//     }
//     .logos-grid {
//       display: grid;
//       grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
//       gap: 30px;
//       margin-bottom: 20px;
//     }
//     .logo-card {
//       text-align: center;
//       background: #f8f9fa;
//       padding: 20px;
//       border-radius: 12px;
//       border: 2px solid #e0e0e0;
//       transition: all 0.3s ease;
//     }
//     .logo-card:hover {
//       border-color: #667eea;
//       box-shadow: 0 5px 20px rgba(102, 126, 234, 0.2);
//       transform: translateY(-5px);
//     }
//     .logo-card img {
//       max-width: 100%;
//       height: 120px;
//       margin-bottom: 10px;
//       border-radius: 8px;
//       object-fit: contain;
//     }
//     .logo-card p {
//       font-size: 12px;
//       color: #666;
//       margin: 0;
//     }
//     .screenshots-grid {
//       display: grid;
//       grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
//       gap: 30px;
//       margin-bottom: 20px;
//     }
//     .screenshot-card {
//       background: #f8f9fa;
//       border-radius: 12px;
//       overflow: hidden;
//       border: 2px solid #e0e0e0;
//       transition: all 0.3s ease;
//     }
//     .screenshot-card:hover {
//       border-color: #667eea;
//       box-shadow: 0 5px 20px rgba(102, 126, 234, 0.2);
//       transform: translateY(-5px);
//     }
//     .screenshot-card img {
//       width: 100%;
//       height: auto;
//       display: block;
//     }
//     .screenshot-name {
//       padding: 15px;
//       text-align: center;
//       font-size: 14px;
//       color: #333;
//       font-weight: 600;
//     }
//     .empty-state {
//       text-align: center;
//       padding: 40px 20px;
//       color: #999;
//     }
//     .empty-state p {
//       font-size: 16px;
//       margin-bottom: 10px;
//     }
//     .download-btn {
//       display: inline-block;
//       background: #667eea;
//       color: white;
//       padding: 12px 24px;
//       border-radius: 8px;
//       text-decoration: none;
//       margin-top: 20px;
//       border: none;
//       cursor: pointer;
//       font-size: 14px;
//       font-weight: 600;
//       transition: all 0.3s ease;
//     }
//     .download-btn:hover {
//       background: #764ba2;
//       transform: translateY(-2px);
//       box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
//     }
//     .job-info {
//       background: #f8f9fa;
//       padding: 20px;
//       border-radius: 8px;
//       margin-bottom: 30px;
//       border-left: 4px solid #667eea;
//     }
//     .job-info p {
//       margin: 8px 0;
//       color: #333;
//       font-family: monospace;
//       font-size: 13px;
//     }
//     .job-info strong {
//       color: #667eea;
//     }
//   </style>
// </head>
// <body>
//   <div class="container">
//     <h1>🎨 App Preview</h1>

//     <div class="section">
//       <div class="job-info">
//         <p><strong>Job ID:</strong> ${jobId}</p>
//         <p><strong>Status:</strong> ${state.status}</p>
//         <p><strong>Generated:</strong> ${new Date().toLocaleString("fr-FR")}</p>
//       </div>
//     </div>

//     ${
//       logos.logo512 || logos.logo192 || logos.logo48
//         ? `
//     <div class="section">
//       <h2>🎯 Logo Assets</h2>
//       <div class="logos-grid">
//         ${
//           logos.logo512
//             ? `
//         <div class="logo-card">
//           <img src="data:image/png;base64,${logos.logo512}" alt="Logo 512x512">
//           <p>512×512</p>
//         </div>
//         `
//             : ""
//         }
//         ${
//           logos.logo192
//             ? `
//         <div class="logo-card">
//           <img src="data:image/png;base64,${logos.logo192}" alt="Logo 192x192">
//           <p>192×192</p>
//         </div>
//         `
//             : ""
//         }
//         ${
//           logos.logo48
//             ? `
//         <div class="logo-card">
//           <img src="data:image/png;base64,${logos.logo48}" alt="Logo 48x48">
//           <p>48×48</p>
//         </div>
//         `
//             : ""
//         }
//       </div>
//     </div>
//     `
//         : `
//     <div class="section">
//       <div class="empty-state">
//         <p>📭 Aucun logo disponible</p>
//       </div>
//     </div>
//     `
//     }

//     ${
//       screenshots && screenshots.length > 0
//         ? `
//     <div class="section">
//       <h2>📱 Screenshots</h2>
//       <div class="screenshots-grid">
//         ${screenshots
//           .map(
//             (ss, i) => `
//         <div class="screenshot-card">
//           <img src="data:image/png;base64,${ss.b64}" alt="${ss.name || "Screenshot " + (i + 1)}">
//           <div class="screenshot-name">${ss.name || "Screenshot " + (i + 1)}</div>
//         </div>
//         `,
//           )
//           .join("")}
//       </div>
//     </div>
//     `
//         : `
//     <div class="section">
//       <div class="empty-state">
//         <p>📭 Aucun screenshot disponible</p>
//       </div>
//     </div>
//     `
//     }

//     <div class="section" style="text-align: center;">
//       <button class="download-btn" onclick="window.history.back()">← Retour</button>
//     </div>
//   </div>
// </body>
// </html>
//     `;

//     res.setHeader("Content-Type", "text/html; charset=utf-8");
//     res.send(html);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

/**
 * POST /api/webhook/playstore
 *
 * ⚠️ DRAFT MODE ONLY
 * Uploads AAB to Google Play DRAFT (internal testing)
 * Does NOT submit for review
 * User must review in Play Console and submit manually
 */
app.post("/api/webhook/playstore", async (req, res) => {
  const {
    action,
    packageId,
    appName,
    primaryColor,
    aabSize,
    apkSize,
    githubRunId,
    githubRunUrl,
  } = req.body;

  if (action !== "publish_to_playstore" || !packageId) {
    return res.status(400).json({ error: "Invalid request" });
  }

  console.log(
    `\n[playstore-webhook] DRAFT MODE: Publishing ${appName} (${packageId})`,
  );
  console.log(
    `[playstore-webhook] ⚠️  This will create a DRAFT only, not submit for review\n`,
  );

  try {
    const rawCredentials =
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT ||
      process.env.GOOGLE_PLAY_CREDENTIALS;
    if (!rawCredentials) {
      throw new Error(
        "GOOGLE_PLAY_SERVICE_ACCOUNT or GOOGLE_PLAY_CREDENTIALS not configured in environment",
      );
    }

    let credentials;
    try {
      credentials = JSON.parse(rawCredentials);
    } catch (e) {
      throw new Error(`Invalid Google Play service account JSON: ${e.message}`);
    }

    // Importer playstore lib
    let playstoreLib;
    try {
      playstoreLib = require("./lib/playstore");
    } catch (e) {
      throw new Error(`playstore.js not found: ${e.message}`);
    }

    // Récupérer l'AAB depuis GitHub si nécessaire
    let aabBuffer = null;
    if (req.body.aabBase64) {
      aabBuffer = Buffer.from(req.body.aabBase64, "base64");
    } else if (githubRunId) {
      const zipBuffer = await githubLib.downloadArtifact(
        githubRunId,
        "app-release-aab",
      );
      const zip = new AdmZip(zipBuffer);
      const aabEntry = zip
        .getEntries()
        .find((e) => e.entryName.endsWith(".aab"));
      if (!aabEntry) {
        const names = zip
          .getEntries()
          .map((e) => e.entryName)
          .join(", ");
        throw new Error(`Aucun .aab trouvé dans l'artifact GitHub (${names})`);
      }
      aabBuffer = aabEntry.getData();
    } else {
      throw new Error(
        "AAB absent et githubRunId manquant. Impossible de récupérer le bundle Play Console.",
      );
    }

    if (!aabBuffer || !Buffer.isBuffer(aabBuffer)) {
      throw new Error("AAB invalide ou non trouvé dans l'artifact GitHub.");
    }

    console.log(`[playstore-webhook] Starting upload for ${packageId}...`);

    const uploadResult = await playstoreLib.uploadAABToPlayConsole(
      packageId,
      aabBuffer,
      credentials,
    );

    console.log(
      `[playstore-webhook] ✅ Upload successful: versionCode ${uploadResult.versionCode}`,
    );
    console.log(
      `[playstore-webhook] 📝 DRAFT created - Review in Play Console`,
    );
    console.log(`[playstore-webhook] 🔗 ${uploadResult.draftUrl}\n`);

    // Stocker le résultat dans Firebase
    const db = require("firebase-admin").database();
    const buildRef = db.ref(`builds/${githubRunId}`);

    await buildRef.update({
      playstore_version_code: uploadResult.versionCode,
      playstore_edit_id: uploadResult.editId,
      playstore_status: "draft_created", // ← NEW: Draft only
      playstore_timestamp: new Date().toISOString(),
      playstore_url: uploadResult.draftUrl,
      playstore_message:
        "⚠️ Draft created. Review in Play Console before submitting.",
    });

    res.json({
      ok: true,
      versionCode: uploadResult.versionCode,
      editId: uploadResult.editId,
      status: "draft_created",
      message: `📝 Draft created (versionCode ${uploadResult.versionCode}). Review in Play Console before submitting.`,
      playConsoleUrl: uploadResult.draftUrl,
    });
  } catch (err) {
    console.error(`[playstore-webhook] Error: ${err.message}`);

    // Ne pas échouer le build complet
    try {
      const db = require("firebase-admin").database();
      const buildRef = db.ref(`builds/${githubRunId}`);
      await buildRef.update({
        playstore_status: "error",
        playstore_error: err.message,
        playstore_timestamp: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.error(
        `[playstore-webhook] Firebase update failed: ${dbErr.message}`,
      );
    }

    res.status(200).json({
      ok: false,
      error: err.message,
      message: "Publishing to Google Play DRAFT failed, but build completed",
    });
  }
});

/**
 * GET /api/preview/:jobId
 * Retourne les infos du build avec statut Google Play DRAFT
 */
app.get("/api/preview/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const db = require("firebase-admin").database();
    const buildRef = db.ref(`builds/${jobId}`);
    const snapshot = await buildRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: `Build ${jobId} not found` });
    }

    const buildData = snapshot.val();

    const response = {
      jobId,
      app_name: buildData.app_name || "Unknown",
      package_id: buildData.package_id || "Unknown",
      primary_color: buildData.primary_color || "7C3AED",
      aab_size: buildData.aab_size || "N/A",
      apk_size: buildData.apk_size || "N/A",
      screenshots: buildData.screenshots || [],
      logo: buildData.logo || null,
      status: buildData.status || "pending",
      build_date: buildData.timestamp || new Date().toISOString(),
      github_url:
        buildData.github_url ||
        `https://github.com/${process.env.GITHUB_OWNER || ""}/${process.env.GITHUB_REPO || ""}/actions/runs/${jobId}`,

      // Infos Google Play DRAFT
      playstore: {
        version_code: buildData.playstore_version_code || null,
        edit_id: buildData.playstore_edit_id || null,
        url: buildData.playstore_url || null,
        status: buildData.playstore_status || "not_published",
        message: buildData.playstore_message || null,
        error: buildData.playstore_error || null,
        timestamp: buildData.playstore_timestamp || null,
      },
    };

    res.json(response);
  } catch (err) {
    console.error(`[preview] Error: ${err.message}`);
    res.status(500).json({ error: `Failed to fetch preview: ${err.message}` });
  }
});

/**
 * GET /api/preview/:jobId/html
 * Page HTML avec info Google Play DRAFT
 *
 * ⚠️ Affiche: "Draft créé - Review et submit manuellement"
 */
app.get("/api/preview/:jobId/html", async (req, res) => {
  const { jobId } = req.params;

  try {
    const db = require("firebase-admin").database();
    const buildRef = db.ref(`builds/${jobId}`);
    const snapshot = await buildRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Build Not Found</title></head>
        <body><h1>❌ Build not found</h1></body>
        </html>
      `);
    }

    const buildData = snapshot.val();
    const isDraftCreated = buildData.playstore_status === "draft_created";

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${buildData.app_name} - Build Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: white; margin-bottom: 30px; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
    .section {
      background: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    }
    .section h2 { color: #333; margin-bottom: 20px; border-bottom: 3px solid #667eea; padding-bottom: 10px; }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }
    .info-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    .info-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; font-weight: 600; }
    .info-value { font-size: 18px; color: #333; font-weight: 600; word-break: break-all; }
    .badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge.success { background: #d4edda; color: #155724; }
    .badge.draft { background: #fff3cd; color: #856404; }
    .badge.error { background: #f8d7da; color: #721c24; }
    .draft-card {
      background: linear-gradient(135deg, #fff59d 0%, #ffe082 100%);
      color: #333;
      padding: 20px;
      border-radius: 8px;
      margin-top: 15px;
      border-left: 4px solid #f59e0b;
    }
    .draft-card h3 { color: #333; margin-bottom: 10px; }
    .draft-card p { margin: 8px 0; color: #333; }
    .draft-card strong { color: #f59e0b; }
    .action-buttons {
      display: flex;
      gap: 10px;
      margin-top: 15px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.3s ease;
      border: none;
      cursor: pointer;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    }
    .btn-secondary {
      background: white;
      color: #f59e0b;
      border: 2px solid #f59e0b;
    }
    .btn-secondary:hover {
      background: #fff9e6;
    }
    .logo-container {
      text-align: center;
      margin: 30px 0;
    }
    .logo {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 80px;
      font-weight: bold;
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.3);
      margin: 0 auto;
    }
    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }
    .screenshot-placeholder {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      aspect-ratio: 9/16;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 ${buildData.app_name}</h1>

    <div class="section">
      <h2>📊 Build Information</h2>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Package ID</div>
          <div class="info-value">${buildData.package_id}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Color</div>
          <div class="info-value">#${buildData.primary_color}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Status</div>
          <span class="badge success">${buildData.status.toUpperCase()}</span>
        </div>
        <div class="info-card">
          <div class="info-label">Build Date</div>
          <div class="info-value">${new Date(buildData.timestamp).toLocaleString()}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>📦 File Sizes (Optimized)</h2>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">AAB Size</div>
          <div class="info-value">${buildData.aab_size}</div>
        </div>
        <div class="info-card">
          <div class="info-label">APK Size</div>
          <div class="info-value">${buildData.apk_size}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>🎨 App Icon</h2>
      <div class="logo-container">
        <div class="logo" style="background: linear-gradient(135deg, #${buildData.primary_color}, #333);">
          ${buildData.app_name.charAt(0).toUpperCase()}
        </div>
      </div>
    </div>

    ${
      buildData.screenshots && buildData.screenshots.length > 0
        ? `
    <div class="section">
      <h2>📱 Screenshots</h2>
      <div class="screenshots-grid">
        \${buildData.screenshots
          .map((_, i) => \`<div class="screenshot-placeholder">Screenshot \${i + 1}</div>\`)
          .join("")}
      </div>
    </div>
    `
        : ""
    }

    ${
      isDraftCreated
        ? `
    <div class="section">
      <h2>✅ Google Play Publishing</h2>
      <span class="badge draft">📝 DRAFT CREATED</span>
      
      <div class="draft-card">
        <h3>⚠️ Next Steps Required</h3>
        <p>Your app has been uploaded to <strong>Google Play Console as a DRAFT</strong> in the <strong>Internal Testing</strong> track.</p>
        
        <p><strong>Version Code:</strong> ${buildData.playstore_version_code}</p>
        <p><strong>Edit ID:</strong> ${buildData.playstore_edit_id}</p>
        
        <h3 style="margin-top: 15px;">What to do next:</h3>
        <ol style="margin-left: 20px; color: #333;">
          <li>Go to <strong>Google Play Console</strong></li>
          <li>Navigate to your app <strong>"${buildData.package_id}"</strong></li>
          <li>Go to <strong>Internal Testing</strong> track</li>
          <li><strong>Review</strong> the app details, screenshots, and description</li>
          <li>Click <strong>"Save"</strong> to confirm</li>
          <li>Click <strong>"Submit for Review"</strong> when ready</li>
        </ol>
        
        <div class="action-buttons">
          <a href="${buildData.playstore_url}" target="_blank" class="btn btn-primary">
            🔗 Go to Play Console
          </a>
          <a href="${buildData.github_url}" target="_blank" class="btn btn-secondary">
            📊 GitHub Actions
          </a>
        </div>
      </div>
    </div>
    `
        : buildData.playstore_status === "error"
          ? `
    <div class="section">
      <h2>❌ Google Play Publishing</h2>
      <div style="background: #f8d7da; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545;">
        <p><strong>Failed to publish</strong></p>
        <p>${buildData.playstore_error || "Unknown error"}</p>
      </div>
    </div>
    `
          : ""
    }

    <div class="section">
      <h2>📥 Downloads</h2>
      <a href="${buildData.github_url}/artifacts" target="_blank" class="btn btn-primary">
        📦 Download Artifacts (AAB & APK)
      </a>
    </div>
  </div>
</body>
</html>
    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res
      .status(500)
      .send(`<html><body><h1>Error: ${err.message}</h1></body></html>`);
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
