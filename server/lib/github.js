"use strict";
/**
 * server/lib/github.js — VERSION CORRIGÉE
 *
 * Corrections :
 * 1. triggerBuild() : récupère les IDs existants AVANT de déclencher,
 *    puis attend que le NOUVEAU run apparaisse → ID garanti correct
 * 2. downloadArtifact() : utilise le bon nom "app-release-aab"
 * 3. Gestion d'erreur explicite à chaque étape
 *
 * Variables d'env requises :
 *   GITHUB_TOKEN         → ghp_...
 *   GITHUB_OWNER         → ex: MounirJAAOUANI
 *   GITHUB_REPO          → ex: test-automation-rskn
 *   VERCEL_PROJECT_URL   → ex: https://test-automation-rskn.vercel.app
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

// ─── HELPER — fetch avec log d'erreur précis ─────────────────────────────────
async function ghFetch(url, options = {}) {
  const res = await fetch(url, { ...options, headers: ghHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub API ${options.method || "GET"} ${url} → ${res.status}: ${body}`,
    );
  }
  return res;
}

// ─── TRIGGER BUILD + RÉCUPÉRER LE BON RUN ID ─────────────────────────────────
/**
 * Déclenche le workflow et retourne UNIQUEMENT le run qui vient d'être créé.
 *
 * Stratégie fiable :
 * 1. Capture les IDs des runs existants AVANT déclenchement
 * 2. Déclenche le workflow
 * 3. Polling jusqu'à ce qu'un run avec un ID NOUVEAU apparaisse
 * 4. Retourne ce run → ID garanti correct
 *
 * @param {{ appName, packageId, primaryColor }} params
 * @returns {object} — le workflow run (avec .id correct)
 */
async function triggerBuild({ appName, packageId, primaryColor }) {
  // 1. Snapshot des runs EXISTANTS avant déclenchement
  const existingRes = await ghFetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=10&branch=main`,
  );
  const existingData = await existingRes.json();
  const existingIds = new Set(
    (existingData.workflow_runs || []).map((r) => r.id),
  );

  // 2. Déclencher le workflow
  const cleanColor = (primaryColor || "7C3AED").replace("#", "");
  const triggerRes = await fetch(
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

  if (!triggerRes.ok) {
    const errText = await triggerRes.text();
    throw new Error(
      `GitHub Actions trigger failed (${triggerRes.status}): ${errText}`,
    );
  }

  // 3. Polling — attendre qu'un run NOUVEAU apparaisse (max 30s)
  //    GitHub peut prendre 2-8s pour enregistrer le run après dispatch
  let newRun = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 3000)); // attendre 3s entre chaque check

    const runsRes = await ghFetch(
      `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=10&branch=main`,
    );
    const runsData = await runsRes.json();
    const runs = runsData.workflow_runs || [];

    // Chercher un run dont l'ID n'était pas dans la liste initiale
    const fresh = runs.find((r) => !existingIds.has(r.id));
    if (fresh) {
      newRun = fresh;
      break;
    }
  }

  if (!newRun) {
    throw new Error(
      "Impossible de trouver le run GitHub Actions après déclenchement. " +
        "Vérifiez que le workflow build.yml existe et que GITHUB_TOKEN a les permissions 'workflow'.",
    );
  }

  return newRun;
}

// ─── GET WORKFLOW STATUS ─────────────────────────────────────────────────────
/**
 * @param {number|string} runId
 * @returns {"queued"|"in_progress"|"completed"|"failure"}
 */
async function getWorkflowStatus(runId) {
  const res = await ghFetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`,
  );
  const data = await res.json();

  if (data.status === "completed") {
    return data.conclusion === "success" ? "completed" : "failure";
  }
  return data.status || "in_progress"; // "queued" ou "in_progress"
}

// ─── DOWNLOAD ARTIFACT ───────────────────────────────────────────────────────
/**
 * Télécharge l'AAB depuis les artifacts GitHub Actions.
 *
 * Noms d'artifacts produits par build.yml :
 *   "app-release-aab"  → le fichier .aab (release)
 *   "app-debug-apk"    → le fichier .apk (debug)
 *
 * @param {number|string} runId
 * @param {"app-release-aab"|"app-debug-apk"} artifactName
 * @returns {Buffer}
 */
