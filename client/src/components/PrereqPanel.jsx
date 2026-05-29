import { useState } from "react";

const PREREQS = [
  {
    id: "railway-vars",
    name: "Variables Railway (côté client — préfixe VITE_)",
    group: "Infrastructure",
    cost: "Gratuit",
    status: "required",
    howTo: [
      "Va sur railway.app → ton projet → Variables",
      "Ajoute exactement ces variables (préfixe VITE_ obligatoire pour Vite) :",
      "VITE_TRUE_PASSWORD=tonmotdepasse (ex: launch2026)",
      "VITE_FILLED_PASSWORD=tonmotdepasse (facultatif — bypass popup si = TRUE_PASSWORD)",
      "VITE_SHOW_STEPS=true (afficher boutons par étape) ou false (pipeline seulement)",
      "VITE_MODE_ENV=production (vrais appels API) ou development (données factices)",
      "VITE_MOT_DEBUG=true (afficher erreurs détaillées) ou false",
    ],
    envExample: "VITE_TRUE_PASSWORD=launch2026\nVITE_FILLED_PASSWORD=launch2026\nVITE_SHOW_STEPS=true\nVITE_MODE_ENV=production\nVITE_MOT_DEBUG=false",
    link: "https://railway.app",
  },
  {
    id: "railway-server-vars",
    name: "Variables Railway (côté serveur — sans préfixe VITE_)",
    group: "Infrastructure",
    cost: "Gratuit",
    status: "required",
    howTo: [
      "Mêmes variables Railway → ajoute aussi :",
      "ANTHROPIC_API_KEY=sk-ant-api03-XXXX (depuis console.anthropic.com)",
      "OPENAI_API_KEY=sk-proj-XXXX (depuis platform.openai.com/api-keys)",
      "FIREBASE_SERVICE_ACCOUNT={...json...} (JSON minifié sur 1 ligne — voir ci-dessous)",
      "GOOGLE_PLAY_SERVICE_ACCOUNT={...json...} (JSON minifié — voir ci-dessous)",
      "GITHUB_TOKEN=ghp_XXXX (depuis github.com → Settings → Developer settings → PAT)",
      "GITHUB_OWNER=tonusername (ton username GitHub)",
      "GITHUB_REPO=app-factory-flutter (nom du repo du moteur Flutter)",
      "FRONTEND_URL=https://ton-app.up.railway.app (URL du frontend déployé)",
      "PORT=4000",
      "MODE_ENV=production",
      "MOT_DEBUG=false",
    ],
    envExample: "ANTHROPIC_API_KEY=sk-ant-api03-XXXX\nOPENAI_API_KEY=sk-proj-XXXX\nGITHUB_TOKEN=ghp_XXXX\nGITHUB_OWNER=tonusername\nGITHUB_REPO=app-factory-flutter\nFRONTEND_URL=https://ton-app.up.railway.app\nPORT=4000\nMODE_ENV=production\nMOT_DEBUG=false",
    link: "https://railway.app",
  },
  {
    id: "anthropic",
    name: "Claude API — Anthropic",
    group: "IA — Agents de génération",
    cost: "$5 de crédits minimum",
    status: "required",
    howTo: [
      "Va sur console.anthropic.com",
      "Crée un compte ou connecte-toi",
      "Clique sur 'API Keys' dans le menu gauche",
      "Clique '+ Create Key' → donne un nom (ex: app-factory)",
      "Copie la clé : elle commence par sk-ant-api03-...",
      "Va dans 'Billing' → ajoute $5 minimum de crédits",
      "Ajoute dans Railway: ANTHROPIC_API_KEY=sk-ant-api03-XXXX",
    ],
    envExample: "ANTHROPIC_API_KEY=sk-ant-api03-ABCdefGHIjklMNOpqrSTUvwxYZ123456789",
    link: "https://console.anthropic.com/account/keys",
  },
  {
    id: "openai",
    name: "OpenAI API — Logo GPT Image",
    group: "IA — Génération logo",
    cost: "$5 de crédits minimum ($0.011/logo)",
    status: "required",
    howTo: [
      "Va sur platform.openai.com",
      "Crée un compte ou connecte-toi",
      "Clique sur 'API keys' dans le menu gauche",
      "Clique '+ Create new secret key' → donne un nom",
      "Copie la clé : elle commence par sk-proj-...",
      "Va dans 'Billing' → 'Add payment method' → ajoute une carte",
      "Va dans 'Billing' → 'Add to credit balance' → ajoute $5",
      "Ajoute dans Railway: OPENAI_API_KEY=sk-proj-XXXX",
    ],
    envExample: "OPENAI_API_KEY=sk-proj-ABCdefGHIjklMNOpqrSTUvwxYZ123456789",
    link: "https://platform.openai.com/api-keys",
  },
  {
    id: "firebase",
    name: "Firebase Admin SDK — Remote Config AdMob",
    group: "Configuration AdMob",
    cost: "GRATUIT (Spark plan)",
    status: "required",
    howTo: [
      "Va sur console.firebase.google.com",
      "Clique 'Créer un projet' → donne un nom (ex: app-factory-prod)",
      "Désactive Google Analytics si tu veux → Créer",
      "Une fois le projet créé : clique sur l'engrenage ⚙️ → 'Paramètres du projet'",
      "Clique sur l'onglet 'Comptes de service'",
      "Clique 'Générer une nouvelle clé privée' → Confirmer → fichier JSON téléchargé",
      "Ouvre le fichier JSON dans un éditeur texte",
      "IMPORTANT: minifie-le sur 1 seule ligne avec: JSON.stringify(require('./firebase-key.json')) dans Node.js",
      "Ou utilise un outil en ligne comme jsonformatter.org → 'Compress'",
      "Ajoute dans Railway: FIREBASE_SERVICE_ACCOUNT={...json sur 1 ligne...}",
    ],
    envExample: `FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"app-factory-prod","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAo...\\n-----END PRIVATE KEY-----\\n","client_email":"firebase-adminsdk-xyz@app-factory-prod.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token"}`,
    link: "https://console.firebase.google.com",
  },
  {
    id: "google-play",
    name: "Google Play Developer API — Publication brouillon",
    group: "Publication Play Store",
    cost: "$25 one-time (compte développeur)",
    status: "required",
    howTo: [
      "Va sur play.google.com/console → crée un compte développeur ($25 one-time)",
      "Dans Play Console: 'Configuration' → 'Accès API'",
      "Clique 'Créer un nouveau projet Google Cloud' → accepte les conditions",
      "Dans Google Cloud Console (console.cloud.google.com) :",
      "  → IAM et administration → Comptes de service → Créer",
      "  → Nom: play-console-api → Créer",
      "  → Rôle: 'Éditeur' (ou rôles spécifiques: Release Manager, Store Listing Manager)",
      "  → Continuer → Terminé",
      "  → Clique sur le compte créé → Onglet 'Clés' → 'Ajouter une clé' → JSON → Créer",
      "  → Fichier JSON téléchargé automatiquement",
      "Retour dans Play Console → 'Accès API' → 'Accorder l'accès' au nouveau compte de service",
      "Permissions: 'Versions de l'app', 'Configuration des stores', 'Privacy and safety'",
      "Minifie le JSON → ajoute dans Railway: GOOGLE_PLAY_SERVICE_ACCOUNT={...}",
    ],
    envExample: `GOOGLE_PLAY_SERVICE_ACCOUNT={"type":"service_account","project_id":"pc-api-123456","private_key_id":"def456","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC...\\n-----END PRIVATE KEY-----\\n","client_email":"play-console-api@pc-api-123456.iam.gserviceaccount.com","client_id":"987654321","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token"}`,
    link: "https://play.google.com/console",
  },
  {
    id: "github",
    name: "GitHub Token — Build Flutter + GitHub Pages",
    group: "CI/CD + Hébergement",
    cost: "GRATUIT",
    status: "required",
    howTo: [
      "Va sur github.com → connecte-toi",
      "Clique sur ton avatar → Settings → Developer settings (tout en bas)",
      "Personal access tokens → Tokens (classic) → Generate new token (classic)",
      "Note: 'App Factory CI/CD'",
      "Expiration: No expiration (ou 1 an)",
      "Coche les scopes: repo (tout), workflow, write:packages",
      "Génère → copie le token (commence par ghp_...)",
      "Crée un repo GitHub nommé 'app-factory-flutter' (public ou privé)",
      "Active GitHub Pages dans les settings du repo (Source: branch main /docs)",
      "Ajoute dans Railway: GITHUB_TOKEN=ghp_XXXX",
      "Ajoute dans Railway: GITHUB_OWNER=tonusername",
      "Ajoute dans Railway: GITHUB_REPO=app-factory-flutter",
    ],
    envExample: "GITHUB_TOKEN=ghp_ABCdefGHIjklMNOpqrSTUvwxYZ123456789\nGITHUB_OWNER=tonusername\nGITHUB_REPO=app-factory-flutter",
    link: "https://github.com/settings/tokens",
  },
];

