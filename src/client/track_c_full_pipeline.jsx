import { useState, useRef, useEffect } from "react";

const AGENTS = [
  {
    id: "market-scout",
    name: "Market Scout",
    icon: "ti-search",
    role: "Analyse niche + concurrence",
    time: "2-3 min",
    description: "Scrape Play Store pour valider demande et saturation niche",
    color: "#7F77DD"
  },
  {
    id: "app-architect",
    name: "App Architect",
    icon: "ti-blueprint",
    role: "Design structure app",
    time: "1-2 min",
    description: "Conçoit les écrans, widgets, layout Flutter",
    color: "#1D9E75"
  },
  {
    id: "logo-gen",
    name: "Logo Generator",
    icon: "ti-photo",
    role: "Crée logo IA",
    time: "2-3 min",
    description: "Génère logo via GPT Image 2 + redimensionne formats",
    color: "#D85A30"
  },
  {
    id: "code-gen",
    name: "Code Generator",
    icon: "ti-code",
    role: "Génère code Flutter",
    time: "3-4 min",
    description: "Code source complet: UI, AdMob, IAP, Firebase Remote Config",
    color: "#378ADD"
  },
  {
    id: "screenshots",
    name: "Screenshots Creator",
    icon: "ti-device-mobile",
    role: "Capture écrans app",
    time: "2-3 min",
    description: "Puppet app web + device frames + overlays texte",
    color: "#BA7517"
  },
  {
    id: "aso",
    name: "ASO Optimizer",
    icon: "ti-sparkles",
    role: "Listing Play Store",
    time: "2 min",
    description: "Titre 30 chars, description 4000 chars, 13 keywords SEO",
    color: "#E24B4A"
  },
  {
    id: "compliance",
    name: "Compliance Builder",
    icon: "ti-shield-check",
    role: "Privacy + Data Safety",
    time: "1-2 min",
    description: "Privacy Policy générée + Data Safety declaration JSON",
    color: "#6C5CE7"
  },
  {
    id: "build-deploy",
    name: "Build & Deploy",
    icon: "ti-rocket",
    role: "Build AAB + upload",
    time: "3-4 min",
    description: "Compile Flutter, signe APK, upload Play Console brouillon",
    color: "#00B894"
  }
];

const EXECUTION_TIMES = {
  "market-scout": 180,
  "app-architect": 120,
  "logo-gen": 180,
  "code-gen": 240,
  "screenshots": 180,
  "aso": 120,
  "compliance": 90,
  "build-deploy": 240
};

const totalTime = Object.values(EXECUTION_TIMES).reduce((a, b) => a + b, 0);