async function downloadArtifact(runId, artifactName) {
  const artRes = await ghFetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`,
  );
  const artData = await artRes.json();
  const artifacts = artData.artifacts || [];

  const artifact = artifacts.find((a) => a.name === artifactName);

  if (!artifact) {
    const available = artifacts.map((a) => `"${a.name}"`).join(", ") || "aucun";
    throw new Error(
      `Artifact "${artifactName}" introuvable pour le run ${runId}. ` +
        `Artifacts disponibles : ${available}`,
    );
  }

  // L'URL de téléchargement redirige — on suit les redirections
  const dlRes = await fetch(artifact.archive_download_url, {
    headers: ghHeaders(),
    redirect: "follow",
  });

  if (!dlRes.ok) {
    throw new Error(`Téléchargement artifact échoué (${dlRes.status})`);
  }

  const buffer = await dlRes.buffer();
  return buffer;
}

// ─── PUBLISH PRIVACY POLICY → VERCEL ────────────────────────────────────────
/**
 * Écrit le HTML à la racine du repo GitHub.
 * Vercel (connecté au repo) le déploie automatiquement.
 * Retourne l'URL Vercel publique.
 */
async function publishPrivacyPolicy(appName, packageId, html) {
  const fileName = `${packageId.replace(/\./g, "-")}-privacy.html`;
  const repoPath = fileName; // racine du repo = accessible via Vercel à /<filename>

  // Vérifier si le fichier existe déjà (pour le SHA)
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
    /* fichier inexistant = OK */
  }

  const body = {
    message: sha
      ? `Update privacy policy — ${appName} (${packageId})`
      : `Add privacy policy — ${appName} (${packageId})`,
    content: Buffer.from(html, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`,
    { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) },
  );

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub upload failed (${putRes.status}): ${errText}`);
  }

  if (!VERCEL_PROJECT_URL) {
    throw new Error(
      "Variable VERCEL_PROJECT_URL manquante dans Railway. " +
        "Ajoute : VERCEL_PROJECT_URL=https://ton-projet.vercel.app",
    );
  }

  return `${VERCEL_PROJECT_URL}/${fileName}`;
}

// ─── UPLOAD TO PLAY CONSOLE ──────────────────────────────────────────────────
/**
 * Upload AAB + listing sur Play Console en brouillon (track internal, status draft).
 */
async function uploadToPlayConsole({
  packageId,
  aabBuffer,
  listing,
  policyUrl,
}) {
  const { google } = require("googleapis");

  const rawServiceAccount = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  if (!rawServiceAccount) {
    throw new Error(
      "Variable GOOGLE_PLAY_SERVICE_ACCOUNT manquante dans Railway.",
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch (e) {
    throw new Error(`GOOGLE_PLAY_SERVICE_ACCOUNT JSON invalide : ${e.message}`);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const publisher = google.androidpublisher({ version: "v3", auth });

  // 1. Créer un edit
  const editRes = await publisher.edits.insert({ packageName: packageId });
  const editId = editRes.data.id;
  if (!editId) throw new Error("Play Console : impossible de créer un edit.");

  // 2. Upload AAB
  const { Readable } = require("stream");
  await publisher.edits.bundles.upload({
    packageName: packageId,
    editId,
    media: {
      mimeType: "application/octet-stream",
      body: Readable.from(aabBuffer),
    },
  });

  // 3. Listing fr-FR
  if (listing?.title) {
    await publisher.edits.listings.update({
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
    await publisher.edits.listings.update({
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

  // 5. Track internal — draft
  await publisher.edits.tracks.update({
    packageName: packageId,
    editId,
    track: "internal",
    requestBody: {
      releases: [
        {
          status: "draft",
          versionCodes: ["1"],
        },
      ],
    },
  });

  // 6. Commit l'edit → rend le brouillon visible dans Play Console
  const commitRes = await publisher.edits.commit({
    packageName: packageId,
    editId,
    changesNotSentForReview: false,
  });

  const appId = commitRes.data.id || packageId;
  return { appId, apkDownloadUrl: null };
}

module.exports = {
  triggerBuild,
  getWorkflowStatus,
  downloadArtifact,
  publishPrivacyPolicy,
  uploadToPlayConsole,
};
