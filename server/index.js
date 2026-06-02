"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const AdmZip = require("adm-zip");

const claudeLib = require("./lib/claude");
const openaiLib = require("./lib/openai");
const playstoreLib = require("./lib/playstore");
const firebaseLib = require("./lib/firebase");
const githubLib = require("./lib/github");
const ppLib = require("./lib/privacypolicy");
const { createJob, getJobStatus, getAllJobs } = require("./lib/jobQueue");

const app = express();
const PORT = process.env.PORT || 4000;

const MODE_ENV = (process.env.MODE_ENV || "development").toLowerCase();
const MOT_DEBUG = (process.env.MOT_DEBUG || "false").toLowerCase() === "true";
const IS_PROD = MODE_ENV === "production";

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
        : cb(new Error(`CORS: ${origin}`)),
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

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: MODE_ENV, debug: MOT_DEBUG });
});

// ─── DEBUG : Liste tous les jobs en mémoire ───────────────────────────────────
app.get("/api/jobs/debug/all", (_req, res) => {
  const allJobs = getAllJobs();
  res.json({
    count: allJobs.length,
    jobs: allJobs.map((j) => ({
      id: j.id,
      status: j.status,
      logsCount: j.logs.length,
    })),
  });
});

// ─── POLL — état d'un job ──────────────────────────────────────────────────────
app.get("/api/jobs/:jobId", (req, res) => {
  const { jobId } = req.params;
  const cursor = parseInt(req.query.cursor || "0", 10);

  const allJobs = getAllJobs();
  console.log(
    `[POLL] Demande job: ${jobId} | Jobs en mémoire: ${allJobs.map((j) => j.id).join(", ")}`,
  );

  const state = getJobStatus(jobId, cursor);

  if (!state.found) {
    console.log(
      `[404] Job "${jobId}" NOT FOUND. Jobs existants: ${allJobs.map((j) => j.id).join(", ")}`,
    );
    return res
      .status(404)
      .json({
        error: `Job "${jobId}" introuvable`,
        availableJobs: allJobs.map((j) => j.id),
      });
  }

  res.json(state);
});

