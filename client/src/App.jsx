import { useState, useEffect, useCallback, useRef } from "react";
import { ENV, IS_PROD, SHOW_STEPS, STEPS, TOTAL_COST, TOTAL_TIME } from "./config.js";
import { runAgent, runBuildAgent, healthCheck } from "./api.js";
import PasswordModal from "./components/PasswordModal.jsx";
import PrereqPanel  from "./components/PrereqPanel.jsx";
import StepCard     from "./components/StepCard.jsx";
import {
  buildMarketScoutPayload,
  buildAppArchitectPayload,
  buildLogoGenPayload,
  buildCodeGenPayload,
  buildScreenshotsPayload,
  buildASOPayload,
  buildCompliancePayload,
  buildBuildDeployPayload,
} from "./steps/index.js";

const INITIAL_STATES = () =>
  Object.fromEntries(STEPS.map((s) => [s.id, "idle"]));

function buildPayload(stepId, niche, outputs) {
  const arch  = outputs["app-architect"];
  const mkt   = outputs["market-scout"];
  const code  = outputs["code-gen"];
  const aso   = outputs["aso"];
  const comp  = outputs["compliance"];
  const logo  = outputs["logo-gen"];
  const shots = outputs["screenshots"];

  switch (stepId) {
    case "market-scout":  return buildMarketScoutPayload(niche);
    case "app-architect": return buildAppArchitectPayload(niche, mkt);
    case "logo-gen":      return buildLogoGenPayload(arch || {});
    case "code-gen":      return buildCodeGenPayload(arch || {});
    case "screenshots":   return buildScreenshotsPayload(arch || {}, code);
    case "aso":           return buildASOPayload(arch || {}, mkt);
    case "compliance":    return buildCompliancePayload(arch || {}, code);
    case "build-deploy":  return buildBuildDeployPayload(arch || {}, code, aso, comp, logo, shots);
    default:              return {};
  }
}

