"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const AdmZip = require("adm-zip");

const { createJob, getJobStatus, getAllJobs } = require("./lib/jobQueue");

const app = express();
const PORT = process.env.PORT || 4000;

const MODE_ENV = (process.env.MODE_ENV || "development").toLowerCase();
const MOT_DEBUG = (process.env.MOT_DEBUG || "false").toLowerCase() === "true";
const IS_PROD = MODE_ENV === "production";

console.log(`\n🔧 Starting server — mode: ${MODE_ENV} | debug: ${MOT_DEBUG}\n`);

// ─── SAFE REQUIRES ────────────────────────────────────────────────────────────
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
app.get("/api/jobs/:jobId", (req, res) => {
  const { jobId } = req.params;
  const cursor = parseInt(req.query.cursor || "0", 10);
  const state = getJobStatus(jobId, cursor);
  if (!state.found) {
    return res
      .status(404)
      .json({ error: `Job NOT FOUND`, availableJobs: getAllJobs() });
  }
  res.json(state);
});

// ─── MARKET SCOUT ──────────────────────────────────────────────────────────────
app.post("/api/agents/market-scout", async (req, res) => {
  const sse = createSSE(res);
  const { niche } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(600);
    return sse.done(
      playstoreLib?.mockData?.(niche) || {
        niche,
        topCompetitors: [],
        analysis: {},
      },
    );
  }

  try {
    sse.log(`Recherche "${niche}"...`);
    const apps = await playstoreLib.search(niche, 50);
    sse.log(`${apps.length} apps ✅`, "success");
    const stats = playstoreLib.analyze(apps);
    sse.log(
      `Saturation: ${stats.saturationLevel} | Score: ${stats.avgScore.toFixed(1)}/5`,
      "data",
    );
    sse.log("Analyse Claude...");
    const analysis = await claudeLib.analyzeNiche(niche, apps.slice(0, 10));
    sse.log(`Verdict: ${analysis.recommendation}`, "success");
    sse.done({
      niche,
      topCompetitors: apps.slice(0, 8),
      analysis: { ...stats, ...analysis },
    });
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
    return sse.done(
      claudeLib?.mockArchitect?.(niche) || {
        appName: niche,
        packageId: "com.app.test",
      },
    );
  }

  try {
    sse.log("Génération architecture Claude...");
    const result = await claudeLib.generateArchitecture(niche, marketData);
    sse.log(`App: ${result.appName} | Package: ${result.packageId}`, "success");
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
    return sse.done(
      openaiLib?.mockLogo?.(appName) || { logoUrl: "#", formats: {} },
    );
  }

  try {
    sse.log("Génération prompt logo (Claude)...");
    const prompt = await claudeLib.generateLogoPrompt(
      appName,
      niche,
      primaryColor,
    );
    sse.log("Appel OpenAI DALL-E...");
    const { url, b64 } = await openaiLib.generateLogo(prompt);
    sse.log("Image 1024×1024 ✅", "success");
    sse.log("Redimensionnement Sharp...");
    const formats = await openaiLib.resizeLogo(b64);
    sse.log("4 formats PNG ✅", "success");
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
    return sse.done(
      claudeLib?.mockCodeGen?.(appName, packageId) || { files: {} },
    );
  }

  try {
    sse.log("Génération code Flutter (Claude)...");
    const code = await claudeLib.generateFlutterCode(
      appName,
      packageId,
      architecture,
    );
    sse.log(`${Object.keys(code.files).length} fichiers ✅`, "success");
    sse.done(code);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── SCREENSHOTS ──────────────────────────────────────────────────────────────
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
    let puppeteer;
    try {
      puppeteer = require("puppeteer");
    } catch {
      throw new Error("Puppeteer non installé — npm install puppeteer");
    }

    sse.log("Génération HTML preview...");
    const html = await claudeLib.generateAppPreviewHTML(appName, architecture);
    sse.log("Lancement Puppeteer...");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox"],
      headless: "new",
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const screenshots = [];
    for (const name of ["home", "checkin", "stats", "premium", "darkmode"]) {
      sse.log(`Capture ${name}...`);
      const buf = await page.screenshot({ type: "png" });
      const sharp = require("sharp");
      const framed = await sharp(buf)
        .resize(1440, 3120, {
          fit: "contain",
          background: architecture?.theme?.backgroundColor || "#ffffff",
        })
        .toBuffer();
      screenshots.push({
        name,
        b64: framed.toString("base64"),
        size: "1440x3120",
      });
    }
    await browser.close();
    sse.log("5 screenshots ✅", "success");
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
    return sse.done(claudeLib?.mockASO?.(appName, niche) || { title: appName });
  }

  try {
    sse.log("Génération listing ASO (Claude)...");
    const listing = await claudeLib.generateASO(appName, niche, marketData);
    sse.log(`Titre: "${listing.title}"`, "success");
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
    return sse.done(
      claudeLib?.mockCompliance?.(appName, packageId) || { policyUrl: "#" },
    );
  }

  try {
    sse.log("Génération Privacy Policy HTML...");
    const html = ppLib.generatePrivacyPolicyHTML(
      appName,
      packageId,
      features,
      "7C3AED",
      "privacy@appfactory.dev",
    );
    sse.log(`${html.length} chars ✅`, "success");
    const dataSafety = ppLib.generateDataSafetyJSON(features);
    sse.log("Publication GitHub → Vercel...");
    const policyUrl = await githubLib.publishPrivacyPolicy(
      appName,
      packageId,
      html,
    );
    sse.log(`${policyUrl}`, "success");
    sse.done({ policyUrl, policy: { html }, dataSafety });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── BUILD & DEPLOY ───────────────────────────────────────────────────────────
app.post("/api/agents/build-deploy", async (req, res) => {
  const { jobId, log, done, fail } = createJob();
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
        log("🟡 [DEV] Mode développement — simulation");
        await delay(500);
        log("Simulation GitHub Actions...");
        await delay(800);
        log("Workflow ID: dev-sim-123", "data");
        log("Build: in_progress (10s)...");
        await delay(1000);
        log("Build: completed ✅", "success");
        await delay(400);
        log("AAB extrait (45.2 MB) ✅", "success");
        await delay(300);
        log("Firebase Remote Config ✅", "success");
        await delay(300);
        log("Draft Play Console ✅ (simulation)", "success");
        log("Track: internal | Status: DRAFT", "data");
        return done({
          apkUrl: "#simulated",
          apkName: `${packageId}-debug.apk`,
          apkSize: "~42 MB",
          playConsoleStatus: "DRAFT (simulation)",
          draftUrl: "https://play.google.com/console",
        });
      }

      // ── PRODUCTION ──
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
      log("Build en cours (3-8 min)...");

      let attempts = 0,
        status = "queued";

      while (
        (status === "queued" || status === "in_progress") &&
        attempts < 90
      ) {
        await delay(10000);
        attempts++;
        try {
          status = await githubLib.getWorkflowStatus(workflowRun.id);
        } catch (pollErr) {
          log(`Retry (${pollErr.message})...`, "warn");
          continue;
        }
        const sec = attempts * 10;
        log(`Build ${status} (${Math.floor(sec / 60)}min ${sec % 60}s)...`);

        if (status === "failure") {
          throw new Error(`Build échoué — voir workflow`);
        }
      }

      if (status !== "completed")
        throw new Error(`Build timeout (${attempts * 10}s)`);
      log("Build Flutter terminé ✅", "success");

      log("Téléchargement artifact AAB (ZIP)...");
      let aabBuffer;
      try {
        const zipBuffer = await githubLib.downloadArtifact(
          workflowRun.id,
          "app-release-aab",
        );
        log(`ZIP: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`, "data");
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
          throw new Error(`Aucun .aab. Contenu: ${names}`);
        }
        aabBuffer = aabEntry.getData();
        log(
          `AAB: ${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB ✅`,
          "success",
        );
      } catch (zipErr) {
        throw new Error(`Extraction: ${zipErr.message}`);
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

      log("Brouillon créé ✅", "success");
      log("Track: internal | Status: DRAFT", "data");
      log("→ play.google.com/console → Ton app → Dashboard", "data");

      done({
        apkUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
        apkName: `${packageId}-debug.apk`,
        apkSize: "~45 MB",
        playConsoleStatus: "DRAFT",
        draftUrl: "https://play.google.com/console",
        workflowRunUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
      });
    } catch (err) {
      if (MOT_DEBUG) console.error(`[Job ${jobId}]`, err);
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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ App Factory Server — PORT ${PORT}`);
  console.log(`   Mode: ${MODE_ENV} | Debug: ${MOT_DEBUG}`);
  console.log(`   CORS: ${allowedOrigins.join(", ")}\n`);
});
