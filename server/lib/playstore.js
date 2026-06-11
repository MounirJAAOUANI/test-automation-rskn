"use strict";
/**
 * server/lib/playstore.js
 *
 * Google Play Store integration
 */

const fs = require("fs");
const path = require("path");

/**
 * Recherche les apps sur Play Store (mock pour dev)
 */
async function search(niche, count = 50) {
  return Array(count)
    .fill(null)
    .map((_, i) => ({
      title: `App ${i + 1}`,
      developer: `Dev ${i}`,
      score: 4.0 + Math.random() * 0.5,
      installs: `${Math.floor(Math.random() * 100)}k`,
      ratings: Math.floor(Math.random() * 10000),
      free: true,
      summary: `App for ${niche}`,
    }));
}

/**
 * Analyse les apps
 */
function analyze(apps) {
  return {
    saturationLevel: "medium",
    avgScore: apps.reduce((a, b) => a + (b.score || 4), 0) / apps.length,
  };
}

/**
 * Mock data pour dev
 */
function mockData(niche) {
  return {
    niche,
    topCompetitors: [],
    analysis: { saturationLevel: "medium", avgScore: 4.2 },
  };
}

/**
 * NOUVELLE FONCTION: Upload AAB à Play Console
 *
 * @param {string} packageId - ex: com.appfactory.savingbattle
 * @param {Buffer} aabBuffer - AAB file content
 * @param {string|object} credentialsJson - JSON string or object from GOOGLE_PLAY_CREDENTIALS / GOOGLE_PLAY_SERVICE_ACCOUNT
 */
async function uploadAABToPlayConsole(
  packageId,
  aabBuffer,
  credentialsJson,
  options = {},
) {
  try {
    console.log(`[uploadAABToPlayConsole] Démarrage upload pour ${packageId}`);

    const rawCredentials =
      credentialsJson ||
      process.env.GOOGLE_PLAY_CREDENTIALS ||
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;

    if (!rawCredentials) {
      throw new Error(
        "GOOGLE_PLAY_CREDENTIALS or GOOGLE_PLAY_SERVICE_ACCOUNT must be provided",
      );
    }

    if (!aabBuffer || !Buffer.isBuffer(aabBuffer)) {
      throw new Error(
        "AAB buffer absent or invalid. Provide a valid Buffer containing the .aab file.",
      );
    }

    // ── 1. Parser les credentials ──
    let serviceAccount;

    if (typeof rawCredentials === "string") {
      try {
        serviceAccount = JSON.parse(rawCredentials);
      } catch (parseErr) {
        throw new Error(
          `Google Play service account JSON invalide: ${parseErr.message}`,
        );
      }
    } else if (typeof rawCredentials === "object") {
      serviceAccount = rawCredentials;
    } else {
      throw new Error("Google Play service account credentials invalid type");
    }

    if (!serviceAccount || !serviceAccount.client_email) {
      throw new Error(
        "GOOGLE_PLAY_CREDENTIALS missing required fields (client_email)",
      );
    }

    console.log(
      `[uploadAABToPlayConsole] Using service account: ${serviceAccount.client_email}`,
    );

    // ── 2. Créer auth Google ──
    let google;
    try {
      google = require("googleapis");
    } catch (e) {
      throw new Error(
        "googleapis package not installed. Run: npm install googleapis",
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    const androidpublisher = google.androidpublisher({
      version: "v3",
      auth: auth,
    });

    // ── 3. Créer un edit Play Console ──
    const editRes = await androidpublisher.edits.insert({
      packageName: packageId,
    });
    const editId = editRes.data.id;
    if (!editId) {
      throw new Error("Impossible de créer un edit Play Console");
    }
    console.log(`[uploadAABToPlayConsole] Created edit ${editId}`);

    // ── 4. Upload le AAB ──
    console.log(
      `[uploadAABToPlayConsole] Uploading ${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB...`,
    );

    const { Readable } = require("stream");
    const uploadResponse = await androidpublisher.edits.bundles.upload({
      packageName: packageId,
      editId,
      media: {
        mimeType: "application/octet-stream",
        body: Readable.from(aabBuffer),
      },
    });

    const versionCode = uploadResponse.data.versionCode;
    if (!versionCode) {
      throw new Error("Impossible de récupérer versionCode après upload AAB");
    }
    console.log(`✅ AAB uploadé avec succès: versionCode ${versionCode}`);

    const trackName = options.trackName || "internal";
    const trackStatus = options.trackStatus || "completed";

    // ── 5. Mettre la track interne en publication réelle ──
    await androidpublisher.edits.tracks.update({
      packageName: packageId,
      editId,
      track: trackName,
      requestBody: {
        releases: [
          {
            status: trackStatus,
            versionCodes: [versionCode],
          },
        ],
      },
    });

    // ── 6. Commit de l'edit ──
    const commitResponse = await androidpublisher.edits.commit({
      packageName: packageId,
      editId,
    });

    const releaseUrl = `https://play.google.com/console/apps/details?id=${packageId}`;

    return {
      success: true,
      versionCode,
      editId,
      size: aabBuffer.length,
      trackName,
      trackStatus,
      message: `AAB uploadé à Play Console (versionCode: ${versionCode}, track: ${trackName}, status: ${trackStatus})`,
      url: releaseUrl,
      releaseUrl,
    };
  } catch (err) {
    console.error(`❌ Play Console upload error: ${err.message}`);
    throw err;
  }
}

/**
 * Soumettre l'app pour review (future)
 */
async function submitAppForReview(
  packageId,
  credentialsJson,
  trackName = "internal",
) {
  try {
    console.log(
      `[submitAppForReview] Submission de ${packageId} à la track ${trackName}`,
    );

    let serviceAccount;
    if (typeof credentialsJson === "string") {
      serviceAccount = JSON.parse(credentialsJson);
    } else {
      serviceAccount = credentialsJson;
    }

    const google = require("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    const androidpublisher = google.androidpublisher({
      version: "v3",
      auth: auth,
    });

    // Créer un edit
    const editResponse = await androidpublisher.edits.insert({
      packageName: packageId,
    });

    const editId = editResponse.data.id;
    console.log(`[submitAppForReview] Created edit: ${editId}`);

    // Valider l'edit
    await androidpublisher.edits.validate({
      packageName: packageId,
      editId: editId,
    });

    console.log(`[submitAppForReview] Edit validated`);

    // Committer l'edit (publier)
    const commitResponse = await androidpublisher.edits.commit({
      packageName: packageId,
      editId: editId,
    });

    console.log(`✅ App soumise pour review: ${commitResponse.data.id}`);

    return {
      success: true,
      editId: commitResponse.data.id,
      message: `App soumise à ${trackName}`,
    };
  } catch (err) {
    console.error(`❌ App submission error: ${err.message}`);
    throw err;
  }
}

module.exports = {
  search,
  getAppDetails: search,
  analyze,
  mockData,
  uploadAABToPlayConsole,
  submitAppForReview,
};
