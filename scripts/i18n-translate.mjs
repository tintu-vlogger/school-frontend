// Translates the app's collected English texts with the Google Translate website (visible Chrome).
// Usage (from frontend/): node scripts/i18n-translate.mjs <lang>, e.g. ml. Run scripts/i18n-extract.mjs first.
// Saves progress in scripts/i18n/<lang>.cache.json; re-running continues and only sends new texts.
import { chromium } from "playwright-core";
import fs from "node:fs";
const LANG = process.argv[2] || "ml";
const FE = process.cwd(); // run from frontend/: node scripts/i18n-translate.mjs ml
const source = JSON.parse(fs.readFileSync(`${FE}/scripts/i18n/source.json`, "utf8"));
const cacheFile = `${FE}/scripts/i18n/${LANG}.cache.json`;
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
const todo = source.filter((s) => !(s in cache));
console.log(`${source.length} texts, ${todo.length} to translate`);
const batches = [];
let cur = [], len = 0;
for (const s of todo) { if (len + s.length + 1 > 4500 && cur.length) { batches.push(cur); cur = []; len = 0; } cur.push(s); len += s.length + 1; }
if (cur.length) batches.push(cur);

const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, args: ["--window-size=1200,800"] });
const p = await b.newPage({ locale: "en-US" });
await p.goto(`https://translate.google.com/?sl=en&tl=${LANG}&op=translate`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
const box = p.locator("textarea").first();

async function translate(lines) {
  await box.fill("");
  await p.waitForTimeout(400);
  await box.fill(lines.join("\n"));
  let last = "", same = 0;
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(500);
    const txt = await p.evaluate((lang) => document.querySelector(`span[lang="${lang}"]`)?.innerText ?? "", LANG);
    if (txt && txt === last) { if (++same >= 3) break; } else same = 0;
    last = txt;
  }
  const out = last.split("\n");
  if (out.length === lines.length) return out;
  if (lines.length === 1) return [out.join(" ")];
  const mid = Math.ceil(lines.length / 2);               // lines got merged or split: halve and retry
  return [...(await translate(lines.slice(0, mid))), ...(await translate(lines.slice(mid)))];
}

for (let i = 0; i < batches.length; i++) {
  const lines = batches[i];
  const res = await translate(lines);
  lines.forEach((s, k) => { cache[s] = (res[k] ?? "").trim(); });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  console.log(`batch ${i + 1}/${batches.length}: ${lines.length} texts`);
  // human-like pace so the site doesn't treat it as automation: a few seconds between batches,
  // and a longer break every ten
  await p.waitForTimeout(2500 + Math.random() * 2500);
  if ((i + 1) % 10 === 0) await p.waitForTimeout(20000 + Math.random() * 15000);
}
await b.close();

// keep only good results: same placeholders, not empty
const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join(",");
const dict = {};
let dropped = 0;
for (const s of source) {
  const t = cache[s];
  if (t && ph(t) === ph(s)) dict[s] = t; else dropped++;
}
fs.mkdirSync(`${FE}/public/i18n`, { recursive: true });
fs.writeFileSync(`${FE}/public/i18n/${LANG}.json`, JSON.stringify(dict));
console.log(`done: ${Object.keys(dict).length} translations, ${dropped} left in English`);
process.exit(0);
