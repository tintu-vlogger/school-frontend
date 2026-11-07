// Adds Piper's free Indian (Hindi) voices to @mintplex-labs/piper-tts-web, whose built-in voice
// list doesn't have them. They load from Piper's official model host. Runs after npm install;
// safe to run more than once.
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js");
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, "utf8");
if (s.includes("speaker_id_map: {}")) process.exit(0);

const OFFICIAL = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const hindi = ["priyamvada", "pratham", "rohan"]
  .map((v) => `  "hi_IN-${v}-medium": "${OFFICIAL}/hi/hi_IN/${v}/medium/hi_IN-${v}-medium.onnx",`).join("\n");
if (!s.includes("hi_IN-priyamvada-medium")) s = s.replace("const PATH_MAP = {\n", `const PATH_MAP = {\n${hindi}\n`);
// full links are used as they are; short ones are under the default host
if (!s.includes("const modelUrl")) s = s.replace('const HF_BASE = "https://huggingface.co/diffusionstudio/piper-voices/resolve/main";',
  'const HF_BASE = "https://huggingface.co/diffusionstudio/piper-voices/resolve/main";\nconst modelUrl = (p) => (p.startsWith("https://") ? p : `${HF_BASE}/${p}`);');
s = s.replaceAll("`${HF_BASE}/${path}`", "modelUrl(path)").replaceAll("`${HF_BASE}/${path}.json`", "`${modelUrl(path)}.json`");
// some voices (e.g. Rohan) leave out the speaker list; treat it as empty
s = s.replace("__privateSet(this, _modelConfig, JSON.parse(await modelConfigBlob.text()));",
  "__privateSet(this, _modelConfig, { speaker_id_map: {}, ...JSON.parse(await modelConfigBlob.text()) });");
fs.writeFileSync(file, s);
console.log("piper-tts-web: Hindi voices added");
