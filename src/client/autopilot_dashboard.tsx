import { useState } from "react";
import TrackCPipelineSimulator from "./track_c_full_pipeline";

const NICHES = [
  {
    id: 1,
    icon: "ti-robot",
    color: "#7F77DD",
    bg: "#EEEDFE",
    darkBg: "#3C3489",
    name: "AI Productivity & Automation",
    score: 9.5,
    market: "$467B d'ici 2030",
    demand: "10k+ recherches/mois Etsy",
    price: "$9 – $47",
    competition: "Moyenne",
    competitionColor: "#EF9F27",
    examples: [
      "Prompts ChatGPT pour freelances",
      "Templates Notion agences",
      "Workflows n8n pré-construits",
      "SOPs automatisées solopreneurs",
    ],
    keywords: [
      "AI prompt pack",
      "notion template freelancers",
      "chatgpt business prompts",
    ],
    track: "A",
  },
  {
    id: 2,
    icon: "ti-coin",
    color: "#1D9E75",
    bg: "#E1F5EE",
    darkBg: "#085041",
    name: "Personal Finance & Budget",
    score: 9.0,
    market: "Industrie $1.2T",
    demand: "50k+ recherches/mois Etsy",
    price: "$5 – $27",
    competition: "Forte sur générique, faible sur niche",
    competitionColor: "#E24B4A",
    examples: [
      "Budget tracker freelances",
      "Tableau de bord investissement",
      "Planificateur épargne",
      "Budget voyage digital nomad",
    ],
    keywords: [
      "freelancer budget template",
      "savings tracker notion",
      "investment dashboard",
    ],
    track: "A",
  },
  {
    id: 3,
    icon: "ti-device-mobile",
    color: "#D85A30",
    bg: "#FAECE7",
    darkBg: "#712B13",
    name: "Health & Wellness Apps",
    score: 8.5,
    market: "Top catégorie App Store",
    demand: "$500–3k/mois par app",
    price: "Freemium + $4.99 lifetime",
    competition: "Forte générique, faible ultra-niche",
    competitionColor: "#EF9F27",
    examples: [
      "Habit tracker minimaliste",
      "Timer méditation ciblé",
      "Calculateur macros simple",
      "Journal de gratitude",
    ],
    keywords: ["habit tracker", "meditation timer", "water reminder app"],
    track: "C",
  },
  {
    id: 4,
    icon: "ti-school",
    color: "#378ADD",
    bg: "#E6F1FB",
    darkBg: "#0C447C",
    name: "Micro-cours & Education",
    score: 8.0,
    market: "$120.7B e-learning",
    demand: "Croissance rapide 2025-26",
    price: "$27 – $197",
    competition: "Faible sur ultra-spécifique",
    competitionColor: "#639922",
    examples: [
      "Automatiser avec n8n",
      "Vendre des templates Notion",
      "Lancer un micro-SaaS",
      "SEO produits digitaux",
    ],
    keywords: [
      "n8n automation course",
      "notion templates business",
      "micro saas launch",
    ],
    track: "A+B",
  },
  {
    id: 5,
    icon: "ti-layout",
    color: "#BA7517",
    bg: "#FAEEDA",
    darkBg: "#633806",
    name: "Industry-Specific Templates",
    score: 7.5,
    market: "Peu saturé, premium pricing",
    demand: "Acheteurs B2B avec budget",
    price: "$15 – $97",
    competition: "Très faible sur métier précis",
    competitionColor: "#639922",
    examples: [
      "Landing pages coaches",
      "Portfolios photographes",
      "Sites agences IA",
      "Kits consultants indépendants",
    ],
    keywords: [
      "coach website template",
      "photographer portfolio notion",
      "consultant kit",
    ],
    track: "A+B",
  },
];

