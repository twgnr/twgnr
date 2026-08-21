#!/usr/bin/env node
/**
 * Measures the language distribution across LOCAL clones, so the card can show
 * the real spread without handing a token to CI.
 *
 * It reads `git ls-files` per repo — the tracked files, exactly what GitHub
 * would see — never the working directory, so node_modules and build output
 * stay out on their own.
 *
 *   node scripts/local-langs.mjs                 # scans ../.. style root below
 *   node scripts/local-langs.mjs --root C:/Repo  # explicit root
 *   node scripts/local-langs.mjs --keep fdev     # un-exclude a repo
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const argv = process.argv.slice(2);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);

const ROOT = opt("--root", "C:/Repository");
const OWNER = opt("--owner", "twgnr"); // only repos under this account
const OUT = opt("--out", "data/local-langs.json");
// Commits only count as yours on GitHub if the author email is registered on
// your account. Listed here so the local count uses the same yardstick.
const ME = argv.filter((a, i) => argv[i - 1] === "--me");
const IDENTITIES = ME.length
  ? ME
  : ["rc-joop@hotmail.de", "tobias.wagner@promata.de", "tobiaswagner9988@gmail.com", "49766516+twgnr@users.noreply.github.com"];
const KEEP = argv.filter((a, i) => argv[i - 1] === "--keep");
/**
 * Repositories that exist on GitHub but are not cloned here, so the scan cannot
 * see them. Asserted by the account owner, not measured — it only feeds the
 * repository tally, never the language measurement. A token would make this
 * unnecessary, because the API reports the true total itself.
 */
const NOT_CLONED = Number(opt("--not-cloned", "0")) || 0;

/**
 * Schema dumps and exports: thousands of generated DDL files that would bury
 * every hand-written language. Linguist would count them; a portrait of what
 * someone actually writes should not.
 */
const EXCLUDE = new Set(["fdev", "fdev_training"].filter((r) => !KEEP.includes(r)));

/**
 * Third-party code that ships inside the repo. Linguist skips these via its
 * vendor rules; counting them would credit jQuery's authors to this profile.
 * Deliberately narrow — `lib/` and `src/` are usually the author's own.
 */
const VENDOR =
  /(^|\/)(node_modules|bower_components|vendor|third_party|dist|coverage)\//i;
const MINIFIED = /[.-]min\.(js|css)$/i;

// Linguist drops data and prose from the language bar — mirror that.
const SKIP_EXT = new Set([
  "json", "yml", "yaml", "xml", "csv", "tsv", "md", "markdown", "txt", "rst",
  "lock", "svg", "png", "jpg", "jpeg", "gif", "ico", "webp", "pdf", "zip",
  "woff", "woff2", "ttf", "eot", "mp3", "wav", "flac", "map", "min",
]);

const LANG = {
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript",
  py: "Python", pyw: "Python",
  cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++", hh: "C++",
  c: "C",
  cs: "C#", java: "Java",
  sql: "PL/SQL", pks: "PL/SQL", pkb: "PL/SQL", prc: "PL/SQL", fnc: "PL/SQL", trg: "PL/SQL",
  html: "HTML", htm: "HTML", ejs: "HTML", hbs: "HTML",
  css: "CSS", scss: "SCSS", less: "Less",
  vb: "Visual Basic .NET", pas: "Pascal", dpr: "Pascal", dfm: "Pascal",
  pl: "Perl", pm: "Perl",
  sh: "Shell", bash: "Shell", ps1: "PowerShell", bat: "Batchfile", cmd: "Batchfile",
  rb: "Ruby", go: "Go", rs: "Rust", php: "PHP", lua: "Lua", r: "R",
  swift: "Swift", kt: "Kotlin", m: "Objective-C", mm: "Objective-C",
  qml: "QML", ui: "Qt", pro: "QMake", cmake: "CMake",
  vue: "Vue", svelte: "Svelte", astro: "Astro",
};

const git = (dir, args) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });

