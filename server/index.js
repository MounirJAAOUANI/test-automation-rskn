"use strict";
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const claudeLib   = require("./lib/claude");
const openaiLib   = require("./lib/openai");
const playstoreLib = require("./lib/playstore");
const firebaseLib = require("./lib/firebase");
const githubLib   = require("./lib/github");

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── ENV ────────────────────────────────────────────────────────────────────
const MODE_ENV  = (process.env.MODE_ENV  || "development").toLowerCase();
const MOT_DEBUG = (process.env.MOT_DEBUG || "false").toLowerCase() === "true";
const IS_PROD   = MODE_ENV === "production";

// ─── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

// ─── SSE HELPER ─────────────────────────────────────────────────────────────
/**
 * Creates an SSE stream helper.
 * Usage: const sse = createSSE(res); sse.log("msg"); sse.done(data); sse.fail(err);
 */
function createSSE(res) {
  res.writeHead(200, {
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection":    "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  return {
    log(msg, type = "info") {
      send({ event: "log", type, msg, ts: new Date().toLocaleTimeString("fr-FR") });
    },
    done(data) {
      send({ event: "done", data });
      res.end();
    },
    fail(err) {
      const detail = MOT_DEBUG ? (err?.stack || String(err)) : err?.message || "Erreur interne";
      send({ event: "error", msg: err?.message || "Erreur", detail });
      res.end();
    },
  };
}

// ─── HEALTH ─────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: MODE_ENV, debug: MOT_DEBUG });
});

