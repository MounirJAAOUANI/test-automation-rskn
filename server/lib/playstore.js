"use strict";
const gplay = require("google-play-scraper");

/**
 * Recherche les top N apps pour un terme.
 * Retourne un tableau d'apps normalisées.
 */
async function search(term, num = 50) {
  const results = await gplay.search({
    term,
    num,
    lang:       "en",
    country:    "us",
    fullDetail: false,
    throttle:   1,          // 1 req/sec — évite blocage IP
  });

  return results.map((a) => ({
    title:     a.title,
    appId:     a.appId,
    developer: a.developer,
    score:     parseFloat(a.score) || 0,
    ratings:   a.ratings  || 0,
    installs:  a.installs || "N/A",
    free:      a.free,
    summary:   a.summary || "",
  }));
}

/**
 * Récupère les détails complets d'une app spécifique.
 */
async function getAppDetails(appId) {
  return gplay.app({ appId, lang: "en", country: "us" });
}

/**
 * Analyse statistique d'un tableau d'apps.
 */
function analyze(apps) {
  if (!apps.length) return { saturationLevel: "UNKNOWN", avgScore: 0, appsAbove1M: 0 };

  const above1M = apps.filter((a) => {
    const n = parseInt((a.installs || "0").replace(/[^0-9]/g, ""), 10);
    return n >= 1_000_000;
  }).length;

  const avgScore = (
    apps.reduce((sum, a) => sum + (a.score || 0), 0) / apps.length
  ).toFixed(2);

  const saturationLevel =
    above1M > 15 ? "VERY_HIGH" :
    above1M > 8  ? "HIGH" :
    above1M > 3  ? "MEDIUM" : "LOW";

  return { saturationLevel, avgScore: parseFloat(avgScore), appsAbove1M: above1M };
}

/**
 * Mock data pour mode dev.
 */
function mockData(niche) {
  return {
    niche,
    topCompetitors: [
      { rank: 1, name: "Habitica", developer: "HabitRPG Inc", score: 4.7, installs: "5M+", ratings: 127543, isFree: true, mainFeature: "Gamification RPG" },
      { rank: 2, name: "Productive - Habits & Goals", developer: "Apalon Apps", score: 4.6, installs: "1M+", ratings: 98234, isFree: true, mainFeature: "Streaks + Stats visuelles" },
      { rank: 3, name: "Done - Daily Habits Tracker", developer: "Sash Zaitsev", score: 4.8, installs: "500K+", ratings: 45123, isFree: false, mainFeature: "UI minimaliste épurée" },
      { rank: 4, name: "Streaks", developer: "Crunchy Bagel", score: 4.5, installs: "500K+", ratings: 34567, isFree: false, mainFeature: "12 habits maximum" },
      { rank: 5, name: "HabitNow - Daily Routine", developer: "RushedApps", score: 4.4, installs: "100K+", ratings: 12345, isFree: true, mainFeature: "Widget + Simple" },
    ],
    analysis: {
      saturationLevel: "MEDIUM",
      avgScore: 4.40,
      appsAbove1M: 2,
      recommendation: "GO — niche viable, focus différenciation UX minimaliste",
      nicheGap: "Aucune app ultra-minimaliste one-habit avec widget moderne",
      suggestedDifferentiator: "Focus sur UNE seule habitude à la fois — pas de liste, pas de gamification",
    },
  };
}

module.exports = { search, getAppDetails, analyze, mockData };
