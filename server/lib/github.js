"use strict";
/**
 * server/lib/github.js
 *
 * Gère :
 * - Publication Privacy Policy sur GitHub (repo privé) → URL Vercel retournée
 * - Déclenchement build GitHub Actions
 * - Download artifacts (AAB + APK)
 * - Upload Play Console via googleapis
 *
 * Variables d'environnement requises :
 *   GITHUB_TOKEN       → Personal Access Token (ghp_...)
 *   GITHUB_OWNER       → ton username GitHub (ex: MounirJAAOUANI)
 *   GITHUB_REPO        → nom du repo (ex: test-automation-rskn)
 *   VERCEL_PROJECT_URL → URL Vercel sans slash final (ex: https://test-automation-rskn.vercel.app)
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

// ─── HEADERS ────────────────────────────────────────────────────────────────
function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ─── PUBLISH PRIVACY POLICY ─────────────────────────────────────────────────
/**
 * Publie le HTML de la privacy policy dans le repo GitHub.
 *
 * Repo privé + Vercel connecté :
 *   - Le fichier est écrit à la RACINE du repo (pas dans policies/)
 *     pour que Vercel le serve directement à /<filename>
 *   - URL retournée = VERCEL_PROJECT_URL/<filename>
 *
 * Exemple :
 *   packageId = "com.appfactory.wealthflow"
 *   filename  = "com-appfactory-wealthflow-privacy.html"
 *   URL       = https://test-automation-rskn.vercel.app/com-appfactory-wealthflow-privacy.html
 *
 * @param {string} appName
 * @param {string} packageId
 * @param {string} html       — HTML complet généré par privacypolicy.js
 * @returns {string}          — URL Vercel publique
 */
async function publishPrivacyPolicy(appName, packageId, html) {
  // Nom de fichier : remplace les points par des tirets
  const fileName = `${packageId.replace(/\./g, "-")}-privacy.html`;

  // Chemin dans le repo : à la racine pour Vercel
  const repoPath = `policies/${fileName}`;

  // Vérifier si le fichier existe déjà (pour récupérer son SHA — requis pour update)
  let sha;
  try {
    const checkRes = await fetch(
      `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`,
      { headers: ghHeaders() },
    );
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha;
    }
  } catch {
    // Fichier n'existe pas encore — c'est OK
  }

  // Créer ou mettre à jour le fichier
  const body = {
    message: sha
      ? `Update privacy policy for ${appName} (${packageId})`
      : `Add privacy policy for ${appName} (${packageId})`,
    content: Buffer.from(html, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`,
    { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) },
  );

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub file upload failed (${putRes.status}): ${errText}`);
  }

  // Construire l'URL Vercel publique
  if (!VERCEL_PROJECT_URL) {
    throw new Error(
      "Variable d'environnement VERCEL_PROJECT_URL manquante. " +
        "Ajoute dans Railway : VERCEL_PROJECT_URL=https://ton-projet.vercel.app",
    );
  }

  const publicUrl = `${VERCEL_PROJECT_URL}/${fileName}`;
  return publicUrl;
}

// ─── TRIGGER GITHUB ACTIONS BUILD ───────────────────────────────────────────
/**
 * Déclenche le workflow build.yml via workflow_dispatch.
 * @returns {object} — le run qui vient de démarrer
 */
async function triggerBuild({ appName, packageId, primaryColor }) {
  const body = {
    ref: "main",
    inputs: {
      app_name: appName,
      package_id: packageId,
      primary_color: (primaryColor || "7C3AED").replace("#", ""), // strip # par sécurité
    },
  };

  const res = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`,
    { method: "POST", headers: ghHeaders(), body: JSON.stringify(body) },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `GitHub Actions trigger failed (${res.status}): ${errText}`,
    );
  }

  // Attendre 4s que le run apparaisse dans l'API
  await new Promise((r) => setTimeout(r, 4000));

  const runsRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build.yml/runs?per_page=10`,
    { headers: ghHeaders() },
  );

  const runs = await runsRes.json();

  const run = runs.workflow_runs.find((r) => r.event === "workflow_dispatch");

  return run;

  // const runsRes = await fetch(
  //   `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=1&branch=main`,
  //   { headers: ghHeaders() },
  // );
  // const runs = await runsRes.json();
  // return runs.workflow_runs[0];

  console.log("Workflow run selected:", runs.workflow_runs[0].id);
  console.log("Run selected:", run.id);
}

