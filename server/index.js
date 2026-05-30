"use strict";
/**
 * server/index.js — VERSION COMPLÈTE CORRIGÉE
 *
 * Corrections :
 * 1. createSSE() : heartbeat SSE toutes les 5s → empêche Railway de couper la connexion
 * 2. Route build-deploy : artifact dézippé avant upload Play Console
 * 3. versionCodes : entiers [1] pas strings ["1"]
 * 4. Logs client api.js : ignore les lignes SSE comment ": ping"
 */

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

const app = express();
const PORT = process.env.PORT || 4000;

const MODE_ENV = (process.env.MODE_ENV || "development").toLowerCase();
const MOT_DEBUG = (process.env.MOT_DEBUG || "false").toLowerCase() === "true";
const IS_PROD = MODE_ENV === "production";

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

// ─── SSE HELPER — avec heartbeat pour éviter le timeout Railway ──────────────
/**
 * createSSE(res)
 *
 * Envoie un "ping" SSE toutes les 5 secondes.
 * Railway (et nginx) ferment les connexions idle après ~60s.
 * Le heartbeat maintient la connexion vivante pendant toute la durée du build.
 *
 * Format SSE heartbeat : ": ping\n\n"
 * (ligne commençant par ":" = commentaire SSE, ignoré par le client)
 */
function createSSE(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // désactive le buffer nginx/Railway
  });
  res.flushHeaders();

  // Heartbeat toutes les 5s — maintient la connexion vivante
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": ping\n\n");
    }
  }, 5000);

  const send = (obj) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    }
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
      clearInterval(heartbeatInterval);
      send({ event: "done", data });
      res.end();
    },
    fail(err) {
      clearInterval(heartbeatInterval);
      const detail = MOT_DEBUG
        ? err?.stack || String(err)
        : err?.message || "Erreur interne";
      send({ event: "error", msg: err?.message || "Erreur", detail });
      res.end();
    },
  };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: MODE_ENV, debug: MOT_DEBUG });
});

