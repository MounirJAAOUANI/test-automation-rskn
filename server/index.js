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

      // Sauvegarder le workflowRunId pour relancer après redémarrage
      await setWorkflowRunId(workflowRun.id);

      log("Build en cours (3-8 min)...");

      // ── Lancer la surveillance GitHub AVEC LOGS EN TEMPS RÉEL ──
      startGitHubPoller(
        jobId,
        workflowRun.id,
        // onLog callback — affiche les logs du polling dans l'app
        async (msg, type = "info") => {
          await log(msg, type);
        },
        // onStatusChange callback — quand le workflow est terminé
        async (status, data) => {
          if (status === "completed") {
            // Le build GitHub a réussi, continuer avec téléchargement artefacts
            log("", ""); // Ligne vide pour séparer
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

            log("Upload Play Console...");
            await githubLib.uploadToPlayConsole({
              packageId,
              aabBuffer,
              listing,
              logoBase64,
              screenshots,
              policyUrl,
            });

            log("Brouillon Play Console créé ✅", "success");
            log("Track: internal | Status: DRAFT", "data");

            done({
              apkUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
              apkName: `${packageId}-release.aab`,
              apkSize: `${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB`,
              playConsoleStatus: "DRAFT",
              draftUrl: "https://play.google.com/console",
              workflowRunUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
            });
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
