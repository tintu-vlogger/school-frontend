// Records the sample data the help frames show (public/help-demo/fixtures.json).
// Opens every page used by the help guides (src/components/help/topics/*.ts) as the demo company's
// owner, clicks what the guide clicks, and saves every API reply. Run from frontend/ with the API
// and web app running:  node scripts/help-record.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const WEB = process.env.HELP_WEB || "http://nextgenhrms-admin.localhost:3100";
const API = process.env.HELP_API || "http://127.0.0.1:8100/api/v1";
// the address the web app itself calls (NEXT_PUBLIC_API_URL); replies are keyed by the path after it
const APP_API = process.env.HELP_APP_API || (fs.readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_API_URL=(.*)/)?.[1] || "").trim() || API;
const EMAIL = process.env.HELP_EMAIL || "tintu@test.com", PASSWORD = process.env.HELP_PASSWORD || "Welcome9#";
const dir = "src/components/help/topics";

// sections: { path, click[] } read from the guide files
const sections = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const re = /path:\s*"([^"]+)"(?:\s*,\s*click:\s*\[([^\]]*)\])?/g;
  for (let m; (m = re.exec(src)); ) sections.push({ path: m[1], click: m[2] ? [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]) : [] });
}
const uniq = [...new Map(sections.map((s) => [s.path + "|" + s.click.join(">"), s])).values()];
console.log(`${uniq.length} screens to record`);

const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
const token = login.access_token;
if (!token) { console.log("could not sign in", login); process.exit(1); }

const fixtures = {};
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
const p = await ctx.newPage();
p.on("response", async (r) => {
  const u = r.url();
  if (!u.startsWith(APP_API) || r.request().method() !== "GET" || r.status() >= 400) return;
  try { const j = await r.json(); fixtures[u.slice(APP_API.length)] = j; } catch { /* not json */ }
});
await p.goto(`${WEB}/login`);
await p.evaluate((t) => { localStorage.setItem("hrms_token", t); localStorage.setItem("hrms_locale", "en"); localStorage.setItem("hr_avatar_on", "0"); }, token);

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
for (const [i, s] of uniq.entries()) {
  const sep = s.path.includes("?") ? "&" : "?";
  try {
    await p.goto(`${WEB}${s.path}${sep}embed=1`, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(1200);
    for (const c of s.click) {
      // never press anything that changes data while recording (only open pop-ups and tabs)
      if (/^(approve|reject|delete|remove|publish|submit|save|send|run|release|cancel|withdraw|archive|lock|finali[sz]e|pay|confirm|accept|decline|mark|close|reopen|disable|deactivate|reset|import|sign)\b/i.test(c.trim())) { console.log("not clicking", c, "on", s.path); break; }
      await p.evaluate((want) => {
        const n = (x) => x.toLowerCase().replace(/\s+/g, " ").trim();
        const els = [...document.querySelectorAll("button,a,[role=button],[role=tab],tr,[class*=cursor-pointer]")];
        const el = els.find((e) => n(e.innerText || "") === want || n(e.getAttribute("aria-label") || "") === want || n(e.title || "") === want)
          || els.find((e) => n(e.innerText || "").startsWith(want));
        el?.click();
      }, norm(c));
      await p.waitForTimeout(1500);
    }
    await p.waitForLoadState("networkidle").catch(() => {});
  } catch (e) { console.log("skipped", s.path, e.message.slice(0, 80)); }
  if ((i + 1) % 20 === 0) console.log(`${i + 1}/${uniq.length}`);
}
await b.close();
fs.mkdirSync("public/help-demo", { recursive: true });
fs.writeFileSync("public/help-demo/fixtures.json", JSON.stringify(fixtures));
console.log(`saved ${Object.keys(fixtures).length} replies, ${Math.round(fs.statSync("public/help-demo/fixtures.json").size / 1024)} KB`);
process.exit(0);
