"use strict";
/**
 * server/index.js — VERSION FINALE
 *
 * Architecture pour l'étape Build & Deploy :
 *
 *   AVANT (cassé) :
 *     POST /api/agents/build-deploy → SSE ouvert ~10 min → Railway coupe à ~300-500s
 *
 *   APRÈS (correct) :
 *     POST /api/agents/build-deploy → crée job background → répond {jobId} en 1s
 *     GET  /api/jobs/:jobId         → poll toutes les 3s → retourne nouveaux logs + statut
 *
 *   Les autres agents (< 60s) gardent le SSE simple.
 *
 * Dépendances à ajouter dans server/package.json :
 *   "adm-zip": "^0.5.10"
 * Puis : npm install adm-zip
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
const { createJob, getJobStatus } = require("./lib/jobQueue");

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

// ─── SSE HELPER (pour les agents courts < 60s) ───────────────────────────────
function createSSE(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Heartbeat toutes les 5s
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

// ─── POLL ENDPOINT — état d'un job ───────────────────────────────────────────
/**
 * GET /api/jobs/:jobId?cursor=N
 *
 * Le client appelle ça toutes les 3s.
 * Retourne uniquement les NOUVEAUX logs (depuis le curseur).
 * Quand status=done ou status=error → client s'arrête.
 */
app.get("/api/jobs/:jobId", (req, res) => {
  const { jobId } = req.params;
  const cursor = parseInt(req.query.cursor || "0", 10);

  const state = getJobStatus(jobId, cursor);

  if (!state.found) {
    return res.status(404).json({ error: "Job introuvable" });
  }

  res.json(state);
});

// ─── AGENTS COURTS (SSE standard) ────────────────────────────────────────────

app.post("/api/agents/market-scout", async (req, res) => {
  const sse = createSSE(res);
  const { niche } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(600);
    return sse.done(playstoreLib.mockData(niche));
  }

  try {
    sse.log(`Recherche "${niche}" sur Play Store (top 50)...`);
    const apps = await playstoreLib.search(niche, 50);
    sse.log(`${apps.length} apps récupérées`, "success");
    const stats = playstoreLib.analyze(apps);
    sse.log(
      `Saturation: ${stats.saturationLevel} | Score moy: ${stats.avgScore}/5`,
      "data",
    );
    sse.log("Analyse Claude Haiku...");
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

app.post("/api/agents/app-architect", async (req, res) => {
  const sse = createSSE(res);
  const { niche, marketData } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(800);
    return sse.done(claudeLib.mockArchitect(niche));
  }

  try {
    sse.log("Génération architecture via Claude...");
    const result = await claudeLib.generateArchitecture(niche, marketData);
    sse.log(`App: ${result.appName} | Package: ${result.packageId}`, "success");
    sse.done(result);
  } catch (err) {
    sse.fail(err);
  }
});

app.post("/api/agents/logo-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, primaryColor } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
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
    sse.log("Appel OpenAI GPT Image 1...");
    const { url, b64 } = await openaiLib.generateLogo(prompt);
    sse.log("Image 1024×1024 ✅", "success");
    sse.log("Redimensionnement Sharp → 512, 192, 48px...");
    const formats = await openaiLib.resizeLogo(b64);
    sse.log("4 formats PNG prêts ✅", "success");
    sse.done({ logoUrl: url, formats });
  } catch (err) {
    sse.fail(err);
  }
});

app.post("/api/agents/code-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(1200);
    return sse.done(claudeLib.mockCodeGen(appName, packageId));
  }

  try {
    sse.log("Génération code Flutter (Claude)...");
    const code = await claudeLib.generateFlutterCode(
      appName,
      packageId,
      architecture,
    );
    sse.log(`${Object.keys(code.files).length} fichiers générés ✅`, "success");
    sse.done(code);
  } catch (err) {
    sse.fail(err);
  }
});

