// Copies the face models used by face attendance (detection, face mesh, iris, face
// templates, anti-spoofing and liveness) from @vladmandic/human into public/models/face,
// so the app serves them itself and the browser never calls an outside host at run time.
// The library's browser build (human.esm.js) is copied there too and loaded at run time.
// Runs after npm install; safe to run more than once.
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "node_modules/@vladmandic/human/models");
const dest = path.join(process.cwd(), "public/models/face");
if (!fs.existsSync(src)) process.exit(0);
fs.mkdirSync(dest, { recursive: true });
const lib = path.join(process.cwd(), "node_modules/@vladmandic/human/dist/human.esm.js");
if (fs.existsSync(lib)) {
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(lib, path.join(dest, "human.esm.js"));
}
for (const name of ["blazeface", "facemesh", "iris", "faceres", "antispoof", "liveness"]) {
  for (const ext of [".json", ".bin"]) {
    const from = path.join(src, name + ext);
    const to = path.join(dest, name + ext);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue;
    fs.copyFileSync(from, to);
  }
}
