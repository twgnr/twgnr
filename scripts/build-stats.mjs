#!/usr/bin/env node
/**
 * Builds assets/stats.svg and assets/top-langs.svg from the GitHub API.
 *
 * The public github-readme-stats instance went dark (503 DEPLOYMENT_PAUSED),
 * which is what a free third-party image service does sooner or later. These
 * cards are files in this repo instead: a scheduled workflow refreshes them,
 * and a file cannot 503.
 *
 *   node scripts/build-stats.mjs                 # real data, needs GH_TOKEN
 *   node scripts/build-stats.mjs --placeholder   # no numbers, no API call
 *   node scripts/build-stats.mjs --demo --out D  # sample numbers, for eyeballing
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);

const LOGIN = process.env.GH_LOGIN || "twgnr";
const TOKEN = process.env.GH_TOKEN;
const OUT = opt("--out", "assets");

// ---- design tokens, lifted from header.svg / the twgnr.de palette ----------
const C = {
  panel: "#0A101D",
  line: "#94B4DC",
  text: "#FFFFFF",
  muted: "#9AA4B2",
  accent: "#47C2FF",
  indigo: "#7D8CFF",
  pink: "#FF4D9D",
};
const MONO = "ui-monospace, Consolas, 'DejaVu Sans Mono', monospace";
const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";
const W = 410;
const H = 200;
const PAD = 20;

const ENT = { "<": "&lt;", ">": "&gt;", "&": "&amp;" };
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ENT[c]);
const fmt = (n) =>
  n >= 10000 ? (n / 1000).toFixed(0) + "k" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);

/** Ramp accent -> indigo -> pink, so rank reads as a gradient rather than noise. */
function ramp(t) {
  const stops = [C.accent, C.indigo, C.pink].map((h) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  );
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Panel chrome shared by both cards: dark plate, faint grid, glows, bevel. */
function shell(id, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none" role="img" aria-label="${esc(title)}">
  <defs>
    <radialGradient id="${id}g1" cx="40" cy="0" r="330" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.20"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}g2" cx="${W}" cy="${H}" r="360" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${C.indigo}" stop-opacity="0.16"/><stop offset="1" stop-color="${C.indigo}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="${id}grid" width="36" height="36" patternUnits="userSpaceOnUse">
      <path d="M36 0 H0 V36" fill="none" stroke="${C.line}" stroke-width="1" stroke-opacity="0.12"/>
    </pattern>
    <clipPath id="${id}clip"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="13.5"/></clipPath>
  </defs>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="13.5" fill="${C.panel}" fill-opacity="0.94"/>
  <g clip-path="url(#${id}clip)">
    <rect width="${W}" height="${H}" fill="url(#${id}g1)"/>
    <rect width="${W}" height="${H}" fill="url(#${id}grid)"/>
    <rect width="${W}" height="${H}" fill="url(#${id}g2)"/>
    <rect width="${W}" height="1.5" fill="${C.text}" opacity="0.10"/>
  </g>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="13.5" stroke="${C.line}" stroke-opacity="0.28"/>

  <circle cx="${PAD + 4}" cy="28" r="3.4" fill="${C.accent}">
    <animate attributeName="opacity" values="0.5;1;0.5" dur="3.6s" repeatCount="indefinite"/>
  </circle>
  <text x="${PAD + 16}" y="32" fill="${C.accent}" font-size="10" font-weight="600" letter-spacing="2.4" font-family="${MONO}">${esc(title)}</text>

${body}
</svg>
`;
}

function statsCard(s, stamp) {
  const tiles = [
    ["Commits (12 mo)", s.commits],
    ["Repositories", s.repos],
    ["Stars earned", s.stars],
    ["Pull requests", s.prs],
    ["Issues", s.issues],
    ["Followers", s.followers],
  ];
  const colW = (W - PAD * 2 - 20) / 3;
  const body = tiles
    .map(([label, value], i) => {
      const x = Math.round(PAD + (i % 3) * (colW + 10));
      const y = i < 3 ? 0 : 56;
      const v = value === null ? "—" : fmt(value);
      return `  <text x="${x}" y="${86 + y}" fill="${ramp(i / 5)}" font-size="23" font-weight="700" font-family="${SANS}">${v}</text>
  <text x="${x}" y="${102 + y}" fill="${C.muted}" font-size="8.5" letter-spacing="1.5" font-family="${MONO}">${esc(label.toUpperCase())}</text>`;
    })
    .join("\n");
  const foot = `  <text x="${PAD}" y="${H - 16}" fill="${C.muted}" font-size="8" letter-spacing="1.4" opacity="0.75" font-family="${MONO}">${esc(stamp)}</text>`;
  return shell("st", "GITHUB / " + LOGIN.toUpperCase(), body + "\n" + foot);
}

function langsCard(langs) {
  const rows = langs.length ? langs : [["Awaiting first build", 0]];
  const body = rows
    .slice(0, 6)
    .map(([name, pct], i) => {
      const y = 54 + i * 23;
      const barW = Math.max(2, Math.round((W - PAD * 2) * (pct / 100)));
      const label = pct ? pct.toFixed(1) + "%" : "—";
      return `  <text x="${PAD}" y="${y}" fill="${C.text}" fill-opacity="0.92" font-size="10.5" font-family="${MONO}">${esc(name)}</text>
  <text x="${W - PAD}" y="${y}" fill="${C.muted}" font-size="10" text-anchor="end" font-family="${MONO}">${label}</text>
  <rect x="${PAD}" y="${y + 6}" width="${W - PAD * 2}" height="3.5" rx="1.75" fill="${C.line}" fill-opacity="0.16"/>
  <rect x="${PAD}" y="${y + 6}" width="${barW}" height="3.5" rx="1.75" fill="${ramp(i / 5)}"/>`;
    })
    .join("\n");
  return shell("tl", "TOP LANGUAGES", body);
}

// ---- data ------------------------------------------------------------------
const QUERY = `query($login:String!,$after:String){
  user(login:$login){
    followers{totalCount}
    pullRequests{totalCount}
    issues{totalCount}
    contributionsCollection{totalCommitContributions restrictedContributionsCount}
    repositories(first:100,after:$after,ownerAffiliations:OWNER,isFork:false){
      totalCount
      pageInfo{hasNextPage endCursor}
      nodes{ isPrivate stargazerCount languages(first:12,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}} }
    }
  }
}`;

async function fetchStats() {
  if (!TOKEN) throw new Error("GH_TOKEN is not set");
  let after = null;
  let stars = 0;
  let repos = 0;
  let privateSeen = 0;
  let head = null;
  const bytes = new Map();

  for (;;) {
    const r = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: "bearer " + TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { login: LOGIN, after } }),
    });
    if (!r.ok) throw new Error(`GitHub API ${r.status}: ${await r.text()}`);
    const j = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors));

    const u = j.data.user;
    if (!head) head = u;
    repos = u.repositories.totalCount;
    for (const n of u.repositories.nodes) {
      stars += n.stargazerCount;
      if (n.isPrivate) privateSeen++;
      for (const e of n.languages.edges) {
        bytes.set(e.node.name, (bytes.get(e.node.name) || 0) + e.size);
      }
    }
    if (!u.repositories.pageInfo.hasNextPage) break;
    after = u.repositories.pageInfo.endCursor;
  }

  // A token that cannot see private repositories still returns a perfectly
  // plausible-looking card — just one built from a fraction of the work. Say so
  // loudly rather than letting a wrong picture ship quietly.
  console.log(`counted ${repos} repositories (${privateSeen} private, ${repos - privateSeen} public), forks excluded`);
  if (privateSeen === 0) {
    console.log(
      "::warning title=Stats cover public repositories only::" +
        "No private repository was visible to this token, so private repos, their languages " +
        "and private commits are missing from the cards. Add a classic PAT with the `repo` " +
        "scope as the STATS_TOKEN secret to include them."
    );
  }

  const total = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
  const langs = [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([n, v]) => [n, (v / total) * 100]);

  const cc = head.contributionsCollection;
  return {
    s: {
      commits: cc.totalCommitContributions + cc.restrictedContributionsCount,
      repos,
      stars,
      prs: head.pullRequests.totalCount,
      issues: head.issues.totalCount,
      followers: head.followers.totalCount,
    },
    langs,
  };
}

const DEMO = {
  s: { commits: 1284, repos: 44, stars: 97, prs: 63, issues: 21, followers: 18 },
  langs: [
    ["Python", 31.4],
    ["C++", 24.8],
    ["TypeScript", 18.2],
    ["PL/SQL", 9.6],
    ["C#", 8.1],
    ["JavaScript", 7.9],
  ],
};
const EMPTY = {
  s: { commits: null, repos: null, stars: null, prs: null, issues: null, followers: null },
  langs: [],
};

const data = has("--placeholder") ? EMPTY : has("--demo") ? DEMO : await fetchStats();
const stamp = has("--placeholder")
  ? "AWAITING FIRST BUILD"
  : "UPDATED " + new Date().toISOString().slice(0, 10);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "stats.svg"), statsCard(data.s, stamp));
writeFileSync(join(OUT, "top-langs.svg"), langsCard(data.langs));
console.log(`wrote stats.svg + top-langs.svg to ${OUT}  (${stamp})`);