export default function App() {
  const [niche,     setNiche]     = useState("tracker habitudes minimaliste");
  const [statuses,  setStatuses]  = useState(INITIAL_STATES);
  const [outputs,   setOutputs]   = useState({});
  const [logs,      setLogs]      = useState({});
  const [errors,    setErrors]    = useState({});
  const [elapsed,   setElapsed]   = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [showPwd,   setShowPwd]   = useState(false);
  const [pendingFn, setPendingFn] = useState(null);
  const [serverOk,  setServerOk]  = useState(null);

  const elapsedTimers = useRef({});

  useEffect(() => { healthCheck().then((r) => setServerOk(!!r)); }, []);

  const guard = useCallback((fn) => {
    if (!IS_PROD) { fn(); return; }
    const fp = ENV.FILLED_PASSWORD, tp = ENV.TRUE_PASSWORD;
    if (fp && fp === tp) { fn(); return; }
    setPendingFn(() => fn);
    setShowPwd(true);
  }, []);

  const startTimer = (id) => {
    elapsedTimers.current[id] = setInterval(() => {
      setElapsed((p) => ({ ...p, [id]: (p[id] || 0) + 1 }));
    }, 1000);
  };
  const stopTimer = (id) => clearInterval(elapsedTimers.current[id]);

  const addLog = (stepId, entry) =>
    setLogs((p) => ({ ...p, [stepId]: [...(p[stepId] || []), entry] }));

  // ── Exécuter une étape ─────────────────────────────────────────────────────
  const executeStep = useCallback(async (stepId, niched, currentOutputs) => {
    setStatuses((s) => ({ ...s, [stepId]: "running" }));
    setErrors((e)   => ({ ...e, [stepId]: null }));
    setLogs((l)     => ({ ...l, [stepId]: [] }));
    setElapsed((e)  => ({ ...e, [stepId]: 0 }));
    startTimer(stepId);

    const payload = buildPayload(stepId, niched, currentOutputs);

    return new Promise((resolve) => {
      const onLog = (log) => addLog(stepId, log);

      const onDone = (data) => {
        stopTimer(stepId);
        setStatuses((s) => ({ ...s, [stepId]: "success" }));
        setOutputs((o)  => ({ ...o, [stepId]: data }));
        resolve({ success: true, data });
      };

      const onError = (err) => {
        stopTimer(stepId);
        setStatuses((s) => ({ ...s, [stepId]: "error" }));
        setErrors((e)   => ({ ...e, [stepId]: err }));
        addLog(stepId, {
          ts: new Date().toLocaleTimeString("fr-FR"),
          msg: `❌ ${err.msg}`, type: "error",
        });
        resolve({ success: false, error: err });
      };

      // build-deploy utilise le polling — tous les autres utilisent SSE
      if (stepId === "build-deploy") {
        runBuildAgent(payload, onLog, onDone, onError);
      } else {
        runAgent(stepId, payload, onLog, onDone, onError);
      }
    });
  }, []);

  // ── Pipeline complète ──────────────────────────────────────────────────────
  const runFullPipeline = useCallback(async () => {
    setIsRunning(true);
    setStatuses(INITIAL_STATES());
    setOutputs({});
    setLogs({});
    setErrors({});
    setElapsed({});

    let currentOutputs = {};
    for (const step of STEPS) {
      const result = await executeStep(step.id, niche, currentOutputs);
      if (!result.success) { setIsRunning(false); return; }
      currentOutputs = { ...currentOutputs, [step.id]: result.data };
    }
    setIsRunning(false);
  }, [niche, executeStep]);

  // ── Étape individuelle ─────────────────────────────────────────────────────
  const runSingleStep = useCallback(async (stepId) => {
    if (isRunning) return;
    setIsRunning(true);
    await executeStep(stepId, niche, outputs);
    setIsRunning(false);
  }, [isRunning, niche, outputs, executeStep]);

  const reset = () => {
    setStatuses(INITIAL_STATES());
    setOutputs({}); setLogs({}); setErrors({}); setElapsed({});
    setIsRunning(false);
  };

  const completed = Object.values(statuses).filter((s) => s === "success").length;
  const hasError  = Object.values(statuses).some((s) => s === "error");
  const allDone   = completed === STEPS.length;

  return (
    <>
      {showPwd && (
        <PasswordModal
          onSuccess={() => { setShowPwd(false); pendingFn?.(); setPendingFn(null); }}
          onCancel={() => { setShowPwd(false); setPendingFn(null); }}
        />
      )}

      <div>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#334155", marginBottom: 8, textTransform: "uppercase" }}>
            App Factory • Autopilot Pipeline
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: "#fff", letterSpacing: "-0.02em" }}>
            📱 Reskin Engine
          </h1>
          <p style={{ fontSize: 12, color: "#475569", margin: "8px 0 0" }}>
            Idée → App brouillon Play Store — {TOTAL_TIME} — {TOTAL_COST}/app
          </p>
          <div style={{ marginTop: 10 }}>
            {serverOk === null && <span style={{ fontSize: 11, color: "#475569" }}>⏳ Vérification serveur…</span>}
            {serverOk === false && (
              <span style={{ fontSize: 11, color: "#F87171" }}>
                ❌ Serveur inaccessible — lance <code>npm start</code> dans <code>server/</code>
              </span>
            )}
            {serverOk === true && (
              <span style={{ fontSize: 11, color: "#34D399" }}>
                ✅ Serveur connecté — mode: {IS_PROD ? "production" : "développement"}
              </span>
            )}
          </div>
        </div>

        <PrereqPanel />

        {/* Input niche */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Ton idée / niche
          </div>
          <input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            disabled={isRunning}
            placeholder="Ex: tracker habitudes minimaliste"
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: "#0D0D17", border: "1px solid #2D2D40", color: "#fff", outline: "none",
              opacity: isRunning ? 0.6 : 1,
            }}
          />
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155", marginBottom: 5 }}>
            <span>PROGRESSION</span>
            <span>{hasError ? "⛔ Arrêtée — étape échouée" : `${completed}/${STEPS.length} — ${Math.round((completed / STEPS.length) * 100)}%`}</span>
          </div>
          <div style={{ height: 4, background: "#1A1A28", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2, transition: "width 0.5s",
              background: hasError
                ? "linear-gradient(90deg, #7C3AED, #EF4444)"
                : "linear-gradient(90deg, #7C3AED, #059669)",
              width: `${(completed / STEPS.length) * 100}%`,
            }} />
          </div>
        </div>

        {/* Bouton principal */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => guard(runFullPipeline)}
            disabled={isRunning || !niche.trim()}
            style={{
              flex: 1, padding: "15px 20px", borderRadius: 12, fontSize: 14, fontWeight: 800,
              border: "none", cursor: isRunning ? "wait" : "pointer",
              background: allDone ? "#065F46" : hasError
                ? "linear-gradient(135deg, #7C3AED, #DC2626)"
                : isRunning ? "#1A1A28"
                : "linear-gradient(135deg, #7C3AED, #4F46E5)",
              color: allDone ? "#34D399" : isRunning ? "#475569" : "#fff",
              letterSpacing: "0.04em", textTransform: "uppercase",
              boxShadow: !isRunning && !allDone ? "0 0 28px rgba(124,58,237,0.25)" : "none",
              transition: "all 0.3s",
            }}
          >
            {isRunning
              ? `⚙️  Pipeline en cours… (${completed}/${STEPS.length}) — ${TOTAL_TIME}`
              : allDone ? "✅ Terminée — Relancer ?"
              : hasError ? "🔁 Relancer depuis le début"
              : `🚀 Lancer la pipeline complète — ${TOTAL_TIME}`}
          </button>
          {(allDone || hasError) && (
            <button onClick={reset} style={{
              padding: "15px 16px", borderRadius: 12, fontSize: 13,
              border: "1px solid #2D2D40", background: "transparent", color: "#64748B", cursor: "pointer",
            }}>↺</button>
          )}
        </div>

        {/* Mode dev notice */}
        {!IS_PROD && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 8,
            background: "#1A1A00", border: "1px solid #4B4500", fontSize: 11, color: "#FCD34D",
          }}>
            🟡 Mode <strong>développement</strong> — données simulées.
            Passe <code>VITE_MODE_ENV=production</code> pour les vrais appels API.
          </div>
        )}

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STEPS.map((step, idx) => {
            const prevOk     = idx === 0 || statuses[STEPS[idx - 1].id] === "success";
            const canExecute = prevOk && statuses[step.id] === "idle" && !isRunning;
            return (
              <StepCard
                key={step.id}
                step={step}
                status={statuses[step.id]}
                logs={logs[step.id] || []}
                output={outputs[step.id] || null}
                error={errors[step.id] || null}
                elapsed={elapsed[step.id] || 0}
                canExecute={canExecute}
                onExecute={() => guard(() => runSingleStep(step.id))}
              />
            );
          })}
        </div>

        {/* Résultat final */}
        {allDone && (
          <div style={{
            marginTop: 24, padding: "20px", borderRadius: 14,
            background: "#021F10", border: "1px solid #065F46",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#34D399", marginBottom: 14 }}>
              🎉 App "{outputs["app-architect"]?.appName || niche}" prête à publier !
            </div>
            <div style={{ fontSize: 11, color: "#6EE7B7", lineHeight: 2 }}>
              ✅ Market research<br />
              ✅ Architecture Flutter — {outputs["app-architect"]?.appName} / {outputs["app-architect"]?.packageId}<br />
              ✅ Logo IA — 4 formats PNG<br />
              ✅ Code Flutter + Firebase Remote Config<br />
              ✅ 5 screenshots Play Store<br />
              ✅ ASO — titre / description SEO / keywords<br />
              ✅ Privacy Policy + Data Safety<br />
              ✅ AAB signé — <strong style={{ color: "#fff" }}>BROUILLON Play Console</strong>
            </div>
            <div style={{
              marginTop: 14, padding: "12px 14px", background: "#065F46", borderRadius: 10,
              fontSize: 11, color: "#D1FAE5", lineHeight: 1.9,
            }}>
              <strong>Pour publier :</strong><br />
              1. Ouvre{" "}
              <a href={outputs["build-deploy"]?.draftUrl || "https://play.google.com/console"}
                target="_blank" rel="noopener noreferrer" style={{ color: "#34D399" }}>
                play.google.com/console
              </a>{" → "}Ton app → Tableau de bord<br />
              2. Vérifie screenshots ✓ | Icône ✓ | Description ✓ | Privacy Policy ✓<br />
              3. Clique <strong>"Soumettre pour review"</strong><br />
              4. Google review : 2-7 jours → App live 🚀
            </div>
          </div>
        )}
      </div>
    </>
  );
}
