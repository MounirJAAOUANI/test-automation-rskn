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
 * @param {string} credentialsJson - JSON string de GOOGLE_PLAY_CREDENTIALS
 */
async function uploadAABToPlayConsole(packageId, aabBuffer, credentialsJson) {
  try {
    console.log(`[uploadAABToPlayConsole] Démarrage upload pour ${packageId}`);

    // ── 1. Parser les credentials ──
    let serviceAccount;
    
    if (typeof credentialsJson === "string") {
      try {
        serviceAccount = JSON.parse(credentialsJson);
      } catch (parseErr) {
        throw new Error(`GOOGLE_PLAY_CREDENTIALS invalid JSON: ${parseErr.message}`);
      }
    } else if (typeof credentialsJson === "object") {
      serviceAccount = credentialsJson;
    } else {
      throw new Error("GOOGLE_PLAY_CREDENTIALS not provided or invalid type");
    }

    if (!serviceAccount || !serviceAccount.client_email) {
      throw new Error("GOOGLE_PLAY_CREDENTIALS missing required fields (client_email)");
    }

    console.log(`[uploadAABToPlayConsole] Using service account: ${serviceAccount.client_email}`);

    // ── 2. Créer auth Google ──
    let google;
    try {
      google = require("googleapis");
    } catch (e) {
      throw new Error("googleapis package not installed. Run: npm install googleapis");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    const androidpublisher = google.androidpublisher({
      version: "v3",
      auth: auth,
    });

    // ── 3. Upload le AAB ──
    console.log(`[uploadAABToPlayConsole] Uploading ${(aabBuffer.length / 1024 / 1024).toFixed(1)} MB...`);

    const uploadResponse = await androidpublisher.edits.bundles.upload({
      packageName: packageId,
      media: {
        mimeType: "application/octet-stream",
        body: aabBuffer,
      },
    });

    const versionCode = uploadResponse.data.versionCode;
    console.log(`✅ AAB uploadé avec succès: versionCode ${versionCode}`);

    return {
      success: true,
      versionCode,
      size: aabBuffer.length,
      message: `AAB uploadé à Play Console (versionCode: ${versionCode})`,
      url: `https://play.google.com/console/u/0/developers/123456/app/${packageId}/tracks/production`,
    };

  } catch (err) {
    console.error(`❌ Play Console upload error: ${err.message}`);
    throw err;
  }
}

/**
 * Soumettre l'app pour review (future)
 */
async function submitAppForReview(packageId, credentialsJson, trackName = "internal") {
  try {
    console.log(`[submitAppForReview] Submission de ${packageId} à la track ${trackName}`);

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
    const editResponse = await androidpublisher.edits.create({
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
