import React, { useState, useCallback } from "react";
import "./App.css";
import { executeStep } from "./steps";

export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [statuses, setStatuses] = useState({});
  const [outputs, setOutputs] = useState({});
  const [logs, setLogs] = useState({});
  const [errors, setErrors] = useState({});
  const [elapsed, setElapsed] = useState({});
  const [jobId, setJobId] = useState(null);

  const STEPS = [
    { id: "market-scout", title: "Market Scout", icon: "🔍" },
    { id: "app-architect", title: "App Architect", icon: "🏗️" },
    { id: "logo-gen", title: "Logo Gen", icon: "🎨" },
    { id: "code-gen", title: "Code Gen", icon: "💻" },
    { id: "screenshots", title: "Screenshots", icon: "📱" },
    { id: "aso", title: "ASO", icon: "📊" },
    { id: "compliance", title: "Compliance", icon: "⚖️" },
    { id: "build-deploy", title: "Build & Deploy", icon: "🚀" },
  ];

  const timers = {};

  const startTimer = (stepId) => {
    timers[stepId] = setInterval(() => {
      setElapsed((e) => ({ ...e, [stepId]: (e[stepId] || 0) + 1 }));
    }, 1000);
  };

  const stopTimer = (stepId) => {
    if (timers[stepId]) clearInterval(timers[stepId]);
  };

  const addLog = (stepId, log) => {
    setLogs((l) => ({
      ...l,
      [stepId]: [...(l[stepId] || []), log],
    }));
  };

  const runStep = useCallback(async (step) => {
    setStatuses((s) => ({ ...s, [step.id]: "running" }));
    setErrors((e) => ({ ...e, [step.id]: null }));
    setLogs((l) => ({ ...l, [step.id]: [] }));
    setElapsed((e) => ({ ...e, [step.id]: 0 }));

    startTimer(step.id);

    try {
      const result = await executeStep(
        step.id,
        (log) => addLog(step.id, log),
        outputs
      );

      stopTimer(step.id);

      if (result.success) {
        setStatuses((s) => ({ ...s, [step.id]: "success" }));
        setOutputs((o) => ({ ...o, [step.id]: result.data }));
        if (result.data?.jobId) {
          setJobId(result.data.jobId);
        }
        return true;
      } else {
        setStatuses((s) => ({ ...s, [step.id]: "error" }));
        setErrors((e) => ({ ...e, [step.id]: result.error }));
        return false;
      }
    } catch (err) {
      stopTimer(step.id);
      setStatuses((s) => ({ ...s, [step.id]: "error" }));
      setErrors((e) => ({ ...e, [step.id]: err }));
      return false;
    }
  }, [outputs]);

  const runAllSteps = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      const success = await runStep(STEPS[i]);
      if (!success) {
        setCurrentStep(i);
        return;
      }
      setCurrentStep(i + 1);
    }
    setCurrentStep(STEPS.length);
  };

  const goToStep = async (index) => {
    const success = await runStep(STEPS[index]);
    if (success) {
      setCurrentStep(index + 1);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🚀 App Factory</h1>
        <p>Create production-ready Flutter apps in minutes</p>
      </header>

      <main className="container">
        <div className="pipeline">
          {STEPS.map((step, index) => (
            <div key={step.id} className="step-container">
              <button
                className={`step-button ${statuses[step.id] || "idle"}`}
                onClick={() => goToStep(index)}
                disabled={index > currentStep}
              >
                <div className="step-icon">{step.icon}</div>
                <div className="step-title">{step.title}</div>
                {statuses[step.id] === "running" && (
                  <div className="step-timer">{elapsed[step.id]}s</div>
                )}
                {statuses[step.id] === "success" && <div className="step-check">✓</div>}
                {statuses[step.id] === "error" && <div className="step-error">✗</div>}
              </button>

              {logs[step.id] && logs[step.id].length > 0 && (
                <div className="step-logs">
                  {logs[step.id].map((log, i) => (
                    <div key={i} className={`log ${log.type || "info"}`}>
                      {log.msg}
                    </div>
                  ))}
                </div>
              )}

              {errors[step.id] && (
                <div className="step-error-box">
                  ❌ {errors[step.id].msg || String(errors[step.id])}
                </div>
              )}

              {/* ✅ PREVIEW BUTTON — Afficher quand le job est complété */}
              {step.id === "build-deploy" &&
                statuses[step.id] === "success" &&
                jobId && (
                  <div className="preview-container">
                    <a
                      href={`/api/preview/${jobId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="preview-button"
                    >
                      🎨 Voir l'aperçu (Logo & Screenshots)
                    </a>
                  </div>
                )}
            </div>
          ))}
        </div>

        <div className="controls">
          <button className="btn btn-primary" onClick={runAllSteps}>
            ▶ Lancer le pipeline
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setCurrentStep(0);
              setStatuses({});
              setOutputs({});
              setLogs({});
              setErrors({});
              setElapsed({});
              setJobId(null);
            }}
          >
            🔄 Réinitialiser
          </button>
        </div>

        {/* Debug: Afficher le jobId */}
        {jobId && (
          <div className="debug-info">
            <p>
              <strong>Job ID:</strong> <code>{jobId}</code>
            </p>
            <p>
              <strong>Preview URL:</strong>{" "}
              <code>/api/preview/{jobId}</code>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