const AGENTS = {
  A: [
    {
      id: "scout",
      name: "Niche Scout",
      icon: "ti-search",
      color: "#7F77DD",
      role: "Analyste marché",
      desc: "Valide la demande sur Etsy, Google Trends, Gumroad. GO/NO-GO.",
      outputKey: "Rapport de validation JSON",
      systemPrompt: `Tu es un expert en recherche de niches digitales rentables pour produits digitaux (templates, prompts, guides PDF).
Analyse la demande pour la niche/idée fournie. 
Réponds UNIQUEMENT avec un objet JSON structuré contenant :
- niche (string)
- sub_niche (string, plus précise)  
- validated (boolean)
- avg_price_usd (number)
- top_keywords (array de 3 strings)
- estimated_monthly_searches (number)
- competition_level ("low"|"medium"|"high")
- recommended_price_usd (number)
- best_platform ("Etsy"|"Gumroad"|"Both")
- go_nogo_reason (string, 1 phrase)
Pas de markdown, pas de prose, JSON brut uniquement.`,
    },
    {
      id: "architect",
      name: "Product Architect",
      icon: "ti-building",
      color: "#1D9E75",
      role: "Designer produit",
      desc: "Conçoit la structure complète du produit, sections, USP, prix, upsells.",
      outputKey: "Blueprint produit JSON",
      systemPrompt: `Tu es un expert en création de produits digitaux premium vendables sur Etsy et Gumroad.
À partir du rapport de validation fourni, conçois le produit optimal.
Réponds UNIQUEMENT avec un objet JSON contenant :
- product_title (string, accrocheur, <70 chars)
- format (string ex: "PDF + Notion template")
- sections (array de strings, 4-6 sections avec nombre d'éléments)
- usp (string, proposition de valeur unique en 1 phrase)
- bonuses (array de 2 strings, bonus inclus)
- price_usd (number)
- upsell_title (string)
- upsell_price_usd (number)
- target_audience (string)
Pas de markdown, JSON brut uniquement.`,
    },
    {
      id: "content",
      name: "Content Factory",
      icon: "ti-file-text",
      color: "#D85A30",
      role: "Créateur de contenu",
      desc: "Génère le contenu COMPLET du produit section par section.",
      outputKey: "Contenu produit complet",
      systemPrompt: `Tu es un expert créateur de contenu digital premium.
À partir du blueprint produit fourni, génère le contenu COMPLET de la PREMIÈRE section du produit.
Format Markdown. Sois TRÈS concret et actionnable. Pour les prompts : écris le prompt complet + exemple d'output attendu.
Pour les templates : écris la structure complète avec toutes les variables.
Commence directement par le contenu, pas d'intro.`,
    },
    {
      id: "seo",
      name: "SEO & Marketing",
      icon: "ti-speakerphone",
      color: "#378ADD",
      role: "Copywriter SEO",
      desc: "Génère titre Etsy, description, 13 tags, copy Gumroad, lead magnet.",
      outputKey: "Assets marketing complets",
      systemPrompt: `Tu es un expert copywriting et SEO pour marketplaces Etsy et Gumroad.
À partir du blueprint produit fourni, génère TOUS les assets marketing.
Réponds avec un JSON contenant :
- etsy_title (string, <140 chars, mots-clés en premier)
- etsy_description (string, 300+ mots, SEO)
- etsy_tags (array de 13 strings, longue traîne)
- gumroad_headline (string, accroche conversion)
- lead_magnet_title (string, version gratuite partielle)
- pinterest_pin_text (string, pour 1 pin)
- delivery_email_subject (string)
JSON brut, pas de markdown autour.`,
    },
    {
      id: "funnel",
      name: "Email Funnel",
      icon: "ti-mail",
      color: "#BA7517",
      role: "Automation specialist",
      desc: "Crée la séquence email complète (5 emails J0→J8) + lead magnet strategy.",
      outputKey: "Séquence email automatique",
      systemPrompt: `Tu es un expert en email marketing automation et séquences de vente.
À partir des assets marketing fournis, génère la séquence email complète pour MailerLite.
Réponds avec un JSON contenant un array "emails" de 5 objets, chacun avec :
- day (number: 0,2,4,6,8)
- subject (string, optimisé ouverture)
- preview (string, <90 chars)
- objective (string: "livraison"|"valeur"|"présentation"|"social_proof"|"offre")
- body_key_points (array de 3 strings, points principaux du mail)
JSON brut.`,
    },
  ],
  C: [
    {
      id: "app-scout",
      name: "App Concept Scout",
      icon: "ti-search",
      color: "#7F77DD",
      role: "Market researcher",
      desc: "Identifie le concept d'app gagnant, différenciateur, mots-clés ASO.",
      outputKey: "Concept app validé JSON",
      systemPrompt: `Tu es un expert en apps mobiles et ASO (App Store Optimization).
Analyse la catégorie/idée fournie et identifie le concept d'app optimal.
Réponds UNIQUEMENT avec un JSON :
- app_category (string)
- app_concept (string, 1 phrase claire)
- differentiator (string, ce qui la distingue)
- app_name (string, court, mémorable)
- target_keywords (array de 5 strings ASO)
- monetization ("freemium"|"ads"|"paid"|"freemium+ads")
- estimated_monthly_downloads (string ex: "5000-15000")
- revenue_estimate_monthly (string ex: "$200-500")
- go_nogo (boolean)
JSON brut.`,
    },
    {
      id: "app-config",
      name: "Config Generator",
      icon: "ti-settings",
      color: "#1D9E75",
      role: "Flutter architect",
      desc: "Génère app_config.dart + content.json complets pour le moteur Flutter.",
      outputKey: "Fichiers config Flutter",
      systemPrompt: `Tu es un expert Flutter. Tu génères des fichiers de configuration pour un moteur d'app reskin.
À partir du concept app fourni, génère :
1. Le fichier app_config.dart complet avec tous les champs (appName, primaryColor hex, secondaryColor hex, admobBannerId placeholder, premiumProductId, freeItemsLimit, notificationTitle)
2. Un extrait du content.json avec 5 items d'exemple pour cette app

Formate la réponse comme du texte avec :
## app_config.dart
\`\`\`dart
[code]
\`\`\`
## content.json (extrait)
\`\`\`json
[json]
\`\`\``,
    },
    {
      id: "aso",
      name: "ASO Optimizer",
      icon: "ti-chart-bar",
      color: "#D85A30",
      role: "Store listing expert",
      desc: "Titre (30 chars), sous-titre, description longue 4000 chars, keywords.",
      outputKey: "Store listing optimisé",
      systemPrompt: `Tu es un expert ASO (App Store Optimization) pour iOS App Store et Google Play Store.
À partir du concept app fourni, génère le listing store complet.
Réponds avec un JSON :
- app_store_title (string, max 30 chars, mot-clé principal en premier)
- app_store_subtitle (string, max 30 chars)
- play_store_short_desc (string, max 80 chars)
- keywords_ios (string, max 100 chars, virgule-séparés)
- long_description (string, 500+ chars, SEO-optimisé, émojis autorisés)
- whats_new (string, pour première version)
JSON brut.`,
    },
    {
      id: "build",
      name: "Build & Deploy",
      icon: "ti-rocket",
      color: "#378ADD",
      role: "DevOps automator",
      desc: "Génère le workflow GitHub Actions CI/CD + checklist de soumission.",
      outputKey: "CI/CD + checklist déploiement",
      systemPrompt: `Tu es un expert DevOps Flutter et CI/CD automation.
Génère le workflow GitHub Actions complet pour builder et déployer cette app Flutter sur Google Play (track internal).
Inclus aussi une checklist de soumission en JSON.
Format :
## .github/workflows/build.yml
\`\`\`yaml
[workflow complet]
\`\`\`
## Checklist
\`\`\`json
{"checklist": [{"task": "...", "done": false}, ...]}
\`\`\``,
    },
  ],
};

