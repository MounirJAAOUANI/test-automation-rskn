# 📱 App Factory — Autopilot Pipeline

Pipeline automatisée de création d'apps mobiles Flutter.  
**Idée → App en brouillon sur Play Console en 18-27 minutes.**

---

## 📋 Table des matières

1. [Structure du projet](#structure)
2. [Prérequis techniques](#prérequis)
3. [Installation locale](#installation)
4. [Configuration des variables d'environnement](#variables)
5. [Lancer l'application en développement](#développement)
6. [Déploiement sur Railway](#railway)
7. [Les 8 étapes de la pipeline](#pipeline)
8. [Variables Railway en production](#railway-vars)
9. [Dépannage](#dépannage)

---

## 📁 Structure du projet {#structure}

```
app-factory/
├── client/                          # Frontend React (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── PasswordModal.jsx    # Popup mot de passe
│   │   │   ├── PrereqPanel.jsx      # Panneau pré-requis
│   │   │   ├── StepCard.jsx         # Encart de chaque étape
│   │   │   └── LogTerminal.jsx      # Terminal de logs SSE
│   │   ├── steps/
│   │   │   └── index.js             # Builders de payload pour chaque étape
│   │   ├── App.jsx                  # Orchestrateur principal
│   │   ├── api.js                   # Appels fetch → serveur (SSE)
│   │   ├── config.js                # Variables d'env + définitions des étapes
│   │   └── main.jsx                 # Point d'entrée React
│   ├── index.html
│   ├── vite.config.js               # Proxy /api → localhost:4000
│   ├── package.json
│   └── .env.example                 # Template variables client
│
├── server/                          # Backend Node.js Express
│   ├── lib/
│   │   ├── claude.js                # Tous les appels Anthropic Claude API
│   │   ├── openai.js                # Tous les appels OpenAI (logo GPT Image)
│   │   ├── playstore.js             # google-play-scraper (market research)
│   │   ├── firebase.js              # Firebase Admin SDK (Remote Config)
│   │   └── github.js                # GitHub API (build, pages, Play Console)
│   ├── index.js                     # Express + CORS + routes SSE
│   ├── package.json
│   └── .env.example                 # Template variables serveur
│
├── .gitignore
└── README.md                        # Ce fichier
```

---

## 🔧 Prérequis techniques {#prérequis}

### Logiciels à installer sur ta machine

| Logiciel | Version minimum | Téléchargement |
|---|---|---|
| **Node.js** | v18.0+ | https://nodejs.org (LTS recommandé) |
| **npm** | v9.0+ | Inclus avec Node.js |
| **Git** | v2.0+ | https://git-scm.com |
| **VS Code** | Toute version | https://code.visualstudio.com |

Vérification :
```bash
node --version    # doit afficher v18.x.x ou supérieur
npm --version     # doit afficher 9.x.x ou supérieur
git --version     # doit afficher git version 2.x.x
```

### Comptes à créer (pour le mode production)

| Service | Usage | Coût |
|---|---|---|
| **console.anthropic.com** | Claude API — génération code, ASO, analyse | $5 crédit minimum |
| **platform.openai.com** | GPT Image — logo IA | $5 crédit minimum |
| **console.firebase.google.com** | Remote Config AdMob | GRATUIT |
| **play.google.com/console** | Publication Play Store | $25 one-time |
| **github.com** | CI/CD build Flutter | GRATUIT |
| **railway.app** | Hébergement serveur | $5/mois (Hobby) |

---

## ⚙️ Installation locale {#installation}

### Étape 1 — Cloner ou créer le projet dans VS Code

**Option A — Nouveau projet dans VS Code :**
1. Ouvre VS Code
2. `Ctrl+Shift+P` → "Open Folder" → sélectionne un dossier vide
3. Ouvre le terminal intégré : `Ctrl+`` (backtick)`
4. Copie tous les fichiers du projet dans ce dossier en respectant la structure ci-dessus

**Option B — Depuis GitHub :**
```bash
git clone https://github.com/tonusername/app-factory.git
cd app-factory
code .
```

### Étape 2 — Installer les dépendances du serveur

```bash
# Dans le terminal VS Code
cd server
npm install
```

Ce que `npm install` installe automatiquement (depuis `server/package.json`) :
- `express` — framework web HTTP
- `cors` — middleware pour autoriser les requêtes cross-origin
- `dotenv` — lecture du fichier .env
- `@anthropic-ai/sdk` — SDK officiel Claude API
- `openai` — SDK officiel OpenAI API
- `google-play-scraper` — scraping Play Store (gratuit, sans clé)
- `firebase-admin` — SDK Firebase Admin
- `googleapis` — API Google (Play Console)
- `sharp` — redimensionnement d'images (logo)
- `node-fetch` — fetch HTTP côté Node.js
- `nodemon` — rechargement auto en développement

### Étape 3 — Installer les dépendances du client

```bash
# Revenir à la racine puis aller dans client
cd ../client
npm install
```

Ce que `npm install` installe :
- `react` + `react-dom` — framework UI
- `vite` — bundler rapide
- `@vitejs/plugin-react` — support JSX

### Étape 4 — Configurer les variables d'environnement

```bash
# Dans le dossier server/
cp .env.example .env
# Ouvre server/.env dans VS Code et remplis les valeurs

# Dans le dossier client/
cp .env.example .env.local
# Ouvre client/.env.local dans VS Code et remplis les valeurs
```

---

## 🔑 Configuration des variables d'environnement {#variables}

### Variables du serveur (`server/.env`)

#### `MODE_ENV`
- `development` → données simulées, aucun appel API réel
- `production` → vrais appels Claude, OpenAI, Play Console

#### `MOT_DEBUG`
- `true` → les erreurs complètes (stack trace) apparaissent dans l'interface
- `false` → seul le message d'erreur simplifié est affiché

#### `ANTHROPIC_API_KEY`
1. Va sur https://console.anthropic.com/account/keys
2. Crée une clé → copie la valeur `sk-ant-api03-...`
3. Ajoute dans `.env` : `ANTHROPIC_API_KEY=sk-ant-api03-XXXX`

#### `OPENAI_API_KEY`
1. Va sur https://platform.openai.com/api-keys
2. Crée une clé → copie la valeur `sk-proj-...`
3. Ajoute dans `.env` : `OPENAI_API_KEY=sk-proj-XXXX`

#### `FIREBASE_SERVICE_ACCOUNT` — Comment récupérer le JSON GCP

Le fichier JSON Firebase ressemble à ceci quand tu le télécharges :
```json
{
  "type": "service_account",
  "project_id": "mon-projet-firebase",
  "private_key_id": "abc123def456",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkq...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xyz@mon-projet-firebase.iam.gserviceaccount.com",
  "client_id": "123456789012345678",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/...",
  "universe_domain": "googleapis.com"
}
```

**Pour le minifier sur une seule ligne** (obligatoire pour variable d'env) :
```bash
# Dans le terminal, dans le dossier où est le fichier JSON téléchargé :
node -e "console.log(JSON.stringify(require('./firebase-key.json')))"
# Copie l'output (tout sur 1 ligne) et colle dans .env
```

Résultat attendu dans `.env` :
```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"mon-projet",...}
```

#### `GOOGLE_PLAY_SERVICE_ACCOUNT` — Même procédure

Même chose que Firebase — télécharge le JSON depuis Google Cloud Console, minifie-le, colle dans `.env`.

> ⚠️ **Important** : dans le JSON, le `private_key` contient des `\n` littéraux.  
> Garde-les tels quels. Ne les remplace pas par de vrais retours à la ligne.

### Variables du client (`client/.env.local`)

#### `VITE_MODE_ENV`
- `development` → interface affiche données factices, mot de passe non requis
- `production` → interface exige le mot de passe, fait de vrais appels au serveur

#### `VITE_TRUE_PASSWORD`
Le mot de passe correct à entrer dans la popup. Exemple : `launch2026`

#### `VITE_FILLED_PASSWORD`
Si cette variable est égale à `VITE_TRUE_PASSWORD`, la popup est bypassée automatiquement.  
Utilise ça sur ta machine personnelle pour ne pas entrer le mot de passe à chaque fois.

#### `VITE_SHOW_STEPS`
- `true` → affiche les boutons "Exécuter" sur chaque étape (mode step-by-step)
- `false` → affiche uniquement le gros bouton "Lancer la pipeline complète"

#### `VITE_MOT_DEBUG`
- `true` → affiche les erreurs complètes (stack traces) dans les encarts d'étapes
- `false` → affiche uniquement le message d'erreur simplifié

---

## 🚀 Lancer l'application en développement {#développement}

Tu as besoin de **deux terminaux** dans VS Code.

### Terminal 1 — Démarrer le serveur

```bash
cd server
npm run dev
# ou : npm start
```

Tu dois voir :
```
✅ App Factory Server — port 4000 — mode: development — debug: false
```

Le serveur écoute sur http://localhost:4000

### Terminal 2 — Démarrer le client

```bash
cd client
npm run dev
```

Tu dois voir quelque chose comme :
```
  VITE v5.3.1  ready in 312 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Ouvre http://localhost:5173 dans ton navigateur.

### Vérification

Dans l'interface tu dois voir :
- `✅ Serveur connecté — mode: développement` en haut de la page
- Le panneau "Pré-requis & Configuration" dépliable
- Le champ de saisie de l'idée
- Les 8 étapes de la pipeline

En mode développement, toutes les étapes retournent des données simulées.  
Clique sur "Lancer la pipeline complète" pour voir la simulation.

---

## ☁️ Déploiement sur Railway {#railway}

### Option A — Deux services séparés (recommandé)

**Service 1 — Backend (server/)**
1. Dans Railway : New Project → Deploy from GitHub repo
2. Sélectionne ton repo → configure Root Directory : `server`
3. Ajoute toutes les variables de `server/.env` dans Railway Variables
4. Railway détecte `package.json` et lance `npm start` automatiquement

**Service 2 — Frontend (client/)**
1. Dans Railway : New Service → Deploy from GitHub repo
2. Même repo → Root Directory : `client`
3. Build Command : `npm run build`
4. Start Command : `npx serve dist -p $PORT`
5. Ajoute toutes les variables de `client/.env.local` dans Railway Variables
6. Ajoute `VITE_MODE_ENV=production`

**Lier les deux services :**
- Après déploiement du backend, copie son URL (ex: `https://app-factory-server.up.railway.app`)
- Dans les variables du backend : `FRONTEND_URL=https://app-factory-client.up.railway.app`
- Dans les variables du client : l'URL du serveur est utilisée via le proxy Vite en dev uniquement. En production, le client fait des appels directs.

> ⚠️ En production, mets à jour `api.js` : remplace `const BASE = "/api"` par  
> `const BASE = import.meta.env.VITE_API_URL || "/api"` et ajoute  
> `VITE_API_URL=https://ton-server.up.railway.app/api` dans les variables Railway du client.

### Option B — Service unique (plus simple)

Dans `server/index.js`, le serveur sert déjà les fichiers statiques si `IS_PROD`.

1. Build le client d'abord : `cd client && npm run build`
2. Les fichiers sont dans `client/dist/`
3. Dans Railway : Root Directory = racine du projet
4. Start Command : `cd server && npm start`
5. Le serveur sert le frontend sur `/` et les APIs sur `/api/*`

---

## 🔄 Les 8 étapes de la pipeline {#pipeline}

| # | Étape | Ce qu'elle fait | Coût | Temps |
|---|---|---|---|---|
| 01 | Market Scout | Scrape Play Store, analyse 50 apps concurrentes, GO/NO-GO | GRATUIT | 2-3 min |
| 02 | App Architect | Génère nom, package ID, thème, écrans via Claude | ~$0.012 | 1-2 min |
| 03 | Logo Generator | Logo IA via GPT Image, 4 formats PNG | $0.011 | 2-3 min |
| 04 | Flutter Code Gen | Code Flutter complet + Firebase Remote Config | ~$0.025 | 3-4 min |
| 05 | Screenshots Creator | 5 captures Puppeteer + device frame Pixel 9 | GRATUIT | 3-5 min |
| 06 | ASO Optimizer | Titre 30c, description 4000c SEO, 13 keywords | ~$0.015 | 1-2 min |
| 07 | Compliance Builder | Privacy Policy RGPD + Data Safety + UMP | ~$0.010 | 1-2 min |
| 08 | Build & Deploy | Build AAB, upload Play Console brouillon | GRATUIT | 4-6 min |

**Coût total par app : ~$0.073**

---

## 🏗️ Variables Railway en production {#railway-vars}

### Service Backend (server/)

```
PORT=4000
MODE_ENV=production
MOT_DEBUG=false
FRONTEND_URL=https://ton-frontend.up.railway.app
ANTHROPIC_API_KEY=sk-ant-api03-XXXX
OPENAI_API_KEY=sk-proj-XXXX
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
GOOGLE_PLAY_SERVICE_ACCOUNT={"type":"service_account",...}
GOOGLE_PLAY_DEVELOPER_ID=XXXXXXXXXXXX
GITHUB_TOKEN=ghp_XXXX
GITHUB_OWNER=tonusername
GITHUB_REPO=app-factory-flutter
```

### Service Frontend (client/)

```
VITE_MODE_ENV=production
VITE_TRUE_PASSWORD=tonmotdepasse
VITE_FILLED_PASSWORD=
VITE_SHOW_STEPS=true
VITE_MOT_DEBUG=false
VITE_API_URL=https://ton-backend.up.railway.app/api
```

---

## 🔍 Dépannage {#dépannage}

### Erreur CORS

**Cause :** Le frontend essaie d'appeler directement l'API Anthropic ou OpenAI depuis le navigateur.  
**Solution :** Ne jamais appeler ces APIs depuis le client. Tous les appels passent par `/api/*` → serveur Express.  
Vérifie que `api.js` utilise `fetch("/api/agents/...")` et non `fetch("https://api.anthropic.com/...")`.

### "Serveur inaccessible"

**Cause :** Le serveur Express n'est pas lancé.  
**Solution :** Lance `npm run dev` dans le dossier `server/`.  
Vérifie que le port 4000 est libre : `lsof -i :4000` (Mac/Linux).

### "Module not found: google-play-scraper"

```bash
cd server
npm install google-play-scraper
```

### "Cannot read private_key"

**Cause :** Le JSON Firebase/Google Play n'est pas valide dans la variable d'env.  
**Solution :** Vérifie que le JSON est sur **une seule ligne** et que les `\n` dans `private_key` sont des `\n` littéraux (backslash + n), pas de vrais retours à la ligne.

Pour vérifier :
```bash
# Dans server/
node -e "const s = process.env.FIREBASE_SERVICE_ACCOUNT; console.log(JSON.parse(s).project_id)"
```
Si ça affiche le project_id → JSON OK. Si ça plante → JSON mal formaté.

### Les logs SSE ne s'affichent pas

**Cause :** La mise en buffer nginx/Railway coupe le flux SSE.  
**Solution :** Le header `X-Accel-Buffering: no` est déjà envoyé par le serveur. Si Railway bloque encore, ajoute dans les headers Railway du service : `X-Accel-Buffering = no`.

### Étape "Screenshots" échoue avec "Puppeteer not found"

```bash
cd server
npm install puppeteer
```
Sur Railway, Puppeteer nécessite Chromium. Ajoute dans `server/package.json` :
```json
"scripts": {
  "postinstall": "node node_modules/puppeteer/install.mjs"
}
```

### Étape "Build & Deploy" échoue — pas de build GitHub Actions

**Cause :** Le repo GitHub `app-factory-flutter` n'existe pas ou n'a pas de workflow `build.yml`.  
**Solution :** Crée le repo et ajoute un fichier `.github/workflows/build.yml` avec :
```yaml
name: Build Flutter
on:
  workflow_dispatch:
    inputs:
      app_name:      { required: true, type: string }
      package_id:    { required: true, type: string }
      primary_color: { required: false, type: string, default: '#7C3AED' }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { flutter-version: '3.22.0' }
      - run: flutter pub get
      - run: flutter build appbundle --release
      - uses: actions/upload-artifact@v4
        with:
          name: app-release.aab
          path: build/app/outputs/bundle/release/app-release.aab
```

---

## 💡 Notes importantes

- **En mode `development`** : aucun vrai appel API n'est fait. Les données sont simulées. Idéal pour tester l'interface.
- **En mode `production`** : chaque pipeline coûte ~$0.073. Avec $10 de crédits, tu peux créer ~136 apps.
- **Firebase Remote Config** : les IDs AdMob sont configurés en mode TEST au premier lancement. Tu dois les remplacer par tes vrais IDs AdMob une fois l'app approuvée par Google.
- **Play Console brouillon** : l'app est uploadée en track "internal" avec status "draft". Google ne la soumet pas en review automatiquement — tu dois le faire manuellement.
- **RGPD** : la Privacy Policy générée est un template. Fais-la relire par un professionnel si tu opères en Europe.