// ─── AGENT: MARKET SCOUT ─────────────────────────────────────────────────────
app.post("/api/agents/market-scout", async (req, res) => {
  const sse = createSSE(res);
  const { niche } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation — données factices");
    await delay(600);
    return sse.done(playstoreLib.mockData(niche));
  }

  try {
    sse.log(`Connexion google-play-scraper...`);
    sse.log(`Recherche "${niche}" sur Play Store (top 50)...`);
    const apps = await playstoreLib.search(niche, 50);
    sse.log(`${apps.length} apps récupérées`, "success");
    const stats = playstoreLib.analyze(apps);
    sse.log(
      `Saturation: ${stats.saturationLevel} | Score moy: ${stats.avgScore}/5`,
      "data",
    );
    sse.log("Analyse sémantique via Claude Haiku...");
    const analysis = await claudeLib.analyzeNiche(niche, apps.slice(0, 10));
    sse.log(`Verdict: ${analysis.recommendation}`, "success");
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

// ─── AGENT: APP ARCHITECT ────────────────────────────────────────────────────
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
    sse.done(result);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: LOGO GEN ─────────────────────────────────────────────────────────
app.post("/api/agents/logo-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, primaryColor } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(1000);
    return sse.done(openaiLib.mockLogo(appName));
  }

  try {
    sse.log("Génération prompt logo (Claude)...");
    const prompt = await claudeLib.generateLogoPrompt(
      appName,
      niche,
      primaryColor,
    );
    sse.log(`Prompt prêt`, "data");
    sse.log("Appel OpenAI GPT Image 1 ($0.011)...");
    const { url, b64 } = await openaiLib.generateLogo(prompt);
    sse.log("Image 1024×1024 générée ✅", "success");
    sse.log("Redimensionnement Sharp → 512, 192, 48px...");
    const formats = await openaiLib.resizeLogo(b64);
    sse.log("4 formats PNG prêts ✅", "success");
    sse.done({ logoUrl: url, formats });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: CODE GEN ─────────────────────────────────────────────────────────
app.post("/api/agents/code-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(1200);
    return sse.done(claudeLib.mockCodeGen(appName, packageId));
  }

  try {
    sse.log("Génération code Flutter via Claude Haiku...");
    const code = await claudeLib.generateFlutterCode(
      appName,
      packageId,
      architecture,
    );
    sse.log(`${Object.keys(code.files).length} fichiers générés ✅`, "success");
    sse.log(
      "Firebase Remote Config configuré — IDs AdMob externalisés ✅",
      "data",
    );
    sse.done(code);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: SCREENSHOTS ──────────────────────────────────────────────────────
app.post("/api/agents/screenshots", async (req, res) => {
  const sse = createSSE(res);
  const { appName, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(1000);
    return sse.done({
      screenshots: Array(5)
        .fill(null)
        .map((_, i) => ({
          index: i + 1,
          path: `screenshot_${i + 1}.png`,
          size: "1440x3120",
        })),
    });
  }

  try {
    let puppeteer;
    try {
      puppeteer = require("puppeteer");
    } catch {
      throw new Error(
        "Puppeteer non installé — npm install puppeteer dans /server",
      );
    }

    sse.log("Génération HTML preview (Claude)...");
    const html = await claudeLib.generateAppPreviewHTML(appName, architecture);

    sse.log("Lancement Puppeteer headless...");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: "new",
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const screenshots = [];
    const screens = ["home", "checkin", "stats", "premium", "darkmode"];
    for (const name of screens) {
      sse.log(`Capture écran ${name}...`);
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
    sse.log("5 screenshots générés ✅", "success");
    sse.done({ screenshots });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: ASO ──────────────────────────────────────────────────────────────
app.post("/api/agents/aso", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, marketData } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(700);
    return sse.done(claudeLib.mockASO(appName, niche));
  }

  try {
    sse.log("Génération listing ASO complet (Claude)...");
    const listing = await claudeLib.generateASO(appName, niche, marketData);
    sse.log(`Titre: "${listing.title}"`, "success");
    sse.log(
      `${listing.description?.length || 0} chars | ${listing.keywords?.length || 0} keywords`,
      "data",
    );
    sse.done(listing);
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: COMPLIANCE ───────────────────────────────────────────────────────
app.post("/api/agents/compliance", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, features = [] } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation");
    await delay(600);
    return sse.done(claudeLib.mockCompliance(appName, packageId));
  }

  try {
    sse.log("Génération Privacy Policy HTML (local — pas de tokens IA)...");
    const html = ppLib.generatePrivacyPolicyHTML(
      appName,
      packageId,
      features,
      "7C3AED",
      "privacy@appfactory.dev",
    );
    sse.log(`HTML généré : ${html.length} caractères ✅`, "success");

    sse.log("Génération Data Safety JSON...");
    const dataSafety = ppLib.generateDataSafetyJSON(features);
    sse.log(
      `${dataSafety.dataTypes.length} types de données déclarés ✅`,
      "success",
    );

    sse.log("Publication sur GitHub → déploiement Vercel...");
    const policyUrl = await githubLib.publishPrivacyPolicy(
      appName,
      packageId,
      html,
    );
    sse.log(`Privacy Policy publiée : ${policyUrl}`, "success");

    sse.done({ policyUrl, policy: { html }, dataSafety });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── AGENT: BUILD & DEPLOY ───────────────────────────────────────────────────
app.post("/api/agents/build-deploy", async (req, res) => {
  const sse = createSSE(res);
  const {
    appName,
    packageId,
    code,
    listing,
    policyUrl,
    logoBase64,
    screenshots,
  } = req.body;

  // ── Mode dev ──────────────────────────────────────────────────────────────
  if (!IS_PROD) {
    sse.log("[DEV] Mode simulation — pas de build réel");
    await delay(800);
    return sse.done({
      apkUrl: "#simulated",
      apkName: `${packageId}-debug.apk`,
      apkSize: "~42 MB",
      playConsoleStatus: "DRAFT (simulation)",
      draftUrl: "https://play.google.com/console",
    });
  }

  // ── Mode production ───────────────────────────────────────────────────────
  try {
    // ÉTAPE 1 — Déclenchement GitHub Actions
    sse.log("Préparation fichiers Flutter...");
    sse.log("Déclenchement GitHub Actions (flutter build appbundle)...");

    const workflowRun = await githubLib.triggerBuild({
      appName,
      packageId,
      primaryColor: code?.theme?.primaryColor || "7C3AED",
    });

    sse.log(
      `Workflow ID: ${workflowRun.id} — en attente du démarrage...`,
      "data",
    );
    sse.log(
      `Suivi : https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
      "data",
    );

    // ÉTAPE 2 — Polling (max 15 min = 90 × 10s)
    let attempts = 0;
    let status = "queued";

    while ((status === "in_progress" || status === "queued") && attempts < 90) {
      await delay(10000);
      attempts++;

      try {
        status = await githubLib.getWorkflowStatus(workflowRun.id);
      } catch (pollErr) {
        sse.log(`Retry vérification statut... (${pollErr.message})`, "warn");
        continue;
      }

      const sec = attempts * 10;
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      sse.log(
        `Build status: ${status} (${min > 0 ? `${min}min ` : ""}${s}s écoulés)...`,
      );

      if (status === "failure") {
        throw new Error(
          `Build GitHub Actions échoué. ` +
            `Voir : https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
        );
      }
    }

    if (status !== "completed") {
      throw new Error(
        `Build timeout après 15 minutes (run ID: ${workflowRun.id}). ` +
          `Vérifier GitHub Actions.`,
      );
    }

    sse.log("Build Flutter terminé ✅", "success");

    // ÉTAPE 3 — Téléchargement et dézippage AAB
    // GitHub retourne les artifacts sous forme de ZIP
    // Il faut dézipper pour extraire le .aab avant de l'uploader sur Play Console
    sse.log("Téléchargement artifact AAB depuis GitHub...");

    const zipBuffer = await githubLib.downloadArtifact(
      workflowRun.id,
      "app-release-aab",
    );
    sse.log(
      `ZIP téléchargé : ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`,
      "data",
    );

    sse.log("Extraction AAB depuis le ZIP...");
    let aabBuffer;
    try {
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      const aabEntry = entries.find((e) => e.entryName.endsWith(".aab"));
      if (!aabEntry) {
        const names = entries.map((e) => e.entryName).join(", ");
        throw new Error(
          `Aucun fichier .aab trouvé dans le ZIP. Contenu : ${names}`,
        );
      }
      aabBuffer = aabEntry.getData();
      sse.log(
        `AAB extrait : ${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB ✅`,
        "success",
      );
    } catch (zipErr) {
      throw new Error(`Extraction AAB échouée : ${zipErr.message}`);
    }

    // ÉTAPE 4 — URL APK debug
    let apkDownloadUrl = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`;
    let apkSizeMB = "~45";

    try {
      const apkZipBuffer = await githubLib.downloadArtifact(
        workflowRun.id,
        "app-debug-apk",
      );
      const apkZip = new AdmZip(apkZipBuffer);
      const apkEntry = apkZip
        .getEntries()
        .find((e) => e.entryName.endsWith(".apk"));
      if (apkEntry) {
        apkSizeMB = (apkEntry.getData().length / 1024 / 1024).toFixed(0);
      }
      sse.log(`APK debug disponible : ~${apkSizeMB} MB ✅`, "success");
    } catch {
      sse.log("APK debug non récupéré (non bloquant)", "warn");
    }

    // ÉTAPE 5 — Firebase Remote Config
    sse.log("Configuration Firebase Remote Config...");
    try {
      await firebaseLib.setupRemoteConfig(packageId, {
        ads_banner_id: "ca-app-pub-3940256099942544/6300978111",
        ads_interstitial_id: "ca-app-pub-3940256099942544/1033173712",
        ads_rewarded_id: "ca-app-pub-3940256099942544/5224354917",
        ads_enabled: "true",
        interstitial_every_n: "3",
        premium_price_usd: "4.99",
        show_premium_cta: "true",
      });
      sse.log(
        "Firebase Remote Config ✅ — IDs AdMob modifiables sans republier",
        "success",
      );
    } catch (fbErr) {
      sse.log(
        `Firebase Remote Config ignoré (non bloquant) : ${fbErr.message}`,
        "warn",
      );
    }

    // ÉTAPE 6 — Upload Play Console
    sse.log("Upload AAB vers Play Console (draft)...");
    let draft;
    try {
      draft = await githubLib.uploadToPlayConsole({
        packageId,
        aabBuffer,
        listing,
        logoBase64,
        screenshots,
        policyUrl,
      });
    } catch (pcErr) {
      throw new Error(`Upload Play Console échoué : ${pcErr.message}`);
    }

    sse.log("Draft créé sur Play Console ✅", "success");
    sse.log("Track: internal | Status: DRAFT", "data");

    const devId = process.env.GOOGLE_PLAY_DEVELOPER_ID || "";
    const consoleUrl = devId
      ? `https://play.google.com/console/u/0/developers/${devId}/app-list`
      : "https://play.google.com/console";

    sse.done({
      apkUrl: apkDownloadUrl,
      apkName: `${packageId}-debug.apk`,
      apkSize: `~${apkSizeMB} MB`,
      playConsoleStatus: "DRAFT",
      draftUrl: consoleUrl,
      workflowRunUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── STATIC (production) ─────────────────────────────────────────────────────
if (IS_PROD) {
  const clientBuild = path.join(__dirname, "../client/dist");
  app.use(express.static(clientBuild));
  app.get("*", (_req, res) =>
    res.sendFile(path.join(clientBuild, "index.html")),
  );
}

app.listen(PORT, () => {
  console.log(
    `✅ App Factory Server — port ${PORT} — mode: ${MODE_ENV} — debug: ${MOT_DEBUG}`,
  );
});