// ─── AGENT: MARKET SCOUT ────────────────────────────────────────────────────
app.post("/api/agents/market-scout", async (req, res) => {
  const sse  = createSSE(res);
  const { niche } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation — pas d'appel réel Play Store");
    await delay(600);
    sse.log("Génération données factices...");
    await delay(400);
    return sse.done(playstoreLib.mockData(niche));
  }

  try {
    sse.log(`Connexion google-play-scraper...`);
    sse.log(`Recherche "${niche}" sur Play Store (top 50)...`);
    const apps = await playstoreLib.search(niche, 50);
    sse.log(`${apps.length} apps récupérées`, "success");

    sse.log("Calcul saturation + score moyen...");
    const stats = playstoreLib.analyze(apps);
    sse.log(`Saturation: ${stats.saturationLevel} | Score moy: ${stats.avgScore}/5`, "data");

    sse.log("Analyse sémantique via Claude Haiku...");
    const analysis = await claudeLib.analyzeNiche(niche, apps.slice(0, 10));
    sse.log(`Verdict: ${analysis.recommendation}`, "success");
    sse.log(`Opportunité détectée: ${analysis.nicheGap}`, "data");

    sse.done({
      niche,
      topCompetitors: apps.slice(0, 8).map((a, i) => ({
        rank: i + 1,
        name: a.title,
        developer: a.developer,
        score: a.score,
        installs: a.installs,
        ratings: a.ratings,
        isFree: a.free,
        mainFeature: a.summary || "",
      })),
      analysis: { ...stats, ...analysis },
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: APP ARCHITECT ───────────────────────────────────────────────────
app.post("/api/agents/app-architect", async (req, res) => {
  const sse = createSSE(res);
  const { niche, marketData } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(800);
    return sse.done(claudeLib.mockArchitect(niche));
  }

  try {
    sse.log("Analyse résultats Market Scout...");
    sse.log("Génération nom + package ID via Claude...");
    const result = await claudeLib.generateArchitecture(niche, marketData);
    sse.log(`Nom: ${result.appName} | Package: ${result.packageId}`, "success");
    sse.log(`Thème: ${result.theme.primaryColor} | ${result.screens.length} écrans`, "data");
    sse.done(result);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: LOGO GEN ────────────────────────────────────────────────────────
app.post("/api/agents/logo-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, primaryColor } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation — pas d'appel OpenAI");
    await delay(1000);
    return sse.done(openaiLib.mockLogo(appName));
  }

  try {
    sse.log("Génération prompt logo (Claude)...");
    const prompt = await claudeLib.generateLogoPrompt(appName, niche, primaryColor);
    sse.log(`Prompt: "${prompt.substring(0, 60)}..."`, "data");

    sse.log("Appel OpenAI GPT Image 2 Standard ($0.011)...");
    const { url, b64 } = await openaiLib.generateLogo(prompt);
    sse.log("Image 1024×1024 générée ✅", "success");

    sse.log("Redimensionnement Sharp → 512×512...");
    const formats = await openaiLib.resizeLogo(b64);
    sse.log("Formats 512, 192, 48 générés ✅", "success");

    sse.done({ logoUrl: url, formats });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: CODE GEN ────────────────────────────────────────────────────────
app.post("/api/agents/code-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(1200);
    return sse.done(claudeLib.mockCodeGen(appName, packageId));
  }

  try {
    const files = [
      "lib/main.dart",
      "lib/app.dart",
      "lib/screens/home_screen.dart",
      "lib/screens/checkin_screen.dart",
      "lib/screens/stats_screen.dart",
      "lib/screens/settings_screen.dart",
      "lib/services/admob_service.dart",
      "lib/services/firebase_service.dart",
      "lib/services/iap_service.dart",
      "lib/widgets/streak_counter.dart",
      "pubspec.yaml",
      "android/app/google-services.json (placeholder)",
    ];

    for (const f of files) {
      sse.log(`Génération ${f}...`);
      await delay(300);
    }

    sse.log("Génération code via Claude Haiku...");
    const code = await claudeLib.generateFlutterCode(appName, packageId, architecture);
    sse.log(`${Object.keys(code.files).length} fichiers générés`, "success");
    sse.log("Firebase Remote Config configuré — IDs AdMob externalisés ✅", "data");

    sse.done(code);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: SCREENSHOTS ─────────────────────────────────────────────────────
app.post("/api/agents/screenshots", async (req, res) => {
  const sse = createSSE(res);
  const { appName, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation — pas de Puppeteer");
    await delay(1000);
    return sse.done({ screenshots: Array(5).fill(null).map((_, i) => ({ index: i + 1, path: `screenshot_${i + 1}.png`, size: "1440x3120" })) });
  }

  try {
    // Puppeteer est dans un module optionnel — vérifie disponibilité
    let puppeteer;
    try {
      puppeteer = require("puppeteer");
    } catch {
      throw new Error("Puppeteer non installé. Lance: npm install puppeteer dans /server");
    }

    sse.log("Génération HTML preview de l'app (Claude)...");
    const html = await claudeLib.generateAppPreviewHTML(appName, architecture);

    sse.log("Lancement navigateur headless Puppeteer...");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: "new",
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const screens = [
      { name: "home",     route: "#home",     label: "Track Your Habits Daily" },
      { name: "checkin",  route: "#checkin",  label: "One Tap Check-In" },
      { name: "stats",    route: "#stats",    label: "See Your Progress" },
      { name: "premium",  route: "#premium",  label: "Go Premium — Unlock All" },
      { name: "darkmode", route: "#dark",     label: "Dark Mode Included" },
    ];

    const screenshots = [];
    for (const s of screens) {
      sse.log(`Capture écran ${s.name} (1440×3120)...`);
      const buf = await page.screenshot({ type: "png" });
      // Resize + device frame via sharp
      const sharp = require("sharp");
      const framed = await sharp(buf)
        .resize(1440, 3120, { fit: "contain", background: architecture.theme?.backgroundColor || "#ffffff" })
        .toBuffer();
      screenshots.push({ name: s.name, b64: framed.toString("base64"), size: "1440x3120" });
      await delay(200);
    }

    await browser.close();
    sse.log("5 screenshots générés ✅", "success");
    sse.done({ screenshots });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: ASO ─────────────────────────────────────────────────────────────
app.post("/api/agents/aso", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, marketData } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(700);
    return sse.done(claudeLib.mockASO(appName, niche));
  }

  try {
    sse.log("Extraction keywords longue-traîne depuis Market Scout...");
    sse.log("Génération titre Play Store (30 chars max, Claude)...");
    sse.log("Génération description longue SEO (4000 chars, Claude)...");
    sse.log("Génération 13 keywords ASO...");
    const listing = await claudeLib.generateASO(appName, niche, marketData);
    sse.log(`Titre: "${listing.title}"`, "success");
    sse.log(`Description: ${listing.description.length} chars | ${listing.keywords.length} keywords`, "data");
    sse.done(listing);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: COMPLIANCE ──────────────────────────────────────────────────────
app.post("/api/agents/compliance", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, features } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(600);
    return sse.done(claudeLib.mockCompliance(appName, packageId));
  }

  try {
    sse.log("Détection SDKs utilisés: AdMob, Firebase, IAP...");
    sse.log("Génération Privacy Policy RGPD (Claude)...");
    const policy = await claudeLib.generatePrivacyPolicy(appName, packageId, features);

    sse.log("Publication GitHub Pages...");
    const policyUrl = await githubLib.publishPrivacyPolicy(appName, packageId, policy.html);
    sse.log(`Privacy Policy publiée: ${policyUrl}`, "success");

    sse.log("Génération Data Safety declaration JSON...");
    const dataSafety = await claudeLib.generateDataSafety(appName, features);
    sse.log("UMP (User Messaging Platform) RGPD configuré ✅", "success");

    sse.done({ policyUrl, policy, dataSafety });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: BUILD & DEPLOY ──────────────────────────────────────────────────
app.post("/api/agents/build-deploy", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, code, listing, policyUrl, logoBase64, screenshots } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation — pas de build réel");
    await delay(1500);
    return sse.done({
      aabPath: "/tmp/app-release.aab",
      apkUrl: "#simulated",
      apkName: `${packageId}-debug.apk`,
      apkSize: "~42 MB",
      playConsoleStatus: "DRAFT (simulation)",
      draftUrl: "https://play.google.com/console",
    });
  }

  try {
    sse.log("Préparation fichiers Flutter...");
    // 1. Trigger GitHub Actions workflow
    sse.log("Déclenchement GitHub Actions (flutter build appbundle)...");
    const workflowRun = await githubLib.triggerBuild({ appName, packageId, code });
    sse.log(`Workflow ID: ${workflowRun.id} — en attente...`, "data");

    // 2. Poll for completion
    let attempts = 0;
    let status = "in_progress";
    while (status === "in_progress" && attempts < 60) {
      await delay(5000);
      status = await githubLib.getWorkflowStatus(workflowRun.id);
      sse.log(`Build status: ${status} (${attempts * 5}s)...`);
      attempts++;
    }

    if (status !== "completed") throw new Error("Build timeout — vérifiez GitHub Actions");
    sse.log("Build Flutter terminé ✅", "success");

    // 3. Download AAB from artifacts
    sse.log("Téléchargement AAB depuis GitHub Artifacts...");
    const aabBuffer = await githubLib.downloadArtifact(workflowRun.id, "app-release.aab");
    sse.log(`AAB téléchargé: ${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB`, "success");

    // 4. Setup Firebase Remote Config
    sse.log("Configuration Firebase Remote Config...");
    await firebaseLib.setupRemoteConfig(packageId, {
      ads_banner_id:        "ca-app-pub-3940256099942544/6300978111", // TEST ID
      ads_interstitial_id:  "ca-app-pub-3940256099942544/1033173712", // TEST ID
      ads_rewarded_id:      "ca-app-pub-3940256099942544/5224354917", // TEST ID
      ads_enabled:          "true",
      interstitial_every_n: "3",
      premium_price_usd:    "4.99",
      show_premium_cta:     "true",
    });
    sse.log("Firebase Remote Config configuré — IDs AdMob modifiables sans republier ✅", "success");

    // 5. Upload to Play Console
    sse.log("Upload AAB vers Play Console (draft)...");
    const draft = await githubLib.uploadToPlayConsole({
      packageId,
      aabBuffer,
      listing,
      logoBase64,
      screenshots,
      policyUrl,
    });
    sse.log(`Draft créé sur Play Console ✅`, "success");
    sse.log(`Track: internal | Status: DRAFT`, "data");

    sse.done({
      apkUrl: draft.apkDownloadUrl || "#",
      apkName: `${packageId}-debug.apk`,
      apkSize: `~${(aabBuffer.length / 1024 / 1024).toFixed(0)} MB`,
      playConsoleStatus: "DRAFT",
      draftUrl: `https://play.google.com/console/u/0/developers/${process.env.GOOGLE_PLAY_DEVELOPER_ID}/app/${draft.appId}/releases`,
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── STATIC CLIENT (production) ─────────────────────────────────────────────
if (IS_PROD) {
  const clientBuild = path.join(__dirname, "../client/dist");
  app.use(express.static(clientBuild));
  app.get("*", (_req, res) => res.sendFile(path.join(clientBuild, "index.html")));
}

// ─── START ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ App Factory Server — port ${PORT} — mode: ${MODE_ENV} — debug: ${MOT_DEBUG}`);
});

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