async function executeAgent(agentId, previousOutput, appIdea) {
  // Simulation des appels API avec output réaliste
  const delay = EXECUTION_TIMES[agentId];

  switch (agentId) {
    case "market-scout":
      return {
        status: "success",
        data: {
          niche: appIdea,
          competitorsFound: 47,
          appsWith1M: 12,
          averageScore: 4.35,
          saturationLevel: "MEDIUM",
          topCompetitors: [
            { name: "Habitica", score: 4.7, installs: "5M+" },
            { name: "Productive", score: 4.6, installs: "1M+" },
            { name: "Done - Daily Habits", score: 4.8, installs: "500K+" }
          ],
          recommendation: "Niche viable — focus différenciation UI/UX minimaliste"
        }
      };

    case "app-architect":
      return {
        status: "success",
        data: {
          appName: "HabitFlow",
          packageId: "com.yourname.habitflow",
          screens: [
            "Home (avec streak counter, progress bar)",
            "Daily Check-in (simple one-tap interface)",
            "Stats (graphiques minimalistes)",
            "Settings (AdMob + Premium toggle)",
            "Onboarding (3 écrans)"
          ],
          theme: {
            primaryColor: "#6C63FF",
            secondaryColor: "#F8F4FF",
            backgroundColor: "#FFFFFF"
          },
          features: ["Streak tracker", "Daily notifications", "AdMob banner/interstitiel", "IAP premium", "Dark mode"]
        }
      };

    case "logo-gen":
      return {
        status: "success",
        data: {
          logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Crect fill='%236C63FF' width='1024' height='1024' rx='256'/%3E%3Ctext x='512' y='600' font-size='300' fill='white' text-anchor='middle' font-family='Arial, sans-serif' font-weight='bold'%3EHF%3C/text%3E%3C/svg%3E",
          formats: {
            "1024x1024": "✅ Icon Store",
            "512x512": "✅ Hi-Res",
            "192x192": "✅ Adaptive",
            "48x48": "✅ Notification"
          },
          generatedWith: "GPT Image 2 Medium ($0.042)"
        }
      };

    case "code-gen":
      return {
        status: "success",
        data: {
          codeGenerated: true,
          mainFiles: [
            "lib/main.dart (2.3 KB)",
            "lib/screens/home_screen.dart (4.1 KB)",
            "lib/services/admob_service.dart (3.2 KB)",
            "lib/services/firebase_service.dart (2.8 KB)",
            "pubspec.yaml (1.1 KB)"
          ],
          firebaseConfig: {
            projectId: "habitflow-prod",
            remoteConfig: {
              adsBannerId: "ca-app-pub-[TEST_ID]/banner",
              adsInterstitialId: "ca-app-pub-[TEST_ID]/interstitial",
              premiumPrice: "$4.99",
              adsEnabled: true
            }
          },
          dependencies: ["firebase_remote_config", "google_mobile_ads", "in_app_purchase"]
        }
      };

    case "screenshots":
      return {
        status: "success",
        data: {
          screenshotsGenerated: 5,
          screenshots: [
            "Screenshot 1: Home screen (1080x1920)",
            "Screenshot 2: Check-in flow (1080x1920)",
            "Screenshot 3: Stats view (1080x1920)",
            "Screenshot 4: Premium unlock (1080x1920)",
            "Screenshot 5: Dark mode (1080x1920)"
          ],
          deviceFrames: ["Pixel 9 Pro", "Samsung Galaxy S24"],
          screenshotWithDeviceFrame: "✅ Prêt Play Store (PNG 1440x3120)"
        }
      };

    case "aso":
      return {
        status: "success",
        data: {
          appTitle: "HabitFlow: Daily Habit Tracker",
          subtitle: "Build one habit, change your life",
          description: "HabitFlow est l'app minimaliste pour tracker une seule habitude chaque jour. Pas de distraction, pas de features inutiles — juste vous et votre habit. Streak counter, notifications quotidiennes, statistiques simples. Interface ultra-clean, design minimaliste. Gratuit avec option premium. [4000 chars optimisé SEO]",
          keywords: "habit tracker,daily routine,streak counter,habit builder,minimal tracker,habit app,productivity",
          whatsNew: "Version 1.0 Launch"
        }
      };

    case "compliance":
      return {
        status: "success",
        data: {
          privacyPolicy: {
            url: "https://yourname.github.io/habitflow-privacy",
            hosted: true,
            content: "Privacy Policy for HabitFlow...\n1. Data Collection: Only local storage, no server.\n2. AdMob: Google Ads SDK collects data via Remote Config.\n3. Firebase: Used for Remote Config only (IDs, prices, ads toggle).\n4. No personal data collection."
          },
          dataSafety: {
            dataTypes: ["App activity (AdMob impressions)", "Device info (for targeting)"],
            dataShared: ["Google Ads", "Firebase"],
            dataEncrypted: true,
            userControlled: true
          },
          consentMode: "Google User Messaging Platform (UMP) intégré"
        }
      };

    case "build-deploy":
      return {
        status: "success",
        data: {
          aabBuilt: true,
          aabSize: "45.2 MB",
          buildStatus: "✅ Build signé avec keystore",
          playConsoleStatus: "✅ Uploadé en brouillon (DRAFT)",
          appId: "com.yourname.habitflow",
          package: "habitflow.aab",
          nextStep: "Ouvrir Play Console → Vérifier listing → Publier",
          testingTrack: "internal",
          draftUrl: "https://play.google.com/console/u/0/developers/.../habitflow/draft"
        }
      };

    default:
      return { status: "error", data: { message: "Agent inconnu" } };
  }
}