const ROADMAP_WEEKS = [
  {
    week: "J1-3",
    label: "Setup",
    hours: 9,
    color: "#7F77DD",
    tasks: [
      "Gumroad + Stripe",
      "MailerLite",
      "Canva Free",
      "n8n sur Railway",
      "Projet Claude + .md files",
    ],
    phase: 0,
  },
  {
    week: "S1",
    label: "1er produit",
    hours: 25,
    color: "#1D9E75",
    tasks: [
      "Agent 1: valider niche AI Prompts",
      "Agent 2+3: créer 100 prompts",
      "Canva: PDF + mockups",
      "Agent 4+5: Etsy + Gumroad live",
      "MailerLite séquence email",
    ],
    phase: 1,
  },
  {
    week: "S2",
    label: "Produit 2 + trafic",
    hours: 25,
    color: "#1D9E75",
    tasks: [
      "Valider niche Finance Templates",
      "Créer bundle budget/finance",
      "Publier produit 2",
      "20+ pins Pinterest",
      "Optimiser listings selon stats",
    ],
    phase: 1,
  },
  {
    week: "S3",
    label: "Moteur Flutter",
    hours: 25,
    color: "#D85A30",
    tasks: [
      "Construire moteur Flutter",
      "app_config.dart + écrans",
      "AdMob + IAP intégrés",
      "Agent 1-3 App: concept + config",
    ],
    phase: 2,
  },
  {
    week: "S4",
    label: "App 1 + produit 3",
    hours: 25,
    color: "#D85A30",
    tasks: [
      "Google Play Console ($25)",
      "Build + upload app 1",
      "Produit 3 (Notion templates)",
      "Workflow n8n veille niches",
      "Newsletter hebdo démarrage",
    ],
    phase: 2,
  },
  {
    week: "S5-6",
    label: "Optimisation",
    hours: 50,
    color: "#378ADD",
    tasks: [
      "SEO: optimiser titres/tags Etsy",
      "App 1 publiée → analyser reviews",
      "App 2 configurée + soumise",
      "Email list: objectif 100 subs",
      "Bundle produits existants",
    ],
    phase: 3,
  },
  {
    week: "S7-10",
    label: "→ $1000/mois",
    hours: 100,
    color: "#BA7517",
    tasks: [
      "5+ produits Gumroad/Etsy: $400-700",
      "3+ apps live: $200-500",
      "Affiliation email: $100-300",
      "1 nouvelle app/semaine (6h)",
      "Cible: 60 ventes/jour = $1000+",
    ],
    phase: 3,
  },
  {
    week: "S11-20",
    label: "→ $5000/mois",
    hours: 200,
    color: "#639922",
    tasks: [
      "10+ apps: $1500-4000/mois",
      "10+ produits: $800-2000/mois",
      "Email list 500+: $500-1500/mois",
      "Micro-SaaS Track B: $500-2000 MRR",
      "Effort: 12-15h/semaine max",
    ],
    phase: 4,
  },
];

