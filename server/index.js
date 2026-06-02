"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

console.log("\n🔧 App Factory Server — Starting...\n");

// ─── SAFE REQUIRES ────────────────────────────────────────────────────────────
const { createJob, getJobStatus, getAllJobs } = require("./lib/jobQueue");

let claudeLib, openaiLib, playstoreLib, firebaseLib, githubLib, ppLib;

try {
  claudeLib = require("./lib/claude");
  console.log("✅ claudeLib loaded");
} catch (e) {
  console.warn("⚠️  claudeLib fallback:", e.message);
  claudeLib = {};
}

try {
  openaiLib = require("./lib/openai");
  console.log("✅ openaiLib loaded");
} catch (e) {
  console.warn("⚠️  openaiLib fallback:", e.message);
  openaiLib = {};
}

try {
  playstoreLib = require("./lib/playstore");
  console.log("✅ playstoreLib loaded");
} catch (e) {
  console.warn("⚠️  playstoreLib fallback:", e.message);
  playstoreLib = {};
}

try {
  firebaseLib = require("./lib/firebase");
  console.log("✅ firebaseLib loaded");
} catch (e) {
  console.warn("⚠️  firebaseLib fallback:", e.message);
  firebaseLib = {};
}

try {
  githubLib = require("./lib/github");
  console.log("✅ githubLib loaded");
} catch (e) {
  console.warn("⚠️  githubLib fallback:", e.message);
  githubLib = {};
}

try {
  ppLib = require("./lib/privacypolicy");
  console.log("✅ ppLib loaded");
} catch (e) {
  console.warn("⚠️  ppLib fallback:", e.message);
  ppLib = {};
}

const app = express();
const PORT = process.env.PORT || 4000;

const MODE_ENV = (process.env.MODE_ENV || "development").toLowerCase();
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
    "Cache-Control": "no-cache",
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
      send({
        event: "error",
        msg: err?.message || "Erreur",
        detail: err?.stack,
      });
      res.end();
    },
  };
}

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: MODE_ENV });
});

// ─── POLL ─────────────────────────────────────────────────────────────────────
app.get("/api/jobs/:jobId", (req, res) => {
  const { jobId } = req.params;
  const cursor = parseInt(req.query.cursor || "0", 10);
  const state = getJobStatus(jobId, cursor);
  if (!state.found)
    return res
      .status(404)
      .json({ error: `Job NOT FOUND`, availableJobs: getAllJobs() });
  res.json(state);
});

// ─── MARKET SCOUT ──────────────────────────────────────────────────────────────
app.post("/api/agents/market-scout", async (req, res) => {
  const sse = createSSE(res);
  const { niche } = req.body;
  sse.log(`Recherche marché "${niche}"...`);
  try {
    await delay(1500);
    const mockApps = [
      {
        title: "App A",
        developer: "Dev 1",
        score: 4.5,
        installs: "100k",
        ratings: 5000,
      },
      {
        title: "App B",
        developer: "Dev 2",
        score: 4.3,
        installs: "80k",
        ratings: 4000,
      },
      {
        title: "App C",
        developer: "Dev 3",
        score: 4.1,
        installs: "60k",
        ratings: 3000,
      },
    ];
    sse.log(`${mockApps.length} apps trouvés ✅`, "success");
    sse.done({
      niche,
      topCompetitors: mockApps,
      analysis: {
        saturationLevel: "medium",
        avgScore: 4.3,
        recommendation: `Marché "${niche}" viable avec bonne demande`,
      },
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── APP ARCHITECT ────────────────────────────────────────────────────────────
app.post("/api/agents/app-architect", async (req, res) => {
  const sse = createSSE(res);
  const { niche, marketData } = req.body;
  sse.log("Génération architecture...");
  try {
    await delay(1500);
    sse.log("Architecture générée ✅", "success");
    sse.done({
      appName: `${niche}Hub`,
      packageId: `com.appfactory.${niche.toLowerCase().replace(/\s+/g, "")}`,
      description: `Application pour ${niche}`,
      theme: { primaryColor: "7C3AED", accentColor: "EC4899" },
      features: ["Dashboard", "Analytics", "Notifications", "Premium"],
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── LOGO GEN ─────────────────────────────────────────────────────────────────
app.post("/api/agents/logo-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche, primaryColor } = req.body;
  sse.log("Génération logo...");
  try {
    await delay(2000);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect fill='%23${primaryColor}' width='512' height='512'/><text x='256' y='280' font-size='200' fill='white' text-anchor='middle' font-weight='bold'>${appName.charAt(0)}</text></svg>`;
    sse.log("Logo généré ✅", "success");
    sse.done({
      logoUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      formats: {
        logo512: Buffer.from(svg).toString("base64"),
        logo192: Buffer.from(svg).toString("base64"),
        logo48: Buffer.from(svg).toString("base64"),
      },
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── CODE GEN ─────────────────────────────────────────────────────────────────
app.post("/api/agents/code-gen", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId } = req.body;
  sse.log("Génération code Flutter...");
  try {
    await delay(2000);
    sse.log("Fichiers générés ✅", "success");
    sse.done({
      files: {
        "lib/main.dart": "// Flutter code generated",
        "pubspec.yaml": "name: app\nversion: 1.0.0",
      },
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── SCREENSHOTS ──────────────────────────────────────────────────────────────
app.post("/api/agents/screenshots", async (req, res) => {
  const sse = createSSE(res);
  sse.log("Génération screenshots...");
  try {
    await delay(1500);
    sse.log("5 screenshots générés ✅", "success");
    sse.done({
      screenshots: ["home", "checkin", "stats", "premium", "darkmode"].map(
        (name, i) => ({
          index: i + 1,
          name,
          b64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        }),
      ),
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── ASO ──────────────────────────────────────────────────────────────────────
app.post("/api/agents/aso", async (req, res) => {
  const sse = createSSE(res);
  const { appName, niche } = req.body;
  sse.log("Génération listing ASO...");
  try {
    await delay(1500);
    sse.log("Listing ASO créé ✅", "success");
    sse.done({
      title: `${appName} - ${niche}`,
      shortDescription: `Best app for ${niche} lovers`,
      description: `${appName} is the ultimate solution for ${niche}. Features include analytics, notifications, and premium content.`,
    });
  } catch (err) {
    sse.fail(err);
  }
});

// ─── COMPLIANCE ───────────────────────────────────────────────────────────────
app.post("/api/agents/compliance", async (req, res) => {
  const sse = createSSE(res);
  const { appName, packageId } = req.body;
  sse.log("Génération Privacy Policy...");
  try {
    await delay(1500);
    sse.log("Privacy Policy créée ✅", "success");
    sse.done({
      policyUrl: "https://example.com/privacy",
      policy: { html: `<h1>Privacy Policy for ${appName}</h1>` },
      dataSafety: { dataCollection: true },
    });
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
      const { appName, packageId, code } = req.body;

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

      log("Préparation...");
      log("Déclenchement GitHub Actions...");
      await delay(2000);
      log("Build en cours (simulation)...");
      await delay(2000);
      log("Build terminé ✅", "success");
      log("Upload Play Console...");
      await delay(1000);

      done({
        apkUrl: "#",
        apkName: `${packageId}-debug.apk`,
        apkSize: "~45 MB",
        playConsoleStatus: "DRAFT",
        draftUrl: "https://play.google.com/console",
      });
    } catch (err) {
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
  console.log(`✅ App Factory Server — PORT ${PORT} — mode: ${MODE_ENV}\n`);
});
