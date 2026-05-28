import fs from "fs";
import express from "express";
import cors from "cors";
import https from "https";

const app = express();

app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY =
  "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";

const OPEN_AI_API_KEY =
  "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";

/**
//-------------- CONFIGURATION --------------//
// Claude API
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: ANTHROPIC_API_KEY, //process.env.ANTHROPIC_API_KEY,
});

async function generateWithClaude(prompt) {
  const message = await client.messages.create({
    model: "claude-haiku-4.5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content[0].text;
}

// OpenAI API (logo generation)
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: OPEN_AI_API_KEY, //process.env.OPENAI_API_KEY,
});

async function generateLogo(appIdea, colors) {
  const prompt = `Minimalist app logo for: ${appIdea}. 
  Colors: ${colors.primary}. 
  Vector style, simple, modern. 
  1024x1024, transparent background.`;

  const response = await openai.images.generate({
    model: "gpt-image-2",
    prompt: prompt,
    size: "1024x1024",
    quality: "standard", // "standard" = $0.011 / "hd" = $0.020
  });

  return response.data[0].url;
}

// Google Play Scraper (market research)
const gplay = require("google-play-scraper");

async function analyzeNiche(keyword) {
  const apps = await gplay.search({
    term: keyword,
    num: 50,
    lang: "en",
    country: "us",
  });

  return {
    totalApps: apps.length,
    appsWithMillion: apps.filter((a) => parseInt(a.installs) > 1000000).length,
    avgScore: (
      apps.reduce((s, a) => s + parseFloat(a.score), 0) / apps.length
    ).toFixed(2),
    topApps: apps.slice(0, 3).map((a) => ({ name: a.title, score: a.score })),
  };
}

// Puppeteer (screenshots)
const puppeteer = require("puppeteer");
const sharp = require("sharp");

async function takeAppScreenshots(appUrl) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width: 1080, height: 1920 });
  await page.goto(appUrl);

  const screenshot = await page.screenshot({ fullPage: true });

  // Redimensionner pour Play Store (1440x3120)
  const resized = await sharp(screenshot)
    .resize(1440, 3120, { fit: "contain", background: "#fff" })
    .toFile("screenshot-store.png");

  await browser.close();
  return resized;
}

// Firebase Remote Config (configuration AdMob)
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "your-project-id",
});

async function setupRemoteConfig(appId) {
  const rc = admin.remoteConfig();

  const template = {
    parameters: {
      ads_banner_id: {
        defaultValue: { value: "ca-app-pub-3940256099942544/6300978111" }, // TEST ID
        displayName: "AdMob Banner ID",
      },
      ads_interstitial_id: {
        defaultValue: { value: "ca-app-pub-3940256099942544/1033173712" }, // TEST ID
        displayName: "AdMob Interstitial ID",
      },
      premium_price: {
        defaultValue: { value: "4.99" },
        displayName: "IAP Price USD",
      },
      ads_enabled: {
        defaultValue: { value: "true" },
        displayName: "Master ads toggle",
      },
    },
  };

  await rc.createRelease({ template });
}

// Google Play Developer API (upload APK)
const androidPublisher = require("google-play-api");

async function uploadAPKToDraft(appId, aabPath, serviceAccount) {
  const publisher = androidPublisher({
    credentials: serviceAccount,
  });

  const release = await publisher.edits.insert({
    packageName: appId,
  });

  // Upload AAB
  await publisher.edits.bundles.upload({
    packageName: appId,
    editId: release.id,
    media: { body: fs.createReadStream(aabPath) },
  });

  // Mettre en brouillon (track=internal)
  await publisher.edits.tracks.update({
    packageName: appId,
    editId: release.id,
    track: "internal",
    resource: { releases: [{ status: "draft" }] },
  });

  // Commit
  await publisher.edits.commit({
    packageName: appId,
    editId: release.id,
  });
}
//-------------- FIN CONFIGURATION --------------//
*/

async function callClaude(systemPrompt, userMessage) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", //"claude-sonnet-4-5-20250929",
      max_tokens: 1000,
      //   temperature: 1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
      temperature: 1,
      thinking: {
        type: "disabled",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();

  console.info("data : ", data);
  //   console.info(
  //     "data.content?.map(b => b.text) : ",
  //     data.content?.map((b) => b.text),
  //   );
  //   console.info(
  //     "data.content?.map(b => b.text || '') : ",
  //     data.content?.map((b) => b.text || ""),
  //   );
  //   console.info(
  //     "data.content?.map(b => b.text || '').join('') : ",
  //     data.content?.map((b) => b.text || "").join(""),
  //   );

  return data.content.map((b) => b.text).join("");
}

app.post("/chat", async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);
    const { systemPrompt, message } = req.body;

    const result = await callClaude(systemPrompt, message);

    console.info("result : ", result);

    res.json({ text: result });
  } catch (e) {
    console.error("BACKEND ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

const options = {
  key: fs.readFileSync("./key.pem"),
  cert: fs.readFileSync("./cert.pem"),
};

https.createServer(options, app).listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