export default function PrereqPanel() {
  const [open,     setOpen]     = useState(true);
  const [checked,  setChecked]  = useState({});
  const [expanded, setExpanded] = useState({});
  const [copied,   setCopied]   = useState({});

  const completedCount = Object.values(checked).filter(Boolean).length;
  const allDone        = completedCount === PREREQS.length;

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied((c) => ({ ...c, [id]: true }));
      setTimeout(() => setCopied((c) => ({ ...c, [id]: false })), 2000);
    });
  };

  return (
    <div style={{
      background: "#0A0A0F", border: "1px solid #1E1E2E", borderRadius: 14,
      marginBottom: 24, overflow: "hidden",
    }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", padding: "14px 18px", background: "#10101C", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚙️</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            Pré-requis & Configuration
          </span>
          <span style={{
            fontSize: 11, padding: "2px 10px", borderRadius: 20,
            background: allDone ? "#064E3B" : "#1F1F30",
            color:      allDone ? "#34D399" : "#888",
          }}>
            {completedCount}/{PREREQS.length} configurés
          </span>
        </div>
        <span style={{ color: "#475569", fontSize: 13 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "16px 18px 18px" }}>
          {/* Intro */}
          <div style={{
            padding: "12px 14px", borderRadius: 10, background: "#0D1117",
            border: "1px solid #1E293B", marginBottom: 16, fontSize: 12, color: "#94A3B8", lineHeight: 1.7,
          }}>
            <strong style={{ color: "#38BDF8" }}>⚠️ Important :</strong> Les appels API (Claude, OpenAI)
            sont faits <strong style={{ color: "#fff" }}>par le serveur Express</strong> (dossier{" "}
            <code style={{ color: "#A78BFA" }}>server/</code>), jamais par le navigateur.
            Cela évite les erreurs CORS. Les variables <code style={{ color: "#A78BFA" }}>VITE_*</code> sont
            accessibles au client, les autres uniquement au serveur.
          </div>

          {PREREQS.map((p) => (
            <div key={p.id} style={{
              border: `1px solid ${checked[p.id] ? "#065F46" : "#1E1E2E"}`,
              borderRadius: 10, marginBottom: 8, overflow: "hidden",
              transition: "border-color 0.2s",
            }}>
              {/* Row */}
              <div
                style={{
                  padding: "11px 14px", display: "flex", alignItems: "center", gap: 10,
                  cursor: "pointer", background: "#0D0D17",
                }}
                onClick={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
              >
                <input
                  type="checkbox"
                  checked={checked[p.id] || false}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => setChecked((c) => ({ ...c, [p.id]: !c[p.id] }))}
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#7C3AED" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F0" }}>{p.name}</span>
                    <span style={{
                      fontSize: 10, padding: "1px 7px", borderRadius: 20,
                      background: p.cost === "GRATUIT" ? "#064E3B" : "#1E1E2E",
                      color:      p.cost === "GRATUIT" ? "#34D399"  : "#A78BFA",
                    }}>
                      {p.cost}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>{p.group}</div>
                </div>
                <span style={{ color: "#444", fontSize: 12 }}>{expanded[p.id] ? "▲" : "▼"}</span>
              </div>

              {expanded[p.id] && (
                <div style={{ padding: "12px 14px", background: "#080810", borderTop: "1px solid #1E1E2E" }}>
                  {/* Steps */}
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Étapes :
                  </div>
                  {p.howTo.map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5 }}>
                      {!step.startsWith(" ") && (
                        <span style={{ color: "#7C3AED", fontSize: 11, flexShrink: 0, fontWeight: 700 }}>
                          {i + 1}.
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: step.startsWith(" ") ? "#A78BFA" : "#94A3B8", lineHeight: 1.5 }}>
                        {step}
                      </span>
                    </div>
                  ))}

                  {/* Env example */}
                  {p.envExample && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>
                        Variable(s) à ajouter dans Railway :
                      </div>
                      <div style={{ position: "relative" }}>
                        <pre style={{
                          fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#A78BFA",
                          background: "#0D0D17", border: "1px solid #1E1E2E", borderRadius: 6,
                          padding: "8px 10px", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5,
                          maxHeight: 160, overflowY: "auto", margin: 0,
                        }}>
                          {p.envExample}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(p.envExample, p.id)}
                          style={{
                            position: "absolute", top: 6, right: 6,
                            padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer",
                            background: "#1E1E2E", border: "none", color: copied[p.id] ? "#34D399" : "#94A3B8",
                          }}
                        >
                          {copied[p.id] ? "✓ Copié" : "Copier"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Link */}
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 11, color: "#38BDF8", textDecoration: "none", fontWeight: 600 }}
                  >
                    🔗 Ouvrir → {p.name}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