const PHASES = [
  { id: 0, label: "Setup", color: "#7F77DD" },
  { id: 1, label: "Track A", color: "#1D9E75" },
  { id: 2, label: "Track C", color: "#D85A30" },
  { id: 3, label: "Optimisation", color: "#378ADD" },
  { id: 4, label: "Scale", color: "#639922" },
];

// const API_KEY =
//   "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";

// async function callClaude(systemPrompt, userMessage) {
//   const response = await fetch("http://localhost:3000/chat", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       systemPrompt,
//       message: userMessage,
//     }),
//   });

//   if (!response.ok) {
//     const err = await response.text();
//     throw new Error(err);
//   }

//   const data = await response.json();

//   console.info("data 3 : ", data);
//   return data.text;
// }

// async function callAgent(systemPrompt, userMessage) {
//   console.info("systemPrompt : ", systemPrompt);
//   console.info("userMessage : ", userMessage);
// console.info("body : ", JSON.stringify({
//     model: "claude-sonnet-4-5-20250929",
//     max_tokens: 1000,
//     system: systemPrompt,
//     messages: [{ role: "user", content: userMessage }]
//   }));
// const response = await fetch("https://api.anthropic.com/v1/messages", {
//   method: "POST",
//   headers: {
//     "x-api-key": API_KEY,
//     "anthropic-version": "2023-06-01",
//     "content-type": "application/json"
//   },
//   body: JSON.stringify({
//     model: "claude-sonnet-4-20250514",
//     max_tokens: 1000,
//     system: systemPrompt,
//     messages: [{ role: "user", content: userMessage }]
//   })
// });
// const data = await response.json();
// const data = await callClaude(systemPrompt, userMessage);
// console.info("data 2 : ", data);
// console.info("data.content?.map(b => b.text) : ", data.content?.map(b => b.text));
// console.info("data.content?.map(b => b.text || '') : ", data.content?.map(b => b.text || ""));
// console.info("data.content?.map(b => b.text || '').join('') : ", data.content?.map(b => b.text || "").join(""));
// if (data) {
//   console.info("data : ", data);
//   console.info("content : ", data.content);
//   console.info("text : ", data.text);
//   return data;
// }

// return "Erreur API";
// return data.content?.map(b => b.text || "").join("") || "Erreur API";
// }