function AgentCard({ agent, status, output, onExecute, isRunning, timeEstimate }) {
  const [expanded, setExpanded] = useState(false);
  const colors = {
    idle: "#E8E8F0",
    running: "#FFF9E6",
    success: "#E8F8F5",
    error: "#FDEEF0"
  };

  const statusColors = {
    idle: "#95A5A6",
    running: "#F39C12",
    success: "#27AE60",
    error: "#E74C3C"
  };

  const statusLabels = {
    idle: "En attente",
    running: "Exécution...",
    success: "Complété ✓",
    error: "Erreur ✗"
  };

  return (
    <div style={{
      background: colors[status],
      border: `2px solid ${statusColors[status]}`,
      borderRadius: 12,
      padding: "12px 14px",
      marginBottom: 8,
      cursor: "pointer",
      transition: "all 0.3s",
      opacity: status === "idle" && !onExecute ? 0.6 : 1
    }}
    onClick={() => setExpanded(!expanded)}
    onMouseEnter={e => e.currentTarget.style.transform = "translateX(4px)"}
    onMouseLeave={e => e.currentTarget.style.transform = "translateX(0)"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: agent.color, display: "flex",
            alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, flexShrink: 0
          }}>
            <i className={`ti ${agent.icon}`} aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>{agent.role}</div>
            <div style={{ fontSize: 10, color: statusColors[status], fontWeight: 500 }}>
              {statusLabels[status]} • {timeEstimate}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          {status === "idle" && onExecute && (
            <button
              onClick={(e) => { e.stopPropagation(); onExecute(); }}
              disabled={isRunning}
              style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                background: agent.color, color: "#fff", border: "none", cursor: "pointer",
                opacity: isRunning ? 0.6 : 1
              }}
            >
              {isRunning ? "Attend..." : "Exécuter"}
            </button>
          )}
          {status === "running" && (
            <div style={{ fontSize: 20 }}>⏳</div>
          )}
          {status === "success" && (
            <div style={{ fontSize: 20 }}>✅</div>
          )}
          <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 14, color: "#666" }} aria-hidden="true" />
        </div>
      </div>

      {expanded && output && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 10, color: "#999", marginBottom: 8, textTransform: "uppercase", fontWeight: 500 }}>Output ↓</div>
          <pre style={{
            fontSize: 10, fontFamily: "monospace", background: "rgba(0,0,0,0.05)", padding: "10px 12px",
            borderRadius: 6, maxHeight: 250, overflowY: "auto", color: "#333", lineHeight: 1.4,
            whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0
          }}>
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function TrackCPipelineSimulator() {
  const [appIdea, setAppIdea] = useState("Tracker habitudes minimaliste");
  const [mode, setMode] = useState("step"); // "step" ou "full"
  const [agentStates, setAgentStates] = useState({});
  const [agentOutputs, setAgentOutputs] = useState({});
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [totalTimeElapsed, setTotalTimeElapsed] = useState(0);

  // Initialiser les états
  useEffect(() => {
    const initialStates = {};
    AGENTS.forEach(a => {
      initialStates[a.id] = "idle";
    });
    setAgentStates(initialStates);
  }, []);

  const executeAgentSequence = async (agentId) => {
    setAgentStates(prev => ({ ...prev, [agentId]: "running" }));

    const delay = EXECUTION_TIMES[agentId];
    await new Promise(resolve => setTimeout(resolve, delay));

    const result = await executeAgent(agentId, agentOutputs[agentId], appIdea);
    setAgentOutputs(prev => ({ ...prev, [agentId]: result.data }));
    setAgentStates(prev => ({ ...prev, [agentId]: result.status }));
    setCurrentStep(prev => prev + 1);
  };

  const handleStepExecution = async (index) => {
    if (isRunning) return;
    setIsRunning(true);
    await executeAgentSequence(AGENTS[index].id);
    setIsRunning(false);
  };

  const handleFullPipelineExecution = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setCurrentStep(0);
    setAgentOutputs({});
    const initialStates = {};
    AGENTS.forEach(a => {
      initialStates[a.id] = "idle";
    });
    setAgentStates(initialStates);

    for (let i = 0; i < AGENTS.length; i++) {
      await executeAgentSequence(AGENTS[i].id);
    }

    setIsRunning(false);
  };

  const isFinalStepComplete = currentStep === AGENTS.length && !isRunning;

  return (
    <div style={{ padding: "0 0 2rem 0", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem", borderBottom: "2px solid #E0E0E0", paddingBottom: "1rem" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Track C — App Reskin Pipeline</div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Idée → App publiée Play Console (Brouillon) en {Math.floor(totalTime / 60)} min</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            value={appIdea}
            onChange={(e) => setAppIdea(e.target.value)}
            placeholder="Ex: tracker habitudes minimaliste"
            style={{
              flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8,
              border: "1px solid #DDD", fontSize: 13
            }}
          />
          <button
            onClick={() => { setMode(mode === "step" ? "full" : "step"); }}
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: mode === "full" ? "#1D9E75" : "#7F77DD", color: "#fff", border: "none", cursor: "pointer"
            }}
          >
            Mode: {mode === "step" ? "Step-by-Step" : "Full Pipeline"}
          </button>
        </div>
      </div>

      {/* Main Big Button */}
      {mode === "full" && (
        <div style={{ marginBottom: "2rem" }}>
          <button
            onClick={handleFullPipelineExecution}
            disabled={isRunning}
            style={{
              width: "100%", padding: "16px 20px", borderRadius: 12, fontSize: 16, fontWeight: 700,
              background: isRunning ? "#CCC" : isFinalStepComplete ? "#27AE60" : "#F39C12",
              color: "#fff", border: "none", cursor: isRunning ? "wait" : "pointer",
              transition: "all 0.3s",
              boxShadow: !isRunning && !isFinalStepComplete ? "0 4px 12px rgba(243, 156, 18, 0.3)" : "none"
            }}
          >
            {isRunning ? `⏳ Pipeline en cours... (${currentStep}/${AGENTS.length})` : isFinalStepComplete ? "✅ Pipeline Complété!" : "🚀 LANCER LA PIPELINE COMPLÈTE"}
          </button>
          <div style={{ fontSize: 12, color: "#666", marginTop: 8, textAlign: "center" }}>
            Durée totale estimée: {Math.floor(totalTime / 60)} min {totalTime % 60} sec
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginBottom: 6 }}>
          <span>Progression: {currentStep}/{AGENTS.length} agents</span>
          <span>{Math.round((currentStep / AGENTS.length) * 100)}%</span>
        </div>
        <div style={{ height: 6, background: "#E8E8E8", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${(currentStep / AGENTS.length) * 100}%`,
            height: "100%", background: "linear-gradient(90deg, #7F77DD, #1D9E75)", transition: "width 0.3s"
          }} />
        </div>
      </div>

      {/* Agents Pipeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {AGENTS.map((agent, index) => (
          <div key={agent.id}>
            <AgentCard
              agent={agent}
              status={agentStates[agent.id] || "idle"}
              output={agentOutputs[agent.id]}
              onExecute={mode === "step" && (index === 0 || agentStates[AGENTS[index - 1].id] === "success") ? () => handleStepExecution(index) : null}
              isRunning={isRunning && currentStep === index}
              timeEstimate={agent.time}
            />
            {index < AGENTS.length - 1 && (
              <div style={{
                padding: "8px 0", textAlign: "center", color: agentStates[agent.id] === "success" ? "#27AE60" : "#CCC",
                fontSize: 12, fontWeight: 500
              }}>
                ↓ {agentStates[agent.id] === "success" ? "✓" : ""}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Final Result */}
      {isFinalStepComplete && (
        <div style={{
          marginTop: "2rem", padding: "16px 14px", borderRadius: 12,
          background: "linear-gradient(135deg, #E8F8F5, #E8EDFE)", border: "2px solid #27AE60"
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#085041", marginBottom: 10 }}>
            ✅ App prête à être publiée sur Play Store!
          </div>
          <div style={{ fontSize: 12, color: "#333", lineHeight: 1.8 }}>
            <strong>Fichiers générés:</strong><br />
            📦 APK/AAB signé: habitflow.aab (45.2 MB)<br />
            🎨 Logo: 4 formats (1024×1024, 512×512, 192×192, 48×48)<br />
            📸 Screenshots: 5 images (1080×1920) avec device frame<br />
            📝 Privacy Policy: Hébergé GitHub Pages<br />
            📋 Data Safety: Déclaration JSON + UMP intégré<br />
            🎯 Listing: Titre, description SEO, 13 keywords<br />
            🔥 Firebase Remote Config: AdMob IDs configurables<br />
            <br />
            <strong>Prochaine étape:</strong><br />
            1. Ouvrir Play Console<br />
            2. Vérifier le brouillon (screenshots, textes, icon)<br />
            3. Cliquer "Publier" (review Google Play: 2-7 jours)<br />
            4. App en vivo sur Play Store!
          </div>
        </div>
      )}

      {/* Info Box */}
      <div style={{
        marginTop: "2rem", padding: "12px 14px", borderRadius: 10,
        background: "#FFF9E6", border: "1px solid #F39C12"
      }}>
        <div style={{ fontSize: 12, color: "#333", lineHeight: 1.6 }}>
          ⚠️ <strong>Coûts API utilisés (simulation):</strong> Claude Haiku ($0.052) + GPT Image 2 ($0.042) = <strong>$0.094/app</strong>
          <br />
          Après validation: Basculer SerpAPI Starter ($25/mois) pour market research automatisée.<br />
          Firebase Remote Config + AdMob: 100% gratuit jusqu'à quotas free tier.
        </div>
      </div>
    </div>
  );
}
