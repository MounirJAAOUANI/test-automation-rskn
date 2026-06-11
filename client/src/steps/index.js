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

export async function executeStep(stepId, onLog, outputs) {
  const payloadBuilders = {
    "market-scout": (outputs) => buildMarketScoutPayload(outputs.niche),
    "app-architect": (outputs) => buildAppArchitectPayload(outputs.niche, outputs["market-scout"]),
    "logo-gen": (outputs) => buildLogoGenPayload(outputs["app-architect"]),
    "code-gen": (outputs) => buildCodeGenPayload(outputs["app-architect"]),
    "screenshots": (outputs) => buildScreenshotsPayload(outputs["app-architect"], outputs["code-gen"]),
    "aso": (outputs) => buildASOPayload(outputs["app-architect"], outputs["market-scout"]),
    "compliance": (outputs) => buildCompliancePayload(outputs["app-architect"], outputs["code-gen"]),
    "build-deploy": (outputs) => buildBuildDeployPayload(
      outputs["app-architect"],
      outputs["code-gen"],
      outputs["aso"],
      outputs["compliance"],
      outputs["logo-gen"],
      outputs["screenshots"]
    ),
  };

  const endpoint = `/api/agents/${stepId}`;
  const payload = payloadBuilders[stepId]?.(outputs) || {};

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { success: false, error: { msg: `HTTP ${response.status}` } };
    }

    const data = await response.json();

    // Pour les steps avec polling (SSE): build-deploy
    if (stepId === "build-deploy") {
      if (!data.jobId) {
        return { success: false, error: { msg: "No jobId returned" } };
      }

      return new Promise((resolve) => {
        const pollJob = async () => {
          try {
            const jobRes = await fetch(`/api/jobs/${data.jobId}`);
            const jobData = await jobRes.json();

            if (jobData.newLogs && jobData.newLogs.length > 0) {
              jobData.newLogs.forEach((log) => onLog?.(log));
            }

            if (jobData.status === "done") {
              resolve({ success: true, data: { jobId: data.jobId, ...jobData.result } });
            } else if (jobData.status === "error") {
              resolve({ success: false, error: { msg: jobData.error || "Job failed" } });
            } else {
              setTimeout(pollJob, 500);
            }
          } catch (err) {
            resolve({ success: false, error: err });
          }
        };
        pollJob();
      });
    }

    // SSE pour autres steps: utiliser fetch avec streaming
    return new Promise(async (resolve) => {
      try {
        const sseResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const reader = sseResponse.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const msg = JSON.parse(line.slice(6));
                if (msg.event === "log") {
                  onLog?.(msg);
                } else if (msg.event === "done") {
                  resolve({ success: true, data: msg.data });
                  return;
                } else if (msg.event === "error") {
                  resolve({ success: false, error: msg });
                  return;
                }
              } catch (e) {
                // Ignorer les lignes mal formées
              }
            }
          }
        }
        resolve({ success: false, error: { msg: "Stream ended unexpectedly" } });
      } catch (err) {
        resolve({ success: false, error: err });
      }
    });
  } catch (err) {
    return { success: false, error: err };
  }
}
