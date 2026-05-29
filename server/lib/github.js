"use strict";
const fetch = require("node-fetch");

const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_OWNER   = process.env.GITHUB_OWNER;   // ton username GitHub
const GITHUB_REPO    = process.env.GITHUB_REPO;    // nom du repo du moteur Flutter

const GH_API = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization:  `Bearer ${GITHUB_TOKEN}`,
    Accept:         "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Déclenche le workflow GitHub Actions de build Flutter.
 * Le workflow doit accepter inputs: app_name, package_id, primary_color.
 */
async function triggerBuild({ appName, packageId, code }) {
  const body = {
    ref:    "main",
    inputs: {
      app_name:      appName,
      package_id:    packageId,
      primary_color: code?.theme?.primaryColor || "#7C3AED",
    },
  };

  const res = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`,
    { method: "POST", headers: ghHeaders(), body: JSON.stringify(body) }
  );

  if (!res.ok) throw new Error(`GitHub Actions trigger failed: ${res.status} ${await res.text()}`);

  // Récupère l'ID du run qui vient de démarrer
  await new Promise((r) => setTimeout(r, 3000)); // attendre que le run apparaisse
  const runsRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=1&branch=main`,
    { headers: ghHeaders() }
  );
  const runs = await runsRes.json();
  return runs.workflow_runs[0];
}

/**
 * Vérifie le statut d'un workflow run.
 * Retourne: "in_progress" | "completed" | "failure"
 */
async function getWorkflowStatus(runId) {
  const res  = await fetch(`${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`, { headers: ghHeaders() });
  const data = await res.json();
  if (data.status === "completed") return data.conclusion === "success" ? "completed" : "failure";
  return "in_progress";
}

/**
 * Télécharge l'artifact AAB produit par GitHub Actions.
 */
async function downloadArtifact(runId, artifactName) {
  const artRes  = await fetch(`${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`, { headers: ghHeaders() });
  const artData = await artRes.json();
  const artifact = artData.artifacts?.find((a) => a.name === artifactName);
  if (!artifact) throw new Error(`Artifact "${artifactName}" non trouvé pour le run ${runId}`);

  const dlRes  = await fetch(artifact.archive_download_url, { headers: ghHeaders(), redirect: "follow" });
  const buffer = await dlRes.buffer();
  return buffer;
}

/**
 * Publie la Privacy Policy sur GitHub Pages.
 * Crée / met à jour le fichier dans le repo GitHub Pages.
 */
async function publishPrivacyPolicy(appName, packageId, html) {
  const fileName = `${packageId.replace(/\./g, "-")}-privacy.html`;
  const path     = `policies/${fileName}`;

  // Vérifie si le fichier existe déjà (pour le SHA)
  let sha;
  try {
    const check = await fetch(`${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, { headers: ghHeaders() });
    if (check.ok) {
      const existing = await check.json();
      sha = existing.sha;
    }
  } catch {}

  const body = {
    message: `Add privacy policy for ${appName}`,
    content: Buffer.from(html).toString("base64"),
    ...(sha ? { sha } : {}),
  };

  const res = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) }
  );

  if (!res.ok) throw new Error(`GitHub Pages publish failed: ${await res.text()}`);

  return `https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/${path}`;
}

/**
 * Upload AAB + listing vers Google Play Console via googleapis.
 * Nécessite: GOOGLE_PLAY_SERVICE_ACCOUNT (JSON) dans les env vars.
 */
async function uploadToPlayConsole({ packageId, aabBuffer, listing, logoBase64, screenshots, policyUrl }) {
  // Utilise la librairie googleapis
  const { google } = require("googleapis");

  const serviceAccount = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT || "{}");
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes:      ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const androidPublisher = google.androidpublisher({ version: "v3", auth });

  // 1. Créer un edit
  const editRes = await androidPublisher.edits.insert({ packageName: packageId });
  const editId  = editRes.data.id;

  // 2. Upload AAB
  const { Readable } = require("stream");
  const stream = Readable.from(aabBuffer);
  await androidPublisher.edits.bundles.upload({
    packageName: packageId,
    editId,
    media: { mimeType: "application/octet-stream", body: stream },
  });

  // 3. Set listing
  await androidPublisher.edits.listings.update({
    packageName: packageId,
    editId,
    language: "fr-FR",
    requestBody: {
      title:            listing.title,
      shortDescription: listing.shortDescription,
      fullDescription:  listing.description,
    },
  });

  // 4. Set track to internal draft
  await androidPublisher.edits.tracks.update({
    packageName: packageId,
    editId,
    track: "internal",
    requestBody: {
      releases: [{ status: "draft", versionCodes: ["1"] }],
    },
  });

  // 5. Commit
  const commitRes = await androidPublisher.edits.commit({
    packageName:    packageId,
    editId,
    changesNotSentForReview: false,
  });

  return {
    appId:          commitRes.data.id || packageId,
    apkDownloadUrl: null, // APK debug à télécharger depuis GitHub Artifacts
  };
}

module.exports = { triggerBuild, getWorkflowStatus, downloadArtifact, publishPrivacyPolicy, uploadToPlayConsole };
