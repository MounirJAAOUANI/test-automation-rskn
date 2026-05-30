"use strict";
/**
 * server/lib/github.js — VERSION CORRIGÉE
 *
 * Corrections :
 * 1. repoPath = policies/${fileName}  (fichier dans sous-dossier du repo)
 * 2. triggerBuild() : snapshot IDs avant dispatch → récupère le bon runId
 * 3. downloadArtifact() : retourne le ZIP brut (dézippage dans index.js avec adm-zip)
 * 4. uploadToPlayConsole() : versionCodes = [1] (entiers, pas strings)
 *
 * Variables d'env Railway requises :
 *   GITHUB_TOKEN         ghp_...
 *   GITHUB_OWNER         ex: MounirJAAOUANI
 *   GITHUB_REPO          ex: test-automation-rskn
 *   VERCEL_PROJECT_URL   ex: https://test-automation-rskn.vercel.app
 *   GOOGLE_PLAY_SERVICE_ACCOUNT  JSON minifié
 *   GOOGLE_PLAY_DEVELOPER_ID     ID numérique développeur
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

// ─── HEADERS ─────────────────────────────────────────────────────────────────
function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ─── TRIGGER BUILD — récupère le bon runId ───────────────────────────────────
/**
 * Stratégie fiable pour obtenir le runId du build qu'on vient de déclencher :
 *  1. Capture les runIds existants AVANT le dispatch
 *  2. Dispatche le workflow
 *  3. Poll toutes les 3s jusqu'à voir un runId NOUVEAU
 */
async function triggerBuild({ appName, packageId, primaryColor }) {
  // 1. Snapshot des runs existants
  const beforeRes = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=10&branch=main`,
    { headers: ghHeaders() },
  );
  const beforeData = await beforeRes.json();
  const existingIds = new Set(
    (beforeData.workflow_runs || []).map((r) => r.id),
  );

  // 2. Dispatch
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
        `Vérifiez que GITHUB_TOKEN a le scope "workflow" et que build.yml existe dans le repo.`,
    );
  }

  // 3. Polling — attendre qu'un runId nouveau apparaisse (max 36s)
  let newRun = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    const afterRes = await fetch(
      `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=10&branch=main`,
      { headers: ghHeaders() },
    );
    const afterData = await afterRes.json();
    const runs = afterData.workflow_runs || [];
    const fresh = runs.find(
      (r) => !existingIds.has(r.id) && r.path === ".github/workflows/build.yml",
    );

    if (fresh) {
      newRun = fresh;
      break;
    }
  }

  if (!newRun) {
    throw new Error(
      "Impossible de trouver le nouveau run GitHub Actions après déclenchement. " +
        "Vérifiez que GITHUB_TOKEN a le scope 'workflow' et que le fichier " +
        ".github/workflows/build.yml existe dans le repo.",
    );
  }

  return newRun;
}

// ─── GET WORKFLOW STATUS ──────────────────────────────────────────────────────
async function getWorkflowStatus(runId) {
  const res = await fetch(
    `${GH_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`,
    { headers: ghHeaders() },
  );

  if (!res.ok) {
    throw new Error(`GitHub status check failed (${res.status})`);
  }

  const data = await res.json();

  if (data.status === "completed") {
    return data.conclusion === "success" ? "completed" : "failure";
  }
  return data.status || "in_progress"; // "queued" ou "in_progress"
}

// ─── DOWNLOAD ARTIFACT — retourne le ZIP brut ────────────────────────────────
/**
 * Retourne le contenu binaire du ZIP de l'artifact.
 * L'extraction du .aab ou .apk est faite dans index.js avec adm-zip.
 *
 * Noms d'artifacts dans build.yml :
 *   "app-release-aab"  → ZIP contenant app-release.aab
 *   "app-debug-apk"    → ZIP contenant app-debug.apk
 */
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
      `Artifact "${artifactName}" introuvable pour le run ${runId}. ` +
        `Artifacts disponibles : ${available}`,
    );
  }

  const dlRes = await fetch(artifact.archive_download_url, {
    headers: ghHeaders(),
    redirect: "follow",
  });

  if (!dlRes.ok) {
    throw new Error(`Téléchargement artifact échoué (${dlRes.status})`);
  }

  return dlRes.buffer();
}

// ─── PUBLISH PRIVACY POLICY → GitHub (Vercel) ────────────────────────────────
/**
 * Écrit le HTML dans policies/<filename> dans le repo GitHub.
 * Vercel déploie automatiquement les nouveaux fichiers.
 * URL publique retournée : VERCEL_PROJECT_URL/<filename>
 *
 * Ex: policies/com-appfactory-wealthflow-privacy.html dans le repo
 * → https://test-automation-rskn.vercel.app/com-appfactory-wealthflow-privacy.html
 *
 * Note Vercel : si le fichier est dans /policies/ dans le repo, Vercel le sert à /policies/<file>
 * → adapter VERCEL_PROJECT_URL en conséquence, ou utiliser rewrites Vercel.
 * Par défaut ici on met le fichier à la RACINE du dossier policies/ du repo.
 */
async function publishPrivacyPolicy(appName, packageId, html) {
  const fileName = `${packageId.replace(/\./g, "-")}-privacy.html`;

  // CORRECTION : repoPath utilise le sous-dossier policies/
  const repoPath = `policies/${fileName}`;

  // SHA pour mise à jour éventuelle
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
    /* fichier inexistant = première création */
  }

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
    const errText = await putRes.text();
    throw new Error(`GitHub upload failed (${putRes.status}): ${errText}`);
  }

  if (!VERCEL_PROJECT_URL) {
    throw new Error(
      "Variable VERCEL_PROJECT_URL manquante dans Railway. " +
        "Ajoute : VERCEL_PROJECT_URL=https://ton-projet.vercel.app",
    );
  }

  // Vercel sert les fichiers du repo à leur chemin relatif
  // Si le fichier est dans policies/ dans le repo → URL = /policies/<filename>
  return `${VERCEL_PROJECT_URL}/${fileName}`;
}

// ─── UPLOAD TO PLAY CONSOLE ───────────────────────────────────────────────────
/**
 * Upload AAB (Buffer déjà extrait du ZIP) sur Play Console en brouillon.
 *
 * Correction critique : versionCodes doit être un tableau d'entiers [1]
 * et non de strings ["1"] — l'API Play rejette silencieusement les strings.
 */
async function uploadToPlayConsole({
  packageId,
  aabBuffer,
  listing,
  policyUrl,
}) {
  const { google } = require("googleapis");

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
  const uploadRes = await pub.edits.bundles.upload({
    packageName: packageId,
    editId,
    media: {
      mimeType: "application/octet-stream",
      body: Readable.from(aabBuffer),
    },
  });

  const versionCode = uploadRes.data.versionCode;

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
  // CORRECTION : versionCodes = [1] (entiers) pas ["1"] (strings)
  await pub.edits.tracks.update({
    packageName: packageId,
    editId,
    track: "internal",
    requestBody: {
      releases: [
        {
          status: "draft",
          versionCodes: [versionCode], // ← entier, pas string
        },
      ],
    },
  });

  // 6. Commit → rend le brouillon visible dans Play Console
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
