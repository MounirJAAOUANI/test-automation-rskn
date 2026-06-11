// steps/index.js — Exporte les payloads de chaque étape
// Chaque step construit le payload à envoyer au serveur à partir du contexte courant.

/**
 * @param {string} niche — idée saisie par l'utilisateur
 */
export function buildMarketScoutPayload(niche) {
  return { niche };
}

/**
 * @param {string} niche
 * @param {object} marketData — output de market-scout
 */
export function buildAppArchitectPayload(niche, marketData) {
  return { niche, marketData };
}

/**
 * @param {object} architecture — output de app-architect
 */
export function buildLogoGenPayload(architecture) {
  return {
    appName:      architecture.appName,
    niche:        architecture.tagline,
    primaryColor: architecture.theme?.primaryColor || "#7C3AED",
  };
}

/**
 * @param {object} architecture
 */
export function buildCodeGenPayload(architecture) {
  return {
    appName:      architecture.appName,
    packageId:    architecture.packageId,
    architecture,
  };
}

/**
 * @param {object} architecture
 * @param {object} codeData — output de code-gen
 */
export function buildScreenshotsPayload(architecture, codeData) {
  return {
    appName:      architecture.appName,
    architecture,
    codeSnapshot: codeData?.files?.["lib/main.dart"]?.substring(0, 500) || "",
  };
}

/**
 * @param {object} architecture
 * @param {object} marketData
 */
export function buildASOPayload(architecture, marketData) {
  return {
    appName:    architecture.appName,
    niche:      architecture.tagline,
    marketData,
  };
}

/**
 * @param {object} architecture
 * @param {object} codeData
 */
export function buildCompliancePayload(architecture, codeData) {
  return {
    appName:   architecture.appName,
    packageId: architecture.packageId,
    features:  architecture.features || [],
  };
}

/**
 * @param {object} architecture
 * @param {object} codeData
 * @param {object} asoData
 * @param {object} complianceData
 * @param {object} logoData
 * @param {object} screenshotsData
 */
export function buildBuildDeployPayload(architecture, codeData, asoData, complianceData, logoData, screenshotsData) {
  return {
    appName:     architecture.appName,
    packageId:   architecture.packageId,
    code:        codeData,
    listing:     asoData,
    policyUrl:   complianceData?.policyUrl || "",
    logoBase64:  logoData?.formats?.["512"] || null,
    screenshots: screenshotsData?.screenshots || [],
  };
}
