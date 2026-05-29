// Variables d'environnement lues depuis Railway (préfixe VITE_ pour Vite)
// Dans Railway : ajouter les variables avec préfixe VITE_ pour qu'elles soient exposées au client

export const ENV = {
  TRUE_PASSWORD:   import.meta.env.VITE_TRUE_PASSWORD   || "launch2026",
  FILLED_PASSWORD: import.meta.env.VITE_FILLED_PASSWORD || "",
  SHOW_STEPS:      import.meta.env.VITE_SHOW_STEPS      || "true",
  MODE_ENV:        import.meta.env.VITE_MODE_ENV        || "development",
  MOT_DEBUG:       import.meta.env.VITE_MOT_DEBUG       || "false",
};

export const IS_PROD       = ENV.MODE_ENV === "production";
export const SHOW_STEPS    = ENV.SHOW_STEPS === "true";
export const DEBUG_MODE    = ENV.MOT_DEBUG  === "true";

// ─── STEPS DEFINITIONS ──────────────────────────────────────────────────────
export const STEPS = [
  {
    id:      "market-scout",
    num:     "01",
    name:    "Market Scout",
    icon:    "ti-search",
    emoji:   "🔍",
    role:    "Analyse niche + top competitors Play Store",
    estTime: "2-3 min",
    costNote:"GRATUIT (google-play-scraper)",
    color:   "#7C3AED",
    description: "Recherche les 50 top apps concurrentes sur le Play Store pour ta niche. Calcule saturation, score moyen, et génère une recommandation GO/CAUTION/NO-GO via Claude.",
  },
  {
    id:      "app-architect",
    num:     "02",
    name:    "App Architect",
    icon:    "ti-blueprint",
    emoji:   "🏗️",
    role:    "Nom, package ID, thème, écrans",
    estTime: "1-2 min",
    costNote:"~$0.012 Claude Haiku",
    color:   "#0EA5E9",
    description: "Génère le nom de l'app, package ID unique, palette de couleurs, liste des 5 écrans et features clés. Base de tout le reste.",
  },
  {
    id:      "logo-gen",
    num:     "03",
    name:    "Logo Generator",
    icon:    "ti-photo",
    emoji:   "🎨",
    role:    "Logo IA → 4 formats PNG Google Play",
    estTime: "2-3 min",
    costNote:"$0.011 GPT Image 1 Standard",
    color:   "#F59E0B",
    description: "Génère un logo unique via GPT Image. Sharp redimensionne automatiquement aux 4 formats requis : 1024×1024, 512×512, 192×192, 48×48.",
  },
  {
    id:      "code-gen",
    num:     "04",
    name:    "Flutter Code Gen",
    icon:    "ti-code",
    emoji:   "⚡",
    role:    "Code Flutter + AdMob + Firebase Remote Config",
    estTime: "3-4 min",
    costNote:"~$0.025 Claude Haiku",
    color:   "#10B981",
    description: "Génère main.dart, tous les écrans, services AdMob, IAP et Firebase Remote Config. Les IDs AdMob sont externalisés dans Firebase — modifiables sans republier l'app.",
  },
  {
    id:      "screenshots",
    num:     "05",
    name:    "Screenshots Creator",
    icon:    "ti-device-mobile",
    emoji:   "📱",
    role:    "5 captures d'écran réelles (Puppeteer + device frame)",
    estTime: "3-5 min",
    costNote:"GRATUIT (Puppeteer + Sharp)",
    color:   "#6366F1",
    description: "Génère un aperçu HTML de l'app, Puppeteer capture 5 vrais écrans, Sharp ajoute le device frame Pixel 9. Export PNG 1440×3120 conforme Play Store.",
  },
  {
    id:      "aso",
    num:     "06",
    name:    "ASO Optimizer",
    icon:    "ti-sparkles",
    emoji:   "🎯",
    role:    "Listing complet Play Store SEO-optimisé",
    estTime: "1-2 min",
    costNote:"~$0.015 Claude Haiku",
    color:   "#EF4444",
    description: "Titre (30 chars), description courte (80 chars), description longue SEO (4000 chars), 13 keywords longue-traîne, texte Nouveautés v1.0.",
  },
  {
    id:      "compliance",
    num:     "07",
    name:    "Compliance Builder",
    icon:    "ti-shield-check",
    emoji:   "🛡️",
    role:    "Privacy Policy RGPD + Data Safety + UMP",
    estTime: "1-2 min",
    costNote:"~$0.010 Claude + GRATUIT GitHub Pages",
    color:   "#8B5CF6",
    description: "Privacy Policy RGPD générée et hébergée sur GitHub Pages. Déclaration Data Safety JSON. Google User Messaging Platform (UMP) pour le consentement requis en 2024+.",
  },
  {
    id:      "build-deploy",
    num:     "08",
    name:    "Build & Deploy",
    icon:    "ti-rocket",
    emoji:   "🚀",
    role:    "Build AAB signé → Upload Play Console Brouillon",
    estTime: "4-6 min",
    costNote:"GRATUIT (GitHub Actions + Play Console API)",
    color:   "#059669",
    description: "GitHub Actions compile Flutter en release, signe avec keystore, génère AAB. Upload sur Play Console via API → status DRAFT. Télécharge aussi l'APK debug pour test sur Android.",
  },
];

export const TOTAL_COST = "$0.073";
export const TOTAL_TIME = "18-27 min";
