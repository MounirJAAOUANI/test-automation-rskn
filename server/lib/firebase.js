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

/**
 * Configure Firebase Remote Config pour une app.
 *
 * @param {string} packageId — ex: com.appfactory.wealthflow
 * @param {object} params    — { key: value, ... }
 *
 * Exemple :
 *   setupRemoteConfig("com.appfactory.wealthflow", {
 *     ads_banner_id: "ca-app-pub-TEST/banner",
 *     premium_price_usd: "4.99",
 *   })
 */
async function setupRemoteConfig(packageId, params) {
  const admin = getAdmin();
  const rc = admin.remoteConfig();

  // Récupère le template existant (ou crée un nouveau)
  let template;
  try {
    template = await rc.getTemplate();
  } catch (err) {
    // Template n'existe pas encore — en créer un vide
    template = rc.createTemplateFromJSON(
      JSON.stringify({ parameters: {}, version: {} }),
    );
  }

  // Ajoute/met à jour chaque paramètre
  // Structure simplifiée : seulement defaultValue.value
  for (const [key, value] of Object.entries(params)) {
    template.parameters[key] = {
      defaultValue: {
        value: String(value),
      },
    };
  }

  // Publie les changements
  await rc.publishTemplate(template);

  return { success: true, parametersSet: Object.keys(params) };
}

module.exports = { setupRemoteConfig };