// ---- collect candidate repos, newest clone wins per remote -----------------
const byRemote = new Map();
const discovered = new Set();
for (const name of readdirSync(ROOT)) {
  const dir = join(ROOT, name);
  if (!existsSync(join(dir, ".git"))) continue;

  let url, when;
  try {
    url = git(dir, ["config", "--get", "remote.origin.url"]).trim();
    when = Number(git(dir, ["log", "-1", "--format=%ct"]).trim());
  } catch {
    continue;
  }
  if (!url) continue;

  const slug = url.replace(/\.git$/, "").split("/").slice(-2).join("/");
  if (!slug.toLowerCase().startsWith(OWNER.toLowerCase() + "/")) continue; // skip org repos
  discovered.add(slug);
  if (EXCLUDE.has(slug.split("/")[1])) continue;

  const prev = byRemote.get(slug);
  if (!prev || when > prev.when) byRemote.set(slug, { dir, when, slug });
}

// ---- count tracked bytes per language --------------------------------------
const totals = new Map();
const perRepo = [];
let vendored = 0;
let commits = 0;
let prs = 0;
const authors = new Map();

for (const { dir, slug } of [...byRemote.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
  let files;
  try {
    files = git(dir, ["ls-files", "-z"]).split("\0").filter(Boolean);
  } catch {
    continue;
  }

  // `.h` is C or C++ depending on what else lives in the repo
  const hLang = files.some((f) => /\.(cpp|cc|cxx|hpp)$/i.test(f)) ? "C++" : "C";
  const repoTotals = new Map();

  for (const f of files) {
    if (VENDOR.test(f) || MINIFIED.test(f)) {
      vendored++;
      continue;
    }
    const ext = (f.split(".").pop() || "").toLowerCase();
    if (ext === f.toLowerCase() || SKIP_EXT.has(ext)) continue;
    const lang = ext === "h" ? hLang : LANG[ext];
    if (!lang) continue;
    let size;
    try {
      size = statSync(join(dir, f)).size;
    } catch {
      continue; // tracked but not checked out
    }
    repoTotals.set(lang, (repoTotals.get(lang) || 0) + size);
    totals.set(lang, (totals.get(lang) || 0) + size);
  }

  try {
    for (const e of git(dir, ["log", "--since=12 months ago", "--format=%ae"]).split(/\r?\n/)) {
      const mail = e.trim().toLowerCase();
      if (!mail) continue;
      authors.set(mail, (authors.get(mail) || 0) + 1);
      if (IDENTITIES.some((id) => id.toLowerCase() === mail)) commits++;
    }
  } catch {
    /* empty history */
  }

  // Merged pull requests leave their number in the subject line, both for merge
  // commits and for squash merges. Distinct numbers per repo is a measured
  // floor: PRs closed without merging leave no trace and are simply not counted.
  try {
    const subjects = git(dir, ["log", "--format=%s"]);
    const seen = new Set();
    for (const m of subjects.matchAll(/(?:Merge pull request #(\d+)|\(#(\d+)\)\s*$)/gm)) {
      seen.add(m[1] || m[2]);
    }
    prs += seen.size;
  } catch {
    /* empty history */
  }

  const bytes = [...repoTotals.values()].reduce((a, b) => a + b, 0);
  const top = [...repoTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  perRepo.push({ repo: slug, bytes, top: top ? top[0] : null });
  console.log(`  ${slug.padEnd(38)} ${String(Math.round(bytes / 1024) + " KB").padStart(10)}  ${top ? top[0] : "-"}`);
}

const grand = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
const languages = Object.fromEntries([...totals.entries()].sort((a, b) => b[1] - a[1]));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      scannedAt: new Date().toISOString().slice(0, 10),
      owner: OWNER,
      repos: discovered.size + NOT_CLONED,
      reposCloned: discovered.size,
      reposNotCloned: NOT_CLONED,
      reposScanned: perRepo.length,
      excluded: [...EXCLUDE],
      totalBytes: grand,
      vendoredFilesSkipped: vendored,
      commits12mo: commits,
      mergedPullRequests: prs,
      identities: IDENTITIES,
      authorsSeen: Object.fromEntries([...authors.entries()].sort((a, b) => b[1] - a[1])),
      languages,
      perRepo,
    },
    null,
    2
  ) + "\n"
);

console.log(`\n${perRepo.length} repositories, ${Math.round(grand / 1024)} KB of code`);
for (const [l, b] of Object.entries(languages).slice(0, 8)) {
  console.log(`  ${l.padEnd(20)} ${((b / grand) * 100).toFixed(1)}%`);
}
console.log(`\nwrote ${OUT}`);