app.post("/api/agents/screenshots", async (req, res) => {
  const sse = createSSE(res);
  const { appName, architecture } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
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
      throw new Error("npm install puppeteer dans /server");
    }

    sse.log("Génération HTML preview (Claude)...");
    const html = await claudeLib.generateAppPreviewHTML(appName, architecture);
    sse.log("Lancement Puppeteer...");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

app.post("/api/agents/aso", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, marketData } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(700);
    return sse.done(claudeLib.mockASO(appName, niche));
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

app.post("/api/agents/compliance", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId, features = [] } = req.body;

  if (!IS_PROD) {
    sse.log("[DEV] Données simulées");
    await delay(600);
    return sse.done(claudeLib.mockCompliance(appName, packageId));
  }

  try {
    sse.log("Génération Privacy Policy HTML (local)...");
    const html = ppLib.generatePrivacyPolicyHTML(
      appName,
      packageId,
      features,
      "7C3AED",
      "privacy@appfactory.dev",
    );
    sse.log(`HTML complet : ${html.length} chars ✅`, "success");
    sse.log("Génération Data Safety JSON...");
    const dataSafety = ppLib.generateDataSafetyJSON(features);
    sse.log("Publication GitHub → déploiement Vercel...");
    const policyUrl = await githubLib.publishPrivacyPolicy(
      appName,
      packageId,
      html,
    );
    sse.log(`Publiée : ${policyUrl}`, "success");
    sse.done({ policyUrl, policy: { html }, dataSafety });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── BUILD & DEPLOY — job background + poll ───────────────────────────────────
/**
 * POST /api/agents/build-deploy
 *
 * NE PAS utiliser SSE ici car le build prend 5-10 min.
 * Répond immédiatement avec { jobId }.
 * Le client poll GET /api/jobs/:jobId toutes les 3s.
 */
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

  // ── Mode dev ──────────────────────────────────────────────────────────────
  if (!IS_PROD) {
    const { jobId, log, done } = createJob();
    res.json({ jobId });

    // Simulation asynchrone (sans await bloquant pour la réponse)
    (async () => {
      log("🟡 [DEV] Mode développement — simulation du build");
      await delay(800);
      log("Simulation déclenchement GitHub Actions...");
      await delay(600);
      log("Workflow ID: dev-simulated-123 — en attente...", "data");
      await delay(1000);
      log("Build status: in_progress (10s)...");
      await delay(1000);
      log("Build status: in_progress (20s)...");
      await delay(800);
      log("Build status: completed ✅", "success");
      await delay(400);
      log("Téléchargement AAB simulé (45.2 MB)...");
      await delay(600);
      log("AAB extrait depuis ZIP ✅", "success");
      await delay(400);
      log("Firebase Remote Config configuré ✅", "success");
      await delay(400);
      log("Upload Play Console (draft)... [SIMULATION]");
      await delay(600);
      log("Draft créé sur Play Console ✅", "success");
      log("Track: internal | Status: DRAFT", "data");
      done({
        apkUrl: "#simulated",
        apkName: `${packageId}-debug.apk`,
        apkSize: "~42 MB",
        playConsoleStatus: "DRAFT (simulation)",
        draftUrl: "https://play.google.com/console",
        workflowRunUrl: "https://github.com",
      });
    })();
    return;
  }

  // ── Mode production ───────────────────────────────────────────────────────
  const { jobId, log, done, fail } = createJob();

  // Répondre IMMÉDIATEMENT avec le jobId — connexion HTTP se ferme proprement
  res.json({ jobId });

  // Tout le reste tourne en background — AUCUNE limite de temps côté connexion
  (async () => {
    try {
      // ÉTAPE 1 — Déclenchement GitHub Actions
      log("Préparation fichiers Flutter...");
      log("Déclenchement GitHub Actions (flutter build appbundle)...");

      let workflowRun;
      try {
        workflowRun = await githubLib.triggerBuild({
          appName,
          packageId,
          primaryColor: code?.theme?.primaryColor || "7C3AED",
        });
      } catch (err) {
        throw new Error(`Déclenchement GitHub Actions échoué : ${err.message}`);
      }

      log(`Workflow ID: ${workflowRun.id}`, "data");
      log(
        `Suivi GitHub : https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
        "data",
      );
      log("En attente de fin du build (peut prendre 3-8 minutes)...");

      // ÉTAPE 2 — Polling GitHub Actions (sans limite de temps connexion)
      let attempts = 0;
      let status = "queued";

      while (
        (status === "queued" || status === "in_progress") &&
        attempts < 90
      ) {
        await delay(10000); // 10s entre chaque vérif
        attempts++;

        try {
          status = await githubLib.getWorkflowStatus(workflowRun.id);
        } catch (pollErr) {
          log(`Retry vérification statut (${pollErr.message})...`, "warn");
          continue;
        }

        const sec = attempts * 10;
        const min = Math.floor(sec / 60);
        const s = sec % 60;
        const timeStr = min > 0 ? `${min}min ${s}s` : `${s}s`;
        log(`Build ${status} (${timeStr} écoulés)...`);

        if (status === "failure") {
          throw new Error(
            `Build GitHub Actions échoué. ` +
              `Voir : https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
          );
        }
      }

      if (status !== "completed") {
        throw new Error(
          `Build timeout après 15 minutes (run ${workflowRun.id})`,
        );
      }

      log("Build Flutter terminé ✅", "success");

      // ÉTAPE 3 — Téléchargement et extraction AAB depuis ZIP
      log("Téléchargement artifact AAB depuis GitHub...");
      let aabBuffer;
      try {
        const zipBuffer = await githubLib.downloadArtifact(
          workflowRun.id,
          "app-release-aab",
        );
        log(
          `ZIP téléchargé : ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`,
          "data",
        );

        log("Extraction AAB depuis le ZIP...");
        const zip = new AdmZip(zipBuffer);
        const aabEntry = zip
          .getEntries()
          .find((e) => e.entryName.endsWith(".aab"));
        if (!aabEntry) {
          const names = zip
            .getEntries()
            .map((e) => e.entryName)
            .join(", ");
          throw new Error(`Aucun .aab dans le ZIP. Contenu : ${names}`);
        }
        aabBuffer = aabEntry.getData();
        log(
          `AAB extrait : ${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB ✅`,
          "success",
        );
      } catch (zipErr) {
        throw new Error(`Extraction AAB échouée : ${zipErr.message}`);
      }

      // ÉTAPE 4 — APK debug
      let apkDownloadUrl = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`;
      let apkSizeMB = "~45";
      try {
        const apkZip = new AdmZip(
          await githubLib.downloadArtifact(workflowRun.id, "app-debug-apk"),
        );
        const apkEntry = apkZip
          .getEntries()
          .find((e) => e.entryName.endsWith(".apk"));
        if (apkEntry)
          apkSizeMB = (apkEntry.getData().length / 1024 / 1024).toFixed(0);
        log(`APK debug disponible : ~${apkSizeMB} MB ✅`, "success");
      } catch {
        log("APK debug non récupéré (non bloquant)", "warn");
      }

      // ÉTAPE 5 — Firebase Remote Config
      log("Configuration Firebase Remote Config (IDs AdMob TEST)...");
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
        log(
          "Firebase Remote Config ✅ — IDs modifiables sans republier",
          "success",
        );
        log(
          "→ console.firebase.google.com → Remote Config → Modifier les valeurs",
          "data",
        );
      } catch (fbErr) {
        log(`Firebase Remote Config ignoré : ${fbErr.message}`, "warn");
      }

      // ÉTAPE 6 — Upload Play Console
      log("Upload AAB vers Google Play Console (draft)...");
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

      log("Brouillon créé sur Play Console ✅", "success");
      log("Track: internal | Status: DRAFT", "data");
      log("→ play.google.com/console → Ton app → Tableau de bord", "data");

      const devId = process.env.GOOGLE_PLAY_DEVELOPER_ID || "";
      done({
        apkUrl: apkDownloadUrl,
        apkName: `${packageId}-debug.apk`,
        apkSize: `~${apkSizeMB} MB`,
        playConsoleStatus: "DRAFT",
        draftUrl: devId
          ? `https://play.google.com/console/u/0/developers/${devId}/app-list`
          : "https://play.google.com/console",
        workflowRunUrl: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/actions/runs/${workflowRun.id}`,
      });
    } catch (err) {
      fail(err);
    }
  })(); // IIFE — s'exécute en background
});

// ─── STATIC ──────────────────────────────────────────────────────────────────
// if (IS_PROD) {
//   const clientBuild = path.join(__dirname, "../client/dist");
//   app.use(express.static(clientBuild));
//   app.get("*", (_req, res) =>
//     res.sendFile(path.join(clientBuild, "index.html")),
//   );
// }

app.listen(PORT, () => {
  console.log(
    `✅ App Factory — port ${PORT} — mode: ${MODE_ENV} — debug: ${MOT_DEBUG}`,
  );
});