function ScoreBar({ score }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--color-border-tertiary)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${score * 10}%`,
            height: "100%",
            background: "#7F77DD",
            borderRadius: 3,
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, minWidth: 28 }}>
        {score}/10
      </span>
    </div>
  );
}

function NicheCard({ niche, expanded, onToggle }) {
  return (
    <div
      style={{
        background: "var(--color-background-primary)",
        border: `0.5px solid var(--color-border-tertiary)`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--color-border-secondary)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "var(--color-border-tertiary)")
      }
    >
      <div
        style={{
          padding: "1rem 1.25rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
        onClick={onToggle}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: niche.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <i
            className={`ti ${niche.icon}`}
            style={{ fontSize: 18, color: niche.color }}
            aria-hidden="true"
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            {niche.name}
          </div>
          <ScoreBar score={niche.score} />
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 20,
              background: "#EEEDFE",
              color: "#534AB7",
              fontWeight: 500,
            }}
          >
            Track {niche.track}
          </span>
          <i
            className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`}
            style={{ fontSize: 14, color: "var(--color-text-secondary)" }}
            aria-hidden="true"
          />
        </div>
      </div>
      {expanded && (
        <div
          style={{
            borderTop: "0.5px solid var(--color-border-tertiary)",
            padding: "1rem 1.25rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            {[
              ["Marché", niche.market],
              ["Demande", niche.demand],
              ["Prix", niche.price],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  background: "var(--color-background-secondary)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-secondary)",
                    marginBottom: 3,
                  }}
                >
                  {k}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                marginBottom: 6,
              }}
            >
              Sous-niches à cibler
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {niche.examples.map((ex) => (
                <span
                  key={ex}
                  style={{
                    fontSize: 12,
                    padding: "3px 10px",
                    borderRadius: 20,
                    background: "var(--color-background-secondary)",
                    border: "0.5px solid var(--color-border-tertiary)",
                  }}
                >
                  {ex}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                marginBottom: 6,
              }}
            >
              Keywords SEO prioritaires
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {niche.keywords.map((kw) => (
                <span
                  key={kw}
                  style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    borderRadius: 20,
                    background: "var(--color-background-secondary)",
                    fontFamily: "var(--font-mono)",
                    border: "0.5px solid var(--color-border-tertiary)",
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// function AgentStep({
//   agent,
//   status,
//   output,
//   onRun,
//   isFirst,
//   previousOutput,
//   inputValue,
// }) {
//   const [running, setRunning] = useState(false);
//   const [localOutput, setLocalOutput] = useState(output || "");

//   const handleRun = async () => {
//     setRunning(true);
//     try {
//       const userMsg = isFirst
//         ? `Niche/idée à analyser : "${inputValue}"`
//         : `Données de l'agent précédent :\n${previousOutput}\n\nContinue le pipeline avec ta tâche.`;
//       const result = await callAgent(agent.systemPrompt, userMsg);
//       setLocalOutput(result);
//       onRun(result);
//     } catch {
//       setLocalOutput("Erreur lors de l'appel API. Vérifiez votre connexion.");
//       onRun("error");
//     }
//     setRunning(false);
//   };

//   const displayOutput = localOutput || output;

//   return (
//     <div
//       style={{
//         background: "var(--color-background-primary)",
//         border: `0.5px solid ${status === "done" ? agent.color + "66" : "var(--color-border-tertiary)"}`,
//         borderRadius: 12,
//         overflow: "hidden",
//         opacity: status === "locked" ? 0.5 : 1,
//         transition: "all 0.3s",
//       }}
//     >
//       <div
//         style={{
//           padding: "14px 16px",
//           display: "flex",
//           alignItems: "center",
//           gap: 12,
//         }}
//       >
//         <div
//           style={{
//             width: 32,
//             height: 32,
//             borderRadius: 8,
//             flexShrink: 0,
//             background:
//               status === "done"
//                 ? agent.color
//                 : "var(--color-background-secondary)",
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "center",
//             transition: "background 0.3s",
//           }}
//         >
//           {status === "done" ? (
//             <i
//               className="ti ti-check"
//               style={{ fontSize: 16, color: "#fff" }}
//               aria-hidden="true"
//             />
//           ) : (
//             <i
//               className={`ti ${agent.icon}`}
//               style={{
//                 fontSize: 16,
//                 color:
//                   status === "active"
//                     ? agent.color
//                     : "var(--color-text-secondary)",
//               }}
//               aria-hidden="true"
//             />
//           )}
//         </div>
//         <div style={{ flex: 1 }}>
//           <div style={{ fontSize: 13, fontWeight: 500 }}>{agent.name}</div>
//           <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
//             {agent.role} — {agent.desc}
//           </div>
//         </div>
//         {status === "active" && (
//           <button
//             onClick={handleRun}
//             disabled={running || status === "locked"}
//             style={{
//               padding: "6px 14px",
//               borderRadius: 6,
//               fontSize: 12,
//               fontWeight: 500,
//               background: agent.color,
//               color: "#fff",
//               border: "none",
//               cursor: "pointer",
//               opacity: running ? 0.7 : 1,
//             }}
//           >
//             {running ? "Génération…" : "Exécuter ↗"}
//           </button>
//         )}
//       </div>
//       {displayOutput && (
//         <div
//           style={{
//             borderTop: "0.5px solid var(--color-border-tertiary)",
//             padding: "12px 16px",
//             background: "var(--color-background-secondary)",
//           }}
//         >
//           <div
//             style={{
//               fontSize: 11,
//               color: "var(--color-text-secondary)",
//               marginBottom: 6,
//               textTransform: "uppercase",
//               letterSpacing: "0.05em",
//             }}
//           >
//             Output — {agent.outputKey}
//           </div>
//           <pre
//             style={{
//               fontSize: 12,
//               fontFamily: "var(--font-mono)",
//               whiteSpace: "pre-wrap",
//               wordBreak: "break-word",
//               maxHeight: 240,
//               overflowY: "auto",
//               margin: 0,
//               color: "var(--color-text-primary)",
//               lineHeight: 1.6,
//             }}
//           >
//             {displayOutput}
//           </pre>
//         </div>
//       )}
//     </div>
//   );
// }

function PipelineSimulator() {
  const [track, setTrack] = useState("A");
  const [input, setInput] = useState("");
  // const [started, setStarted] = useState(false);
  // const [currentStep, setCurrentStep] = useState(0);
  // const [outputs, setOutputs] = useState({});
  const agents = AGENTS[track];

  const handleStart = () => {
    if (!input.trim()) return;
    // setStarted(true);
    // setCurrentStep(0);
    // setOutputs({});
  };

  // const handleAgentDone = (agentId, output, idx) => {
  //   setOutputs((prev) => ({ ...prev, [agentId]: output }));
  //   setCurrentStep(idx + 1);
  // };

  const reset = () => {
    // setStarted(false);
    // setCurrentStep(0);
    // setOutputs({});
    setInput("");
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            marginBottom: 8,
          }}
        >
          Sélectionner le track
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            {
              id: "A",
              label: "Track A — Produits digitaux",
              icon: "ti-file-text",
            },
            {
              id: "C",
              label: "Track C — App Reskin",
              icon: "ti-device-mobile",
            },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTrack(t.id);
                reset();
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                background:
                  track === t.id
                    ? "#7F77DD"
                    : "var(--color-background-secondary)",
                color: track === t.id ? "#fff" : "var(--color-text-primary)",
                border:
                  track === t.id
                    ? "none"
                    : "0.5px solid var(--color-border-tertiary)",
              }}
            >
              <i
                className={`ti ${t.icon}`}
                style={{ marginRight: 6 }}
                aria-hidden="true"
              />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "var(--color-background-secondary)",
          borderRadius: 12,
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            marginBottom: 8,
          }}
        >
          {track === "A" ? (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  placeholder={
                    track === "A"
                      ? "Ex: templates Notion pour agences marketing"
                      : "Ex: app méditation pour anxiété"
                  }
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontSize: 14,
                    border: "0.5px solid var(--color-border-secondary)",
                    background: "var(--color-background-primary)",
                    color: "var(--color-text-primary)",
                  }}
                />
                <button
                  onClick={handleStart}
                  disabled={!input.trim()}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    background: "#7F77DD",
                    color: "#fff",
                    border: "none",
                    opacity: input.trim() ? 1 : 0.5,
                  }}
                >
                  Lancer pipeline ↗
                </button>
              </div>
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    marginBottom: 10,
                  }}
                >
                  Pipeline : {agents.length} agents en séquence
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexWrap: "wrap",
                  }}
                >
                  {agents.map((a, i) => (
                    <div
                      key={a.id}
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          padding: "4px 10px",
                          borderRadius: 20,
                          background: "var(--color-background-primary)",
                          border: "0.5px solid var(--color-border-tertiary)",
                        }}
                      >
                        <i
                          className={`ti ${a.icon}`}
                          style={{
                            fontSize: 12,
                            marginRight: 4,
                            color: a.color,
                          }}
                          aria-hidden="true"
                        />
                        {a.name}
                      </div>
                      {i < agents.length - 1 && (
                        <i
                          className="ti ti-arrow-right"
                          style={{
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <TrackCPipelineSimulator />
          )}
        </div>
      </div>
    </div>
  );
}

function RoadmapView() {
  const [expanded, setExpanded] = useState(null);
  const maxHours = 200;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 24,
        }}
      >
        {PHASES.map((p) => (
          <div
            key={p.id}
            style={{
              background: "var(--color-background-secondary)",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: p.color,
                marginBottom: 6,
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 500 }}>{p.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ROADMAP_WEEKS.map((w, i) => (
          <div
            key={i}
            style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 10,
              overflow: "hidden",
              cursor: "pointer",
            }}
            onClick={() => setExpanded(expanded === i ? null : i)}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor =
                "var(--color-border-secondary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor =
                "var(--color-border-tertiary)")
            }
          >
            <div
              style={{
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 48,
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 500,
                  color: w.color,
                }}
              >
                {w.week}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  {w.label}
                </div>
                <div
                  style={{
                    height: 4,
                    background: "var(--color-border-tertiary)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min((w.hours / maxHours) * 100, 100)}%`,
                      height: "100%",
                      background: w.color,
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  minWidth: 40,
                  textAlign: "right",
                }}
              >
                {w.hours}h
              </div>
              <i
                className={`ti ${expanded === i ? "ti-chevron-up" : "ti-chevron-down"}`}
                style={{ fontSize: 14, color: "var(--color-text-secondary)" }}
                aria-hidden="true"
              />
            </div>
            {expanded === i && (
              <div
                style={{
                  borderTop: "0.5px solid var(--color-border-tertiary)",
                  padding: "10px 14px 14px",
                  background: "var(--color-background-secondary)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {w.tasks.map((t, ti) => (
                    <div
                      key={ti}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 20,
                        background: "var(--color-background-primary)",
                        border: `0.5px solid ${w.color}44`,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <i
                        className="ti ti-point-filled"
                        style={{ fontSize: 8, color: w.color }}
                        aria-hidden="true"
                      />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilesView() {
  const files = [
    {
      name: "00_MASTER_CONTEXT.md",
      icon: "ti-brain",
      color: "#7F77DD",
      desc: "Référence absolue — lire en premier à chaque session de chat",
      size: "~2 Ko",
    },
    {
      name: "01_NICHES_ANALYSIS.md",
      icon: "ti-chart-bar",
      color: "#1D9E75",
      desc: "5 niches validées avec données marché, mots-clés, projections revenue",
      size: "~3 Ko",
    },
    {
      name: "02_TRACK_A_DIGITAL_PRODUCTS.md",
      icon: "ti-file-text",
      color: "#D85A30",
      desc: "Pipeline 6 agents produits digitaux — prompts, JSON outputs, projections",
      size: "~5 Ko",
    },
    {
      name: "04_TRACK_C_APP_RESKIN.md",
      icon: "ti-device-mobile",
      color: "#378ADD",
      desc: "Moteur Flutter + pipeline 5 agents + architecture app_config.dart",
      size: "~4 Ko",
    },
    {
      name: "05_AUTOMATION_STACK.md",
      icon: "ti-settings-automation",
      color: "#BA7517",
      desc: "Stack outils gratuits → payants + workflows n8n Railway + scripts Python",
      size: "~4 Ko",
    },
    {
      name: "06_ROADMAP.md",
      icon: "ti-calendar",
      color: "#639922",
      desc: "Planning semaine par semaine J1 → S20, tâches + KPIs",
      size: "~3 Ko",
    },
  ];

  return (
    <div>
      <div
        style={{
          background: "var(--color-background-secondary)",
          borderRadius: 10,
          padding: "1rem",
          marginBottom: 16,
          fontSize: 13,
          color: "var(--color-text-secondary)",
          lineHeight: 1.7,
        }}
      >
        <i
          className="ti ti-bulb"
          style={{ marginRight: 6, color: "#BA7517" }}
          aria-hidden="true"
        />
        Pour utiliser ces fichiers dans Claude.ai : crée un{" "}
        <strong>Project</strong>, puis upload chaque .md comme document de
        référence. Tous tes chats dans ce projet auront accès au contexte
        complet et les agents ne se perdront jamais.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {files.map((f) => (
          <div
            key={f.name}
            style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: f.color + "20",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <i
                className={`ti ${f.icon}`}
                style={{ fontSize: 18, color: f.color }}
                aria-hidden="true"
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                  marginBottom: 3,
                }}
              >
                {f.name}
              </div>
              <div
                style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
              >
                {f.desc}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                color: "var(--color-text-secondary)",
                flexShrink: 0,
              }}
            >
              {f.size}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 16,
          padding: "1rem",
          background: "var(--color-background-secondary)",
          borderRadius: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
          <i
            className="ti ti-brand-github"
            style={{ marginRight: 6 }}
            aria-hidden="true"
          />
          Architecture n8n sur Railway
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-secondary)",
            lineHeight: 1.8,
          }}
        >
          Tous les fichiers sont dans{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              background: "var(--color-background-primary)",
              padding: "1px 5px",
              borderRadius: 4,
            }}
          >
            /home/claude/project_autopilot/
          </code>
          <br />
          Tu peux les déployer sur Railway comme base de référence de ton n8n
          self-hosted.
          <br />
          Les workflows n8n correspondants sont documentés dans{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              background: "var(--color-background-primary)",
              padding: "1px 5px",
              borderRadius: 4,
            }}
          >
            05_AUTOMATION_STACK.md
          </code>
        </div>
      </div>
    </div>
  );
}