// ─── Market Scout ─────────────────────────────────────────────────────────────
app.post("/api/agents/market-scout", async (req, res) => {
  const sse = createSSE(res);
  const { niche } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(600);
    return sse.done(playstoreLib.mockData(niche));
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

// ─── App Architect ────────────────────────────────────────────────────────────
app.post("/api/agents/app-architect", async (req, res) => {
  const sse = createSSE(res);
  const { niche, marketData } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(800);
    return sse.done(claudeLib.mockArchitect(niche));
  }

  try {
    sse.log("Génération architecture...");
    const result = await claudeLib.generateArchitecture(niche, marketData);
    sse.done(result);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── Logo Gen ─────────────────────────────────────────────────────────────────
app.post("/api/agents/logo-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, primaryColor } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(1000);
    return sse.done(openaiLib.mockLogo(appName));
  }

  try {
    sse.log("Génération logo...");
    const prompt = await claudeLib.generateLogoPrompt(
      appName,
      niche,
      primaryColor,
    );
    const { url, b64 } = await openaiLib.generateLogo(prompt);
    const formats = await openaiLib.resizeLogo(b64);
    sse.done({ logoUrl: url, formats });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── Code Gen ─────────────────────────────────────────────────────────────────
app.post("/api/agents/code-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(1200);
    return sse.done(claudeLib.mockCodeGen(appName, packageId));
  }

  try {
    sse.log("Génération code...");
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

// ─── Screenshots ──────────────────────────────────────────────────────────────
app.post("/api/agents/screenshots", async (req, res) => {
  const sse = createSSE(res);
  const { appName, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(1000);
    return sse.done({
      screenshots: Array(5)
        .fill(null)
        .map((_, i) => ({ index: i + 1 })),
    });
  }

  try {
    let puppeteer = require("puppeteer");
    sse.log("Génération screenshots...");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox"],
      headless: "new",
    });
    const page = await browser.newPage();
    const screenshots = [];
    for (const name of ["home", "checkin", "stats", "premium", "darkmode"]) {
      sse.log(`Capture ${name}...`);
      const buf = await page.screenshot({ type: "png" });
      const sharp = require("sharp");
      const framed = await sharp(buf)
        .resize(1440, 3120, { fit: "contain" })
        .toBuffer();
      screenshots.push({ name, b64: framed.toString("base64") });
    }
    await browser.close();
    sse.done({ screenshots });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── ASO ──────────────────────────────────────────────────────────────────────
app.post("/api/agents/aso", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, marketData } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(700);
    return sse.done(claudeLib.mockASO(appName, niche));
  }

  try {
    sse.log("Génération ASO...");
    const listing = await claudeLib.generateASO(appName, niche, marketData);
    sse.done(listing);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── Compliance ───────────────────────────────────────────────────────────────
app.post("/api/agents/compliance", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, features = [] } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(600);
    return sse.done(claudeLib.mockCompliance(appName, packageId));
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

// ─── BUILD & DEPLOY ───────────────────────────────────────────────────────────
app.post("/api/agents/build-deploy", async (req, res) => {
  const {
    appName,
    packageId,
    code,
    listing,
    policyUrl,
    logoBase64,
    screenshots,
  } = req.body;

  // ── Créer le job immédiatement ─────────────────────────────────────────────
  const { jobId, log, done, fail } = createJob();
  const allJobs = getAllJobs();

  console.log(`[CREATE_JOB] jobId créé: ${jobId}`);
  console.log(
    `[CREATE_JOB] Jobs en mémoire: ${allJobs.map((j) => j.id).join(", ")}`,
  );

  // ── Mode dev ───────────────────────────────────────────────────────────────
  if (!IS_PROD) {
    res.json({ jobId });
    log("🟡 [DEV] Mode développement");
    (async () => {
      await delay(500);
      log("Simulation build...");
      await delay(1000);
      log("Simulation Flutter ✅", "success");
      done({
        apkUrl: "#sim",
        apkName: `${packageId}-debug.apk`,
        apkSize: "~42 MB",
        playConsoleStatus: "DRAFT (sim)",
        draftUrl: "https://play.google.com/console",
      });
    })();
    return;
  }

  // ── Mode production ────────────────────────────────────────────────────────
  res.json({ jobId });

  (async () => {
    try {
      log("Préparation...");
      log("Déclenchement GitHub Actions...");

      const workflowRun = await githubLib.triggerBuild({
        appName,
        packageId,
        primaryColor: code?.theme?.primaryColor || "7C3AED",
      });

      log(`Workflow ID: ${workflowRun.id}`, "data");
      log("Build en cours (3-8 min)...");

      let attempts = 0;
      let status = "queued";

      while (
        (status === "queued" || status === "in_progress") &&
        attempts < 90
      ) {
        await delay(10000);
        attempts++;
        try {
          status = await githubLib.getWorkflowStatus(workflowRun.id);
        } catch (e) {
          log(`Retry (${e.message})...`, "warn");
          continue;
        }
        const sec = attempts * 10;
        const min = Math.floor(sec / 60);
        log(`Build ${status} (${min}min ${sec % 60}s)...`);
        if (status === "failure") throw new Error("Build échoué sur GitHub");
      }

      if (status !== "completed") throw new Error("Build timeout");
      log("Build terminé ✅", "success");

      log("Téléchargement AAB...");
      let aabBuffer;
      try {
        const zipBuffer = await githubLib.downloadArtifact(
          workflowRun.id,
          "app-release-aab",
        );
        const zip = new AdmZip(zipBuffer);
        const aabEntry = zip
          .getEntries()
          .find((e) => e.entryName.endsWith(".aab"));
        if (!aabEntry) throw new Error("Aucun .aab dans le ZIP");
        aabBuffer = aabEntry.getData();
        log(
          `AAB : ${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB ✅`,
          "success",
        );
      } catch (zipErr) {
        throw new Error(`Extraction AAB : ${zipErr.message}`);
      }

      log("Upload Play Console...");
      const draft = await githubLib.uploadToPlayConsole({
        packageId,
        aabBuffer,
        listing,
        logoBase64,
        screenshots,
        policyUrl,
      });
      log("Draft créé ✅", "success");

      done({
        apkUrl: "#",
        apkName: `${packageId}-debug.apk`,
        apkSize: "~45 MB",
        playConsoleStatus: "DRAFT",
        draftUrl: "https://play.google.com/console",
        workflowRunUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
      });
    } catch (err) {
      console.error(`[JOB_ERROR] ${jobId}:`, err);
      fail(err);
    }
  })();
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
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ App Factory Server — PORT ${PORT}`);
  console.log(`   Mode: ${MODE_ENV} | Debug: ${MOT_DEBUG}`);
  console.log(`   CORS: ${allowedOrigins.join(", ")}`);
  console.log(`   Debug jobs: GET /api/jobs/debug/all`);
  console.log(`${"=".repeat(60)}\n`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("\n⚠️  SIGTERM reçu — arrêt gracieux...");
  server.close(() => {
    console.log("Serveur arrêté");
    process.exit(0);
  });
});