// ─── GET WORKFLOW STATUS ─────────────────────────────────────────────────────
/**
 * @param {number|string} runId
 * @returns {"in_progress"|"completed"|"failure"}
 */
async function getWorkflowStatus(runId) {
  const res = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`,
    { headers: ghHeaders() },
  );
  const data = await res.json();
  console.log("jsonStringify : ", JSON.stringify(data, null, 2));
  console.log(
    "GitHub run:",
    runId,
    "status=",
    data.status,
    "conclusion=",
    data.conclusion,
  );

  if (data.status === "completed") {
    return data.conclusion === "success" ? "completed" : "failure";
  }
  return "in_progress";
}

// ─── DOWNLOAD ARTIFACT ───────────────────────────────────────────────────────
/**
 * Télécharge un artifact produit par GitHub Actions.
 * @param {number|string} runId
 * @param {string}        artifactName — ex: "app-release-aab"
 * @returns {Buffer}
 */
async function downloadArtifact(runId, artifactName) {
  const artRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`,
    { headers: ghHeaders() },
  );
  const artData = await artRes.json();
  const artifact = artData.artifacts?.find((a) => a.name === artifactName);

  if (!artifact) {
    throw new Error(
      `Artifact "${artifactName}" introuvable pour le run ${runId}. ` +
        `Artifacts disponibles : ${artData.artifacts?.map((a) => a.name).join(", ") || "aucun"}`,
    );
  }

  const dlRes = await fetch(artifact.archive_download_url, {
    headers: ghHeaders(),
    redirect: "follow",
  });
  const buffer = await dlRes.buffer();
  return buffer;
}

// ─── UPLOAD TO PLAY CONSOLE ──────────────────────────────────────────────────
/**
 * Upload AAB + listing complet sur Play Console en brouillon (track internal).
 * @returns {{ apkDownloadUrl: string|null }}
 */
async function uploadToPlayConsole({
  packageId,
  aabBuffer,
  listing,
  logoBase64,
  screenshots,
  policyUrl,
}) {
  const { google } = require("googleapis");

  const serviceAccount = JSON.parse(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT || "{}",
  );
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const publisher = google.androidpublisher({ version: "v3", auth });

  // 1. Créer un edit
  const editRes = await publisher.edits.insert({ packageName: packageId });
  const editId = editRes.data.id;

  // 2. Upload AAB
  const { Readable } = require("stream");
  const bundle = await publisher.edits.bundles.upload({
    packageName: packageId,
    editId,
    media: {
      mimeType: "application/octet-stream",
      body: Readable.from(aabBuffer),
    },
  });

  console.log("Bundle upload:", bundle.data);

  // 3. Listing français
  if (listing?.title) {
    await publisher.edits.listings.update({
      packageName: packageId,
      editId,
      language: "fr-FR",
      requestBody: {
        title: listing.title,
        shortDescription: listing.shortDescription || "",
        fullDescription: listing.description || "",
      },
    });
  }

  // 4. Listing anglais
  if (listing?.title) {
    await publisher.edits.listings.update({
      packageName: packageId,
      editId,
      language: "en-US",
      requestBody: {
        title: listing.title,
        shortDescription: listing.shortDescription || "",
        fullDescription: listing.description || "",
      },
    });
  }

  // 5. Track internal — DRAFT
  await publisher.edits.tracks.update({
    packageName: packageId,
    editId,
    track: "internal",
    requestBody: {
      releases: [
        { status: "draft", versionCodes: [String(bundle.data.versionCode)] },
      ],
    },
  });

  // 6. Commit
  await publisher.edits.commit({
    packageName: packageId,
    editId,
    changesNotSentForReview: false,
  });

  return { apkDownloadUrl: null };
}

module.exports = {
  publishPrivacyPolicy,
  triggerBuild,
  getWorkflowStatus,
  downloadArtifact,
  uploadToPlayConsole,
};
