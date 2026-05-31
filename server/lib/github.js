"use strict";
/**
 * server/lib/github.js
 *
 * FIX : require("googleapis") déplacé dans uploadToPlayConsole()
 *       pour éviter les erreurs de module absent au démarrage.
 *       Utilise un try/catch pour message clair si absent.
 */

const fetch = require("node-fetch");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const VERCEL_PROJECT_URL = (process.env.VERCEL_PROJECT_URL || "").replace(
  /\/$/,
  "",
);
const GH_API = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ─── TRIGGER BUILD ────────────────────────────────────────────────────────────
async function triggerBuild({ appName, packageId, primaryColor }) {
  const beforeRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=10&branch=main`,
    { headers: ghHeaders() },
  );
  const beforeData = await beforeRes.json();
  const existingIds = new Set(
    (beforeData.workflow_runs || []).map((r) => r.id),
  );

  const cleanColor = (primaryColor || "7C3AED").replace(/#/g, "");
  const trigRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`,
    {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({
        ref: "main",
        inputs: {
          app_name: appName,
          package_id: packageId,
          primary_color: cleanColor,
        },
      }),
    },
  );

  if (!trigRes.ok) {
    const errText = await trigRes.text();
    throw new Error(
      `GitHub Actions dispatch failed (${trigRes.status}): ${errText}\n` +
        `Vérifiez que GITHUB_TOKEN a le scope "workflow".`,
    );
  }

  let newRun = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const afterRes = await fetch(
      `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=10&branch=main`,
      { headers: ghHeaders() },
    );
    const afterData = await afterRes.json();
    const fresh = (afterData.workflow_runs || []).find(
      (r) => !existingIds.has(r.id),
    );
    if (fresh) {
      newRun = fresh;
      break;
    }
  }

  if (!newRun) {
    throw new Error(
      "Impossible de trouver le nouveau run après dispatch. " +
        "Vérifiez que GITHUB_TOKEN a le scope 'workflow'.",
    );
  }

  return newRun;
}

// ─── GET STATUS ───────────────────────────────────────────────────────────────
async function getWorkflowStatus(runId) {
  const res = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`,
    { headers: ghHeaders() },
  );
  if (!res.ok) throw new Error(`GitHub status check failed (${res.status})`);
  const data = await res.json();
  if (data.status === "completed") {
    return data.conclusion === "success" ? "completed" : "failure";
  }
  return data.status || "in_progress";
}

// ─── DOWNLOAD ARTIFACT ─────────────────────────────────────────────────────────
async function downloadArtifact(runId, artifactName) {
  const listRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`,
    { headers: ghHeaders() },
  );
  const listData = await listRes.json();
  const artifacts = listData.artifacts || [];
  const artifact = artifacts.find((a) => a.name === artifactName);

  if (!artifact) {
    const available = artifacts.map((a) => `"${a.name}"`).join(", ") || "aucun";
    throw new Error(
      `Artifact "${artifactName}" introuvable pour run ${runId}. ` +
        `Disponibles : ${available}`,
    );
  }

  const dlRes = await fetch(artifact.archive_download_url, {
    headers: ghHeaders(),
    redirect: "follow",
  });
  if (!dlRes.ok)
    throw new Error(`Téléchargement artifact échoué (${dlRes.status})`);
  return dlRes.buffer();
}

// ─── PUBLISH PRIVACY POLICY ────────────────────────────────────────────────────
async function publishPrivacyPolicy(appName, packageId, html) {
  const fileName = `${packageId.replace(/\./g, "-")}-privacy.html`;
  const repoPath = `policies/${fileName}`;

  let sha;
  try {
    const checkRes = await fetch(
      `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`,
      { headers: ghHeaders() },
    );
    if (checkRes.ok) sha = (await checkRes.json()).sha;
  } catch {}

  const putRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`,
    {
      method: "PUT",
      headers: ghHeaders(),
      body: JSON.stringify({
        message: sha
          ? `Update privacy policy — ${appName}`
          : `Add privacy policy — ${appName}`,
        content: Buffer.from(html, "utf8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    },
  );

  if (!putRes.ok) {
    throw new Error(
      `GitHub upload failed (${putRes.status}): ${await putRes.text()}`,
    );
  }

  if (!VERCEL_PROJECT_URL) {
    throw new Error("Variable VERCEL_PROJECT_URL manquante dans Railway.");
  }

  return `${VERCEL_PROJECT_URL}/${fileName}`;
}

// ─── UPLOAD TO PLAY CONSOLE ────────────────────────────────────────────────────
/**
 * FIX : require("googleapis") déplacé ici (pas à la racine du fichier)
 *       → évite "Cannot find module" au démarrage si googleapis manque
 *       → essaie de charger, affiche un message clair sinon
 */
async function uploadToPlayConsole({
  packageId,
  aabBuffer,
  listing,
  policyUrl,
}) {
  // Charger googleapis de façon sécurisée
  let google;
  try {
    google = require("googleapis");
  } catch (err) {
    throw new Error(
      `Impossible de charger googleapis — est-ce que "npm install" a été exécuté dans /server ? ` +
        `(${err.message})`,
    );
  }

  const rawSA = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  if (!rawSA)
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT manquant dans Railway.");

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawSA);
  } catch (e) {
    throw new Error(`GOOGLE_PLAY_SERVICE_ACCOUNT JSON invalide : ${e.message}`);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const pub = google.androidpublisher({ version: "v3", auth });

  // 1. Créer l'edit
  const editRes = await pub.edits.insert({ packageName: packageId });
  const editId = editRes.data.id;
  if (!editId) throw new Error("Play Console : impossible de créer un edit.");

  // 2. Upload AAB
  const { Readable } = require("stream");
  await pub.edits.bundles.upload({
    packageName: packageId,
    editId,
    media: {
      mimeType: "application/octet-stream",
      body: Readable.from(aabBuffer),
    },
  });

  // 3. Listing fr-FR
  if (listing?.title) {
    await pub.edits.listings.update({
      packageName: packageId,
      editId,
      language: "fr-FR",
      requestBody: {
        title: (listing.title || "").substring(0, 50),
        shortDescription: (listing.shortDescription || "").substring(0, 80),
        fullDescription: (listing.description || "").substring(0, 4000),
      },
    });
  }

  // 4. Listing en-US
  if (listing?.title) {
    await pub.edits.listings.update({
      packageName: packageId,
      editId,
      language: "en-US",
      requestBody: {
        title: (listing.title || "").substring(0, 50),
        shortDescription: (listing.shortDescription || "").substring(0, 80),
        fullDescription: (listing.description || "").substring(0, 4000),
      },
    });
  }

  // 5. Track internal draft
  await pub.edits.tracks.update({
    packageName: packageId,
    editId,
    track: "internal",
    requestBody: { releases: [{ status: "draft", versionCodes: [1] }] },
  });

  // 6. Commit
  const commitRes = await pub.edits.commit({
    packageName: packageId,
    editId,
    changesNotSentForReview: false,
  });

  return { appId: commitRes.data.id || packageId, apkDownloadUrl: null };
}

module.exports = {
  triggerBuild,
  getWorkflowStatus,
  downloadArtifact,
  publishPrivacyPolicy,
  uploadToPlayConsole,
};
