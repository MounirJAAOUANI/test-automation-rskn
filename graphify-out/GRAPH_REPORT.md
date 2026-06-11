# Graph Report - .  (2026-06-11)

## Corpus Check
- 94 files · ~87,093 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 312 nodes · 325 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_README deployment troubleshooting|README deployment troubleshooting]]
- [[_COMMUNITY_Root package metadata|Root package metadata]]
- [[_COMMUNITY_GitHub poller and job queue|GitHub poller and job queue]]
- [[_COMMUNITY_Server package dependencies|Server package dependencies]]
- [[_COMMUNITY_Client package dependencies|Client package dependencies]]
- [[_COMMUNITY_App tsconfig compiler options|App tsconfig compiler options]]
- [[_COMMUNITY_AI prompt generation routines|AI prompt generation routines]]
- [[_COMMUNITY_Node tsconfig compiler options|Node tsconfig compiler options]]
- [[_COMMUNITY_Dev build tooling|Dev build tooling]]
- [[_COMMUNITY_GitHubOpenAI integration|GitHub/OpenAI integration]]
- [[_COMMUNITY_Client UI config components|Client UI config components]]
- [[_COMMUNITY_Env vars and secrets|Env vars and secrets]]
- [[_COMMUNITY_Base tsconfig strict settings|Base tsconfig strict settings]]
- [[_COMMUNITY_Play Store upload|Play Store upload]]
- [[_COMMUNITY_Flutter app UI|Flutter app UI]]
- [[_COMMUNITY_Privacy policy generation|Privacy policy generation]]
- [[_COMMUNITY_Prerequisite panel|Prerequisite panel]]
- [[_COMMUNITY_Firebase admin setup|Firebase admin setup]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 17 edges
2. `compilerOptions` - 16 edges
3. `📱 App Factory — Autopilot Pipeline` - 12 edges
4. `🔍 Dépannage {#dépannage}` - 8 edges
5. `compilerOptions` - 7 edges
6. `Variables du serveur (`server/.env`)` - 7 edges
7. `ask()` - 6 edges
8. `askJSON()` - 6 edges
9. `fetch` - 6 edges
10. `Variables du client (`client/.env.local`)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `generateLogo()` --calls--> `fetch`  [INFERRED]
  server/lib/openai.js → server/lib/github.js
- `initRedis()` --calls--> `startGitHubPoller()`  [EXTRACTED]
  server/lib/jobQueue.js → server/lib/github-poller.js

## Import Cycles
- None detected.

## Communities (24 total, 4 thin omitted)

### Community 0 - "README deployment troubleshooting"
Cohesion: 0.06
Nodes (31): 📱 App Factory — Autopilot Pipeline, "Cannot read private_key", Comptes à créer (pour le mode production), 🔍 Dépannage {#dépannage}, ☁️ Déploiement sur Railway {#railway}, Erreur CORS, ⚙️ Installation locale {#installation}, 🚀 Lancer l'application en développement {#développement} (+23 more)

### Community 1 - "Root package metadata"
Cohesion: 0.06
Nodes (31): author, bugs, url, dependencies, cors, dotenv, express, firebase-admin (+23 more)

### Community 2 - "GitHub poller and job queue"
Cohesion: 0.09
Nodes (25): activePollers, getActivePollers(), githubLib, startGitHubPoller(), createJob(), fs, getAllJobKeys(), getAllJobs() (+17 more)

### Community 3 - "Server package dependencies"
Cohesion: 0.07
Nodes (27): dependencies, adm-zip, @anthropic-ai/sdk, cors, dotenv, express, firebase-admin, google-play-scraper (+19 more)

### Community 4 - "Client package dependencies"
Cohesion: 0.11
Nodes (18): dependencies, react, react-dom, serve, devDependencies, vite, @vitejs/plugin-react, engines (+10 more)

### Community 5 - "App tsconfig compiler options"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 6 - "AI prompt generation routines"
Cohesion: 0.17
Nodes (12): analyzeNiche(), Anthropic, ask(), askJSON(), client, generateAppPreviewHTML(), generateArchitecture(), generateASO() (+4 more)

### Community 7 - "Node tsconfig compiler options"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 8 - "Dev build tooling"
Cohesion: 0.12
Nodes (17): devDependencies, @babel/core, babel-plugin-react-compiler, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+9 more)

### Community 9 - "GitHub/OpenAI integration"
Cohesion: 0.20
Nodes (12): downloadArtifact(), fetch, getWorkflowStatus(), ghHeaders(), publishPrivacyPolicy(), triggerBuild(), VERCEL_PROJECT_URL, client (+4 more)

### Community 10 - "Client UI config components"
Cohesion: 0.15
Nodes (4): TYPE_COLORS, STATUS_CONFIG, ENV, STEPS

### Community 11 - "Env vars and secrets"
Cohesion: 0.14
Nodes (14): `ANTHROPIC_API_KEY`, 🔑 Configuration des variables d'environnement {#variables}, `FIREBASE_SERVICE_ACCOUNT` — Comment récupérer le JSON GCP, `GOOGLE_PLAY_SERVICE_ACCOUNT` — Même procédure, `MODE_ENV`, `MOT_DEBUG`, `OPENAI_API_KEY`, Variables du client (`client/.env.local`) (+6 more)

### Community 13 - "Base tsconfig strict settings"
Cohesion: 0.20
Nodes (9): compilerOptions, noImplicitAny, noUnusedLocals, noUnusedParameters, skipLibCheck, strict, strictNullChecks, files (+1 more)

### Community 15 - "Flutter app UI"
Cohesion: 0.33
Nodes (6): build, HomePage, main, MyApp, package:flutter/material.dart, StatelessWidget

## Knowledge Gaps
- **184 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+179 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `📱 App Factory — Autopilot Pipeline` connect `README deployment troubleshooting` to `Env vars and secrets`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Dev build tooling` to `Root package metadata`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `🔑 Configuration des variables d'environnement {#variables}` connect `Env vars and secrets` to `README deployment troubleshooting`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _184 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `README deployment troubleshooting` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `Root package metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `GitHub poller and job queue` be split into smaller, more focused modules?**
  _Cohesion score 0.09032258064516129 - nodes in this community are weakly interconnected._