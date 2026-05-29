"use strict";
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL  = "claude-haiku-4-5";
const TOKENS = 2048;

// ─── HELPER ─────────────────────────────────────────────────────────────────
async function ask(systemPrompt, userPrompt) {
  const msg = await client.messages.create({
    model:      MODEL,
    max_tokens: TOKENS,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });
  return msg.content[0].text;
}

async function askJSON(systemPrompt, userPrompt) {
  const text = await ask(systemPrompt, userPrompt);
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ─── NICHE ANALYSIS ─────────────────────────────────────────────────────────
async function analyzeNiche(niche, topApps) {
  return askJSON(
    "Tu es un expert en analyse marché mobile. Réponds UNIQUEMENT en JSON valide, sans markdown.",
    `Analyse la niche "${niche}" sur le Play Store.
Top 10 apps: ${JSON.stringify(topApps.map(a => ({ name: a.title, score: a.score, installs: a.installs })))}
Retourne ce JSON:
{
  "recommendation": "<GO|CAUTION|NO-GO> — <raison 1 phrase>",
  "nicheGap": "<opportunité spécifique identifiée>",
  "suggestedDifferentiator": "<comment se différencier>",
  "targetKeywords": ["<kw1>", "<kw2>", "<kw3>"]
}`
  );
}

// ─── APP ARCHITECTURE ───────────────────────────────────────────────────────
async function generateArchitecture(niche, marketData) {
  return askJSON(
    "Tu es un expert Flutter et UX mobile. Réponds UNIQUEMENT en JSON valide.",
    `Conçois une app Flutter pour la niche "${niche}".
Différenciateur: ${marketData?.analysis?.suggestedDifferentiator || "minimalisme"}
Retourne:
{
  "appName": "<nom court mémorable>",
  "tagline": "<slogan 6 mots max>",
  "packageId": "com.appfactory.<nomminuscules>",
  "screens": ["<screen1>", "<screen2>", "<screen3>", "<screen4>", "<screen5>"],
  "features": ["<feature1>", "<feature2>", "<feature3>"],
  "theme": {
    "primaryColor": "#XXXXXX",
    "secondaryColor": "#XXXXXX",
    "backgroundColor": "#XXXXXX",
    "fontFamily": "<Google Font>"
  }
}`
  );
}

// ─── LOGO PROMPT ────────────────────────────────────────────────────────────
async function generateLogoPrompt(appName, niche, primaryColor) {
  return ask(
    "Tu génères des prompts d'image pour des logos d'apps mobiles. Réponds UNIQUEMENT avec le prompt, sans explication.",
    `Génère un prompt pour générer le logo de l'app "${appName}" (niche: ${niche}, couleur: ${primaryColor}).
Le logo doit être: minimaliste, vectoriel, icône simple, fond transparent, style moderne 2026.
Max 120 mots.`
  );
}

// ─── FLUTTER CODE GEN ───────────────────────────────────────────────────────
async function generateFlutterCode(appName, packageId, architecture) {
  const mainDart = await ask(
    "Tu es un expert Flutter. Génère du code Dart 3.x production-ready complet.",
    `Génère le fichier main.dart complet pour l'app Flutter "${appName}" (package: ${packageId}).
Features: ${JSON.stringify(architecture?.features || [])}.
Thème: primaryColor ${architecture?.theme?.primaryColor || "#6C63FF"}.
Intègre: google_mobile_ads (AdMob), firebase_remote_config, in_app_purchase.
Les IDs AdMob sont lus depuis Firebase Remote Config (keys: ads_banner_id, ads_interstitial_id, ads_rewarded_id, ads_enabled).
Génère le code COMPLET et fonctionnel.`
  );

  const pubspec = `name: ${appName.toLowerCase().replace(/\s/g, "_")}
description: ${appName} - Built with App Factory
version: 1.0.0+1
environment:
  sdk: '>=3.0.0 <4.0.0'
dependencies:
  flutter:
    sdk: flutter
  firebase_core: ^3.1.0
  firebase_remote_config: ^5.0.0
  google_mobile_ads: ^5.1.0
  in_app_purchase: ^3.1.13
  shared_preferences: ^2.2.3
  flutter_local_notifications: ^17.1.2
dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0
flutter:
  uses-material-design: true
`;

  return {
    files: {
      "lib/main.dart": mainDart,
      "pubspec.yaml": pubspec,
    },
    packageId,
    appName,
    firebaseKeys: {
      ads_banner_id:       "ca-app-pub-3940256099942544/6300978111",
      ads_interstitial_id: "ca-app-pub-3940256099942544/1033173712",
      ads_rewarded_id:     "ca-app-pub-3940256099942544/5224354917",
      ads_enabled:         "true",
      premium_price_usd:   "4.99",
    },
  };
}

// ─── APP PREVIEW HTML (for screenshots) ─────────────────────────────────────
async function generateAppPreviewHTML(appName, architecture) {
  return ask(
    "Tu génères du HTML/CSS qui simule l'interface d'une app mobile. Réponds UNIQUEMENT avec le HTML complet.",
    `Génère une page HTML qui simule l'écran principal de l'app "${appName}".
Thème: ${JSON.stringify(architecture?.theme || {})}.
Screens: ${JSON.stringify(architecture?.screens || [])}.
La page doit ressembler à un vrai écran d'app Android (390×844px).
Utilise les couleurs du thème. Style moderne Material Design 3.
Inclus: header avec titre, contenu principal, bottom nav.
HTML complet avec <style> inline.`
  );
}

// ─── ASO LISTING ────────────────────────────────────────────────────────────
async function generateASO(appName, niche, marketData) {
  return askJSON(
    "Tu es un expert ASO (App Store Optimization) Play Store. Réponds UNIQUEMENT en JSON valide.",
    `Génère le listing Play Store complet pour "${appName}" (niche: ${niche}).
Keywords concurrents: ${JSON.stringify(marketData?.analysis?.targetKeywords || [])}.
Retourne:
{
  "title": "<max 30 chars — mot-clé principal en premier>",
  "shortDescription": "<max 80 chars — accroche conversion>",
  "description": "<4000 chars SEO, paragraphes, emojis, CTA>",
  "keywords": ["<kw1>", ..., "<kw13>"],
  "whatsNew": "<100 chars — nouveautés v1.0>"
}`
  );
}

// ─── PRIVACY POLICY ─────────────────────────────────────────────────────────
async function generatePrivacyPolicy(appName, packageId, features) {
  const html = await ask(
    "Tu génères des Privacy Policies conformes RGPD et Google Play 2026. Réponds UNIQUEMENT avec le HTML.",
    `Génère une Privacy Policy HTML complète pour l'app "${appName}" (${packageId}).
SDKs utilisés: Google AdMob, Firebase Remote Config, In-App Purchase.
La politique doit couvrir: collecte de données, AdMob, Firebase, droits utilisateurs RGPD.
Inclus une section UMP (User Messaging Platform) consent.
HTML complet avec styles CSS inline.`
  );
  return { html };
}

// ─── DATA SAFETY ────────────────────────────────────────────────────────────
async function generateDataSafety(appName, features) {
  return askJSON(
    "Tu génères des déclarations Data Safety pour le Play Store. JSON uniquement.",
    `Génère la déclaration Data Safety JSON pour "${appName}".
SDKs: AdMob, Firebase Remote Config.
Format:
{
  "dataTypes": [{ "type": "<type>", "collected": true, "shared": true, "purpose": "<purpose>" }],
  "securityPractices": ["<practice1>", "<practice2>"],
  "userControls": ["<control1>"]
}`
  );
}

// ─── MOCK DATA (dev mode) ────────────────────────────────────────────────────
function mockArchitect(niche) {
  return {
    appName: "HabitFlow",
    tagline: "One habit. Real change.",
    packageId: "com.appfactory.habitflow",
    screens: ["Home (streak + check-in)", "Stats (graphiques)", "Settings", "Premium", "Onboarding"],
    features: ["Streak counter", "Notifications quotidiennes", "Dark mode", "Widget Android"],
    theme: { primaryColor: "#7C3AED", secondaryColor: "#F5F3FF", backgroundColor: "#FFFFFF", fontFamily: "Inter" },
  };
}

function mockCodeGen(appName, packageId) {
  return {
    files: { "lib/main.dart": `// Flutter code for ${appName}\nvoid main() => runApp(${appName}App());`, "pubspec.yaml": "name: habitflow" },
    packageId, appName,
    firebaseKeys: { ads_banner_id: "ca-app-pub-TEST", ads_enabled: "true" },
  };
}

function mockASO(appName, niche) {
  return {
    title: `${appName}: Daily Habit Tracker`,
    shortDescription: "Build one habit. Change your life. Simple & clean.",
    description: `${appName} est l'app de suivi d'habitudes la plus minimaliste du Play Store.\n\n✅ Interface ultra-clean\n✅ Streak counter\n✅ Notifications intelligentes\n✅ Stats visuelles\n✅ Dark mode inclus\n\nTéléchargez gratuitement et commencez à changer votre vie aujourd'hui.`,
    keywords: ["habit tracker", "daily routine", "streak counter", "productivity", "self improvement", "routine builder", "habit builder", "goal tracker", "daily habits", "habit log", "routine tracker", "habit app", "self discipline"],
    whatsNew: "Version 1.0 — Lancement officiel !",
  };
}

function mockCompliance(appName, packageId) {
  return {
    policyUrl: `https://yourname.github.io/${packageId}-privacy`,
    policy: { html: `<html><body><h1>Privacy Policy — ${appName}</h1><p>We use AdMob and Firebase.</p></body></html>` },
    dataSafety: { dataTypes: [{ type: "Device ID", collected: true, shared: true, purpose: "Advertising" }] },
  };
}

function mockLogo(appName) {
  return {
    logoUrl: `https://via.placeholder.com/1024/7C3AED/FFFFFF?text=${encodeURIComponent(appName[0])}`,
    formats: { "1024": "placeholder", "512": "placeholder", "192": "placeholder", "48": "placeholder" },
  };
}

module.exports = {
  analyzeNiche,
  generateArchitecture,
  generateLogoPrompt,
  generateFlutterCode,
  generateAppPreviewHTML,
  generateASO,
  generatePrivacyPolicy,
  generateDataSafety,
  mockArchitect,
  mockCodeGen,
  mockASO,
  mockCompliance,
  mockLogo,
};
