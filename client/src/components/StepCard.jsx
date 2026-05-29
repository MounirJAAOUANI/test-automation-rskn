import { useState, useEffect } from "react";
import LogTerminal from "./LogTerminal.jsx";
import { SHOW_STEPS, DEBUG_MODE } from "../config.js";

const STATUS_CONFIG = {
  idle:    { border: "#1E1E2E", bg: "#0A0A12", label: "En attente",    icon: "ti-clock" },
  running: { border: "#F59E0B", bg: "#140F00", label: "En cours…",     icon: "ti-loader" },
  success: { border: "#065F46", bg: "#021F10", label: "Complété ✓",    icon: "ti-circle-check" },
  error:   { border: "#7F1D1D", bg: "#1A0404", label: "Échec ✗",       icon: "ti-circle-x" },
};

export default function StepCard({
  step,
  status      = "idle",
  logs        = [],
  output      = null,
  error       = null,
  elapsed     = 0,
  canExecute  = false,
  onExecute,
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[status];

  // Auto-expand quand en cours ou erreur
  useEffect(() => {
    if (status === "running" || status === "error") setExpanded(true);
  }, [status]);

  return (
    <div style={{
      background: cfg.bg,
      border:     `1px solid ${cfg.border}`,
      borderRadius: 12,
      overflow:   "hidden",
      transition: "border-color 0.3s, background 0.3s",
    }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Numéro + icône */}
        <div style={{
          width: 46, height: 46, borderRadius: 10, background: step.color, flexShrink: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 0,
        }}>
          <span style={{ fontSize: 18 }}>{step.emoji}</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>
            {step.num}
          </span>
        </div>

        {/* Infos */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 2 }}>
            {step.name}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 3 }}>{step.role}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "#334155" }}>⏱ {step.estTime}</span>
            <span style={{ fontSize: 10, color: "#334155" }}>💰 {step.costNote}</span>
            {status === "running" && (
              <span style={{ fontSize: 10, color: "#F59E0B" }}>⏳ {elapsed}s</span>
            )}
          </div>
        </div>

        {/* Actions + statut */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: cfg.border }}>{cfg.label}</span>

          {SHOW_STEPS && canExecute && status === "idle" && (
            <button
              onClick={(e) => { e.stopPropagation(); onExecute?.(); }}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: step.color, color: "#fff", border: "none", cursor: "pointer",
              }}
            >
              ▶ Exécuter
            </button>
          )}

          {status === "running" && (
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 16 }}>
              ⚙️
            </span>
          )}

          <i
            className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`}
            style={{ fontSize: 14, color: "#334155" }}
          />
        </div>
      </div>

      {/* Running progress bar */}
      {status === "running" && (
        <div style={{ height: 2, background: "#1A1A28", overflow: "hidden" }}>
          <div style={{
            height: "100%", background: step.color, width: "30%",
            animation: "slide 1.2s ease-in-out infinite",
          }} />
          <style>{`
            @keyframes slide {
              0%   { transform: translateX(-100%) scaleX(1); }
              50%  { transform: translateX(250%) scaleX(1.5); }
              100% { transform: translateX(600%) scaleX(1); }
            }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      {/* ── Expanded content ─────────────────────────────────────────── */}
      {expanded && (
        <div style={{ borderTop: "1px solid #1A1A28", padding: "12px 14px", background: "#06060E" }}>
          {/* Description */}
          <p style={{ fontSize: 11, color: "#64748B", lineHeight: 1.6, marginBottom: 10 }}>
            {step.description}
          </p>

          {/* Logs terminal */}
          {logs.length > 0 && <LogTerminal logs={logs} />}

          {/* Error display */}
          {status === "error" && error && (
            <div style={{
              marginTop: 10, padding: "10px 12px",
              background: "#1A0404", border: "1px solid #7F1D1D", borderRadius: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#F87171", marginBottom: 4 }}>
                ❌ Erreur — étape arrêtée
              </div>
              <div style={{ fontSize: 11, color: "#FCA5A5" }}>{error.msg}</div>
              {DEBUG_MODE && error.detail && (
                <pre style={{
                  marginTop: 8, fontSize: 10, color: "#F87171",
                  fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all",
                  maxHeight: 180, overflowY: "auto",
                }}>
                  {error.detail}
                </pre>
              )}
              {!DEBUG_MODE && (
                <div style={{ fontSize: 10, color: "#64748B", marginTop: 6 }}>
                  Active <code>VITE_MOT_DEBUG=true</code> dans Railway pour voir le détail.
                </div>
              )}
            </div>
          )}

          {/* Competitor table — step 01 */}
          {output?.topCompetitors && (
            <CompetitorTable competitors={output.topCompetitors} analysis={output.analysis} />
          )}

          {/* Architecture summary — step 02 */}
          {output?.appName && !output.topCompetitors && (
            <OutputGrid items={[
              { label: "Nom",       value: output.appName },
              { label: "Package",   value: output.packageId },
              { label: "Tagline",   value: output.tagline },
              { label: "Couleur",   value: output.theme?.primaryColor, color: output.theme?.primaryColor },
              { label: "Écrans",    value: output.screens?.join(", ") },
              { label: "Features",  value: output.features?.join(", ") },
            ]} />
          )}

          {/* Logo — step 03 */}
          {output?.logoUrl && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <img src={output.logoUrl} alt="Logo" style={{ width: 64, height: 64, borderRadius: 14, border: "1px solid #2D2D40" }} />
              <div style={{ fontSize: 11, color: "#64748B" }}>
                Formats générés : {Object.keys(output.formats || {}).join("px, ")}px
              </div>
            </div>
          )}

          {/* ASO listing — step 06 */}
          {output?.title && output?.keywords && (
            <div style={{ marginTop: 10 }}>
              <OutputGrid items={[
                { label: "Titre (30c)",    value: `"${output.title}"` },
                { label: "Desc. courte",   value: output.shortDescription },
                { label: "Keywords (13)",  value: output.keywords?.join(", ") },
              ]} />
            </div>
          )}

          {/* Compliance — step 07 */}
          {output?.policyUrl && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: "#0D0D1A", borderRadius: 8, fontSize: 11, color: "#94A3B8" }}>
              📄 Privacy Policy publiée :{" "}
              <a href={output.policyUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#38BDF8" }}>
                {output.policyUrl}
              </a>
            </div>
          )}

          {/* Build & Deploy APK download — step 08 */}
          {step.id === "build-deploy" && status === "success" && output?.apkName && (
            <APKDownloadBlock output={output} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CompetitorTable({ competitors, analysis }) {
  return (
    <div style={{ marginTop: 10 }}>
      {analysis && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 10 }}>
          {[
            ["Saturation", analysis.saturationLevel, analysis.saturationLevel === "LOW" ? "#34D399" : analysis.saturationLevel === "MEDIUM" ? "#FCD34D" : "#F87171"],
            ["Apps 1M+",   String(analysis.appsAbove1M), "#94A3B8"],
            ["Score moy.", `${analysis.avgScore}/5`, "#FCD34D"],
          ].map(([k, v, c]) => (
            <div key={k} style={{ background: "#0D0D17", borderRadius: 7, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#475569" }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {analysis?.recommendation && (
        <div style={{ fontSize: 11, color: "#A78BFA", padding: "7px 10px", background: "#0D0D1A", borderRadius: 7, marginBottom: 8 }}>
          💡 {analysis.recommendation}
        </div>
      )}
      <div style={{ fontSize: 10, color: "#334155", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Top Competitors ({competitors.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {competitors.map((c) => (
          <div key={c.rank} style={{
            display: "grid", gridTemplateColumns: "22px 1fr 80px 40px",
            gap: 8, alignItems: "center",
            padding: "6px 10px", background: "#0A0A14", borderRadius: 7, border: "1px solid #1A1A28",
          }}>
            <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", textAlign: "center" }}>
              #{c.rank}
            </span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#E2E8F0" }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "#475569" }}>{c.mainFeature || c.developer}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#FCD34D" }}>★ {c.score}</div>
              <div style={{ fontSize: 10, color: "#475569" }}>{c.installs}</div>
            </div>
            <div style={{
              fontSize: 9, padding: "2px 5px", borderRadius: 4, textAlign: "center",
              background: c.isFree ? "#064E3B" : "#1E1B4B",
              color: c.isFree ? "#34D399" : "#A78BFA",
            }}>
              {c.isFree ? "FREE" : "PAID"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutputGrid({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
      {items.filter((i) => i.value).map((item) => (
        <div key={item.label} style={{
          display: "grid", gridTemplateColumns: "90px 1fr",
          gap: 8, padding: "6px 10px", background: "#0A0A14", borderRadius: 7,
        }}>
          <span style={{ fontSize: 10, color: "#475569", fontWeight: 600 }}>{item.label}</span>
          <span style={{ fontSize: 11, color: item.color || "#E2E8F0", wordBreak: "break-word" }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function APKDownloadBlock({ output }) {
  return (
    <div style={{ marginTop: 14, padding: "14px", background: "#021F10", borderRadius: 10, border: "1px solid #065F46" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#34D399", marginBottom: 10 }}>
        📦 APK debug prêt — Téléchargement pour test Android
      </div>

      <div style={{ fontSize: 11, color: "#6EE7B7", lineHeight: 1.8, marginBottom: 12 }}>
        <strong style={{ color: "#fff" }}>Comment installer sur Android :</strong><br />
        1. Paramètres → Sécurité → <strong>"Sources inconnues"</strong> (ou "Installer des apps inconnues")<br />
        2. Télécharge l'APK ci-dessous<br />
        3. Ouvre le fichier .apk sur ton téléphone → Installer<br />
        4. Teste l'app — vérifie UI, pubs test AdMob, bouton Premium
      </div>

      {output.apkUrl && output.apkUrl !== "#" ? (
        <a
          href={output.apkUrl}
          download={output.apkName}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: "#065F46", color: "#34D399", textDecoration: "none",
            border: "1px solid #34D399",
          }}
        >
          ⬇️ Télécharger {output.apkName} ({output.apkSize})
        </a>
      ) : (
        <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>
          APK disponible dans les artifacts GitHub Actions (simulation — pas de vrai build)
        </div>
      )}

      <div style={{ marginTop: 14, padding: "10px 12px", background: "#065F46", borderRadius: 8, fontSize: 11, color: "#D1FAE5", lineHeight: 1.8 }}>
        <strong>App uploadée sur Play Console — Statut : BROUILLON</strong><br />
        Track : Internal Testing<br />
        <br />
        <strong>Pour publier :</strong><br />
        1. Ouvre{" "}
        <a href="https://play.google.com/console" target="_blank" rel="noopener noreferrer" style={{ color: "#34D399" }}>
          play.google.com/console
        </a><br />
        2. Ton app → Tableau de bord → Vérifier le brouillon<br />
        3. Screenshots ✓ | Icône ✓ | Description ✓ | Privacy Policy ✓<br />
        4. Clique <strong>"Soumettre pour review"</strong><br />
        5. Délai review Google : 2-7 jours → App live 🎉
      </div>
    </div>
  );
}