function AutoPilotDashboard() {
  const [tab, setTab] = useState("overview");
  const [expandedNiche, setExpandedNiche] = useState(null);

  const TABS = [
    { id: "overview", label: "Vue d'ensemble", icon: "ti-home" },
    { id: "niches", label: "Niches", icon: "ti-chart-bar" },
    { id: "pipeline", label: "Pipeline IA", icon: "ti-robot" },
    { id: "roadmap", label: "Roadmap", icon: "ti-calendar" },
    { id: "files", label: "Fichiers .md", icon: "ti-file-text" },
  ];

  const kpis = [
    {
      label: "Objectif min.",
      value: "$1 000",
      unit: "/mois",
      color: "#7F77DD",
    },
    { label: "Cible", value: "$5 000+", unit: "/mois", color: "#1D9E75" },
    {
      label: "Temps disponible",
      value: "25 h",
      unit: "/semaine",
      color: "#D85A30",
    },
    {
      label: "Agents IA",
      value: "10+",
      unit: "dans les pipelines",
      color: "#378ADD",
    },
  ];

  const tracks = [
    {
      id: "A",
      title: "Track A",
      subtitle: "Produits Digitaux IA",
      icon: "ti-file-text",
      color: "#7F77DD",
      bg: "#EEEDFE",
      delay: "2-4 sem.",
      target: "$500-2k/mois/produit",
      items: [
        "Templates Notion & Canva",
        "Packs prompts IA",
        "SOPs & playbooks",
        "Gumroad + Etsy + SEO",
      ],
    },
    {
      id: "B",
      title: "Track B",
      subtitle: "Micro-SaaS / Outils IA",
      icon: "ti-code",
      color: "#1D9E75",
      bg: "#E1F5EE",
      delay: "4-8 sem.",
      target: "$500-2k MRR",
      items: [
        "Petit outil résolvant 1 problème",
        "Stripe abonnement",
        "SEO + Product Hunt",
        "Revenue récurrent mensuel",
      ],
    },
    {
      id: "C",
      title: "Track C",
      subtitle: "App Reskin Engine",
      icon: "ti-device-mobile",
      color: "#D85A30",
      bg: "#FAECE7",
      delay: "3-6 sem.",
      target: "$1.5k-4k/mois (10 apps)",
      items: [
        "Moteur Flutter : 1 codebase",
        "Changer config = nouvelle app",
        "AdMob + IAP passifs",
        "6h par nouvelle app",
      ],
    },
  ];

  return (
    <div style={{ padding: "1rem 0", fontFamily: "var(--font-sans)" }}>
      <h2 className="sr-only">
        AutoPilot Business Dashboard — Business scalable $1000-$5000+/mois
      </h2>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>
          AutoPilot Business
        </div>
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
          Système $1 000 → $5 000+/mois — zéro contact humain — livraison
          automatique
        </div>
      </div>

      <div
        style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
              fontWeight: tab === t.id ? 500 : 400,
              background:
                tab === t.id
                  ? "var(--color-background-secondary)"
                  : "transparent",
              border:
                tab === t.id
                  ? "0.5px solid var(--color-border-secondary)"
                  : "0.5px solid transparent",
              color:
                tab === t.id
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
            }}
          >
            <i
              className={`ti ${t.icon}`}
              style={{ fontSize: 13, marginRight: 5 }}
              aria-hidden="true"
            />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 10,
              marginBottom: 24,
            }}
          >
            {kpis.map((k) => (
              <div
                key={k.label}
                style={{
                  background: "var(--color-background-secondary)",
                  borderRadius: 8,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    marginBottom: 4,
                  }}
                >
                  {k.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 500, color: k.color }}>
                  {k.value}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--color-text-secondary)" }}
                >
                  {k.unit}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tracks.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "var(--color-background-primary)",
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: 12,
                  padding: "1rem 1.25rem",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: t.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <i
                    className={`ti ${t.icon}`}
                    style={{ fontSize: 20, color: t.color }}
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {t.title}
                    </span>
                    <span
                      style={{ fontSize: 11, color: t.color, fontWeight: 500 }}
                    >
                      — {t.subtitle}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {t.items.map((item) => (
                      <span
                        key={item}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "var(--color-background-secondary)",
                          border: "0.5px solid var(--color-border-tertiary)",
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-secondary)",
                      marginBottom: 3,
                    }}
                  >
                    Délai
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{t.delay}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: t.color,
                      marginTop: 4,
                      fontWeight: 500,
                    }}
                  >
                    {t.target}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 20,
              padding: "1rem 1.25rem",
              background: "var(--color-background-secondary)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
              Effort récurrent (système en place)
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 8,
              }}
            >
              {[
                ["Dashboard revenue", "5 min/jour"],
                ["Pins Pinterest", "15 min × 3/sem"],
                ["Newsletter email", "30 min/sem"],
                ["Nouvelle app reskin", "6h/semaine"],
                ["Analyser & optimiser", "1h/semaine"],
              ].map(([task, time]) => (
                <div
                  key={task}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "8px 10px",
                    background: "var(--color-background-primary)",
                    borderRadius: 8,
                    border: "0.5px solid var(--color-border-tertiary)",
                  }}
                >
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {task}
                  </span>
                  <span style={{ fontWeight: 500 }}>{time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "niches" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {NICHES.map((n) => (
            <NicheCard
              key={n.id}
              niche={n}
              expanded={expandedNiche === n.id}
              onToggle={() =>
                setExpandedNiche(expandedNiche === n.id ? null : n.id)
              }
            />
          ))}
        </div>
      )}

      {tab === "pipeline" && <PipelineSimulator />}
      {/* {tab === "pipeline" && (
        <div>
          {tracks === "A" && <PipelineSimulator />}
          {tracks === "C" && <TrackCFullPipeline />}
        </div>
      )} */}
      {tab === "roadmap" && <RoadmapView />}
      {tab === "files" && <FilesView />}
    </div>
  );
}

export default AutoPilotDashboard;
