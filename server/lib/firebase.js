"use strict";
/**
 * server/lib/firebase.js
 *
 * FIX : Structure Firebase Remote Config API v12+
 *       - Retire `displayName`, `description`, `valueType`
 *       - Utilise seulement `defaultValue: { value: ... }`
 *
 * Référence : https://firebase.google.com/docs/remote-config/admin-rest-api
 */

let admin;

function getAdmin() {
  if (admin) return admin;

  admin = require("firebase-admin");

  if (!admin.apps.length) {
    const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawSA) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant");

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(rawSA);
    } catch (e) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT JSON invalide : ${e.message}`);
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  return admin;
}

function getDatabase() {
  const admin = getAdmin();
  return admin.database();
}

async function setupRemoteConfig(packageId, params) {
  const admin = getAdmin();
  const rc = admin.remoteConfig();

  let template;
  try {
    template = await rc.getTemplate();
  } catch (err) {
    template = rc.createTemplateFromJSON(
      JSON.stringify({ parameters: {}, version: {} }),
    );
  }

  for (const [key, value] of Object.entries(params)) {
    template.parameters[key] = {
      defaultValue: {
        value: String(value),
      },
    };
  }

  await rc.publishTemplate(template);

  return { success: true, parametersSet: Object.keys(params) };
}

module.exports = { getDatabase, setupRemoteConfig };
