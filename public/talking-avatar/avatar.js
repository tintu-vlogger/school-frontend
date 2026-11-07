// TalkingAvatar: animates a pre-built photo rig in the browser.
// No models or network calls at runtime. Just the photo, rig.json, WebGL and math.
//
//   const avatar = await TalkingAvatar.create(el, { base: 'assets/' });
//   avatar.say('Hello there');           // browser voice + lip-sync
//   avatar.playAudio('hello.mp3');       // lip-sync to any audio file
//   avatar.sayAudio(wavBytes, 'Hello');  // a clip of that text, full mouth shapes
//   avatar.useMicrophone();              // live lip-sync to your voice
//   avatar.setView('portrait' | 'full');

const VISEMES = {
  sil: [0, 0, 0, 0], PP: [0, 0, 0.05, 0], FF: [0.1, 0.1, 0, 0.55], TH: [0.2, 0.1, 0, 0.35],
  DD: [0.3, 0.2, 0, 0.4], kk: [0.35, 0.1, 0, 0.25], CH: [0.22, 0, 0.55, 0.6], SS: [0.1, 0.4, 0, 0.7],
  RR: [0.25, 0, 0.4, 0.2], aa: [0.85, 0.15, 0, 0.35], E: [0.45, 0.55, 0, 0.5], I: [0.28, 0.7, 0, 0.55],
  O: [0.6, 0, 0.75, 0.15], U: [0.25, 0, 1, 0.05],
}; // [jaw, wide, round, upperLip]

const DIGRAPHS = [
  ['tch', ['CH']], ['th', ['TH']], ['sh', ['CH']], ['ch', ['CH']], ['ph', ['FF']], ['ng', ['kk']],
  ['ck', ['kk']], ['qu', ['kk', 'U']], ['wh', ['U']], ['gh', []], ['oo', ['U']], ['ou', ['aa', 'U']],
  ['ow', ['O', 'U']], ['ee', ['I']], ['ea', ['I']], ['ie', ['I']], ['ai', ['E', 'I']], ['ay', ['E', 'I']],
  ['oa', ['O']], ['oi', ['O', 'I']], ['oy', ['O', 'I']], ['au', ['O']], ['aw', ['O']], ['er', ['RR']],
];
const SINGLE = {
  a: ['aa'], e: ['E'], i: ['I'], o: ['O'], u: ['U'], y: ['I'], b: ['PP'], m: ['PP'], p: ['PP'],
  f: ['FF'], v: ['FF'], d: ['DD'], t: ['DD'], n: ['DD'], l: ['DD'], k: ['kk'], c: ['kk'], g: ['kk'],
  q: ['kk'], s: ['SS'], z: ['SS'], j: ['CH'], r: ['RR'], w: ['U'], h: ['kk'], x: ['kk', 'SS'],
};
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const VOWEL = new Set(['aa', 'E', 'I', 'O', 'U', 'ah']);

// ---- improved lip-sync (opt-in with { speechV2: true }) ----
// 15 standard mouth shapes + schwa: [jaw, wide, round, upperLip, lipTuck, tongueUp, tongueOut]
const VISEMES2 = {
  sil: [0, 0, 0, 0, 0, 0, 0], PP: [0, 0, 0.05, 0, 0, 0, 0],
  FF: [0.06, 0.1, 0, 0.5, 1, 0, 0],          // lower lip tucks up against the upper teeth
  TH: [0.22, 0.1, 0, 0.35, 0, 0, 1],         // tongue tip between the teeth
  DD: [0.28, 0.2, 0, 0.4, 0, 0.7, 0],        // tongue tip up behind the top teeth
  nn: [0.2, 0.15, 0, 0.3, 0, 0.85, 0],       // N, L
  kk: [0.35, 0.1, 0, 0.25, 0, 0, 0], CH: [0.22, 0, 0.55, 0.6, 0, 0.3, 0], SS: [0.1, 0.4, 0, 0.7, 0, 0, 0],
  RR: [0.25, 0, 0.4, 0.2, 0, 0, 0], aa: [0.85, 0.15, 0, 0.35, 0, 0, 0], ah: [0.5, 0.1, 0, 0.3, 0, 0, 0],
  E: [0.45, 0.55, 0, 0.5, 0, 0, 0], I: [0.28, 0.7, 0, 0.55, 0, 0, 0], O: [0.6, 0, 0.75, 0.15, 0, 0, 0], U: [0.25, 0, 1, 0.05, 0, 0, 0],
};
const MOUTH_KEYS = ['jaw', 'wide', 'round', 'upper', 'tuck', 'tongueUp', 'tongueOut', 'lipClose', 'asym'];
// Coarticulation (speechV2): each sound pulls on each part of the mouth with its own strength
// ("dominance") over a span of time, so neighbouring sounds blend like real speech.
// order: jaw, wide, round, upper, tuck, tongueUp, tongueOut, lipClose
const VOW_DOM = [1.8, 1, 1, 0.8, 0.15, 0.15, 0.15, 1];
const DOMINANCE = {
  aa: VOW_DOM, ah: VOW_DOM, E: VOW_DOM, I: VOW_DOM, O: [1.8, 1, 1.4, 0.8, 0.15, 0.15, 0.15, 1], U: [1.8, 1, 1.8, 0.8, 0.15, 0.15, 0.15, 1],
  PP: [0.3, 0.5, 0.4, 0.6, 0.3, 0.2, 0.2, 2.5],    // lips press shut briefly, jaw barely cares
  FF: [0.35, 0.5, 0.5, 1, 3, 0.2, 0.2, 0.5],       // lower lip to upper teeth
  TH: [0.5, 0.5, 0.4, 0.6, 0.2, 0.3, 3, 0.4],
  DD: [0.45, 0.5, 0.4, 0.6, 0.2, 2.2, 0.2, 0.4], nn: [0.4, 0.5, 0.4, 0.6, 0.2, 2.2, 0.2, 0.4],
  kk: [0.55, 0.4, 0.4, 0.5, 0.2, 0.2, 0.2, 0.4], CH: [0.55, 0.8, 1.4, 0.9, 0.2, 0.6, 0.2, 0.4],
  SS: [0.9, 1.1, 0.6, 0.9, 0.2, 0.2, 0.2, 0.4], RR: [0.5, 0.6, 1.2, 0.6, 0.2, 0.2, 0.2, 0.4],
  sil: [0.9, 0.7, 0.7, 0.7, 0.5, 0.5, 0.5, 0.6],
};
// how far (seconds) each part's influence reaches: lip rounding starts early, closures are quick
const REACH = [0.06, 0.07, 0.06, 0.06, 0.04, 0.04, 0.04, 0.02];
const hashN = (n) => { const x = Math.sin(n * 91.345 + 3.1) * 43758.5453; return x - Math.floor(x); };
// real English sounds (CMU dictionary, ARPAbet) -> mouth shapes
const ARPA = {
  AA: ['aa'], AE: ['aa'], AH: ['ah'], AO: ['O'], AW: ['aa', 'U'], AY: ['aa', 'I'], EH: ['E'], ER: ['RR'], EY: ['E', 'I'],
  IH: ['I'], IY: ['I'], OW: ['O', 'U'], OY: ['O', 'I'], UH: ['U'], UW: ['U'],
  B: ['PP'], P: ['PP'], M: ['PP'], F: ['FF'], V: ['FF'], TH: ['TH'], DH: ['TH'], T: ['DD'], D: ['DD'], N: ['nn'], L: ['nn'],
  S: ['SS'], Z: ['SS'], SH: ['CH'], ZH: ['CH'], CH: ['CH'], JH: ['CH'], K: ['kk'], G: ['kk'], NG: ['kk'], HH: ['ah'],
  R: ['RR'], W: ['U'], Y: ['I'],
};
let DICT = null; // word -> ['HH', 'AH', 'L', 'OW'], loaded with TalkingAvatar.loadDictionary()

function wordToVisemes(word) {
  let w = word.toLowerCase().replace(/\d/g, (d) => DIGITS[d]).replace(/[^a-z]/g, '');
  if (w.length > 3 && w.endsWith('e') && !/[aeiou]e$/.test(w)) w = w.slice(0, -1); // silent e
  const out = [];
  for (let i = 0; i < w.length;) {
    const dg = DIGRAPHS.find(([g]) => w.startsWith(g, i));
    if (dg) { out.push(...dg[1]); i += dg[0].length; continue; }
    if (w[i] !== w[i - 1]) out.push(...(SINGLE[w[i]] || []));
    i++;
  }
  return out;
}

// same as wordToVisemes, but each viseme also says which letter of the word it starts at
function wordToVisemesAt(word) {
  if (/[^A-Za-z]/.test(word)) return null; // digits/apostrophes: letters don't line up, spread evenly instead
  let w = word.toLowerCase();
  if (w.length > 3 && w.endsWith('e') && !/[aeiou]e$/.test(w)) w = w.slice(0, -1);
  const out = [];
  for (let i = 0; i < w.length;) {
    const dg = DIGRAPHS.find(([g]) => w.startsWith(g, i));
    if (dg) { dg[1].forEach((v, k) => out.push({ v, at: i + Math.min(k, dg[0].length - 1) })); i += dg[0].length; continue; }
    if (w[i] !== w[i - 1]) (SINGLE[w[i]] || []).forEach((v) => out.push({ v, at: i }));
    i++;
  }
  return out;
}

// emotions: how much of each face shape, plus head/gaze/mouth. All values blend smoothly.
//   smile, frown (corners down), browUp (both brows), browL/browR (one side), browIn (inner brows up: sad/worried),
//   furrow (brows down + together: angry), lid (+ lowers upper lids, - opens wide), squint (lower lids up),
//   jaw/round (mouth), pitch (+ head down), tilt (head to one side), gx/gy (gaze)
const EMOTIONS = {
  neutral: {},
  happy: { hold: 3, smile: 1, browUp: 0.25, squint: 0.2, pitch: -0.2 },
  laugh: { hold: 2.4, smile: 1, squint: 0.45, browUp: 0.35, jaw: 0.42, wide: 0.45, pitch: -0.55, bounce: 1 },
  smirk: { hold: 2.5, smirkR: 1, browL: 0.35, tilt: -0.35, squint: 0.1 },
  wink: { hold: 0.75, winkR: 1, smirkR: 0.9, tilt: 0.3 },
  sad: { hold: 3.5, frown: 1, browIn: 1, lid: 0.22, pitch: 0.7, gy: 0.6, gx: -0.2 },
  worried: { hold: 3, browIn: 1, browUp: 0.35, frown: 0.35, wide: 0.3, jaw: 0.06, gx: 0.5, gy: 0.15 },
  surprised: { hold: 1.8, browUp: 1.15, jaw: 0.38, round: 0.35, pitch: -0.35 },
  angry: { hold: 3, furrow: 1, lid: 0.22, squint: 0.7, frown: 0.45, pitch: 0.35, wide: 0.15 },
  disgust: { hold: 2.2, furrow: 0.5, squint: 0.6, frown: 0.6, upper: 0.7, browR: -0.2, pitch: -0.25, tilt: -0.4, gx: -0.4 },
  thinking: { hold: 3.5, browL: 0.75, browR: -0.15, frown: 0.2, smile: 0.08, tilt: 0.7, gx: 0.7, gy: -0.7, squint: 0.2 },
  confused: { hold: 2.6, browL: 0.8, furrow: 0.45, frown: 0.3, tilt: -0.8, gx: -0.3, smirkR: 0.15 },
  shy: { hold: 2.8, smile: 0.55, lid: 0.12, pitch: 0.55, tilt: 0.5, gx: 0.6, gy: 0.6 },
  sleepy: { hold: 4, lid: 0.48, browIn: 0.2, pitch: 0.45, tilt: 0.45, gy: 0.3 },
};
const EMO_KEYS = ['smile', 'smirkR', 'frown', 'browUp', 'browL', 'browR', 'browIn', 'furrow', 'lid', 'winkR', 'squint', 'jaw', 'round', 'wide', 'upper', 'bounce', 'pitch', 'tilt', 'gx', 'gy'];

// real teeth (cut once from a frontal dental photo, see build/make_teeth.py), shared by every avatar
const TEETH = (() => {
  const t = { ready: false };
  try {
    const base = new URL('./assets/', import.meta.url);
    const load = (f) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = new URL(f, base).href; });
    fetch(new URL('teeth.json', base)).then((r) => r.json())
      .then((meta) => Promise.all([load(meta.upper.file), load(meta.lower.file)]).then(([u, l]) => Object.assign(t, { meta, u, l, ready: true })))
      .catch(() => {});
  } catch {}
  return t;
})();

// Smooth lip edges: the face tracker gives only 11 points per inner lip, so the mouth opening was a
// polygon with straight sides. Add 2 points between each pair on a smooth curve (Catmull-Rom), and
// split the lip triangle on that edge, so the opening bends like real lips. Works on a copy of the rig.
function smoothLipRig(rig0) {
  const rig = JSON.parse(JSON.stringify(rig0));
  const P = rig.pts, tri = rig.tri;
  const cr = (p0, p1, p2, p3, t) => p1.map((_, k) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  });
  const corners = new Set([rig.mouth.upperIn[0], rig.mouth.upperIn[rig.mouth.upperIn.length - 1]]);
  const densify = (list) => {
    const out = [list[0]];
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      const ti = tri.findIndex((t) => t.includes(a) && t.includes(b));
      if (ti >= 0) {
        const c = tri[ti].find((v) => v !== a && v !== b);
        const p0 = P[list[Math.max(0, i - 1)]], p3 = P[list[Math.min(list.length - 1, i + 2)]];
        const ids = [1 / 3, 2 / 3].map((t) => {
          P.push(cr(p0, P[a], P[b], p3, t));
          rig.lower.push(corners.has(a) ? rig.lower[b] : rig.lower[a]);
          rig.headW.push((rig.headW[a] + rig.headW[b]) / 2);
          return P.length - 1;
        });
        tri.splice(ti, 1, [a, ids[0], c], [ids[0], ids[1], c], [ids[1], b, c]);
        out.push(...ids);
      }
      out.push(b);
    }
    return out;
  };
  rig.mouth.upperIn = densify(rig.mouth.upperIn);
  rig.mouth.lowerIn = densify(rig.mouth.lowerIn);
  return rig;
}

// Dense mouth mesh: split every triangle around the mouth, lips, cheeks and chin (twice), so the skin
// there bends smoothly like soft tissue instead of in stiff patches. Neighbouring triangles are split
// to match, so no cracks. The mouth opening's own edge is left as is. New points get blended values
// (lowerW: 0 = moves with the upper face, 1 = moves with the jaw).
function densifyMouthRig(rig0) {
  const rig = JSON.parse(JSON.stringify(rig0));
  const P = rig.pts, F = rig.face, M = rig.mouth;
  rig.lowerW = rig.lower.map((v) => (v === 1 ? 1 : 0));
  const mcx = (P[78][0] + P[308][0]) / 2;
  const top = P[2][1], bot = F.chinY + F.h * 0.12;
  const ecx = mcx, ecy = (top + bot) / 2, erx = F.w * 0.44, ery = (bot - top) / 2 + F.h * 0.02;
  const inside = (q) => ((q[0] - ecx) / erx) ** 2 + ((q[1] - ecy) / ery) ** 2 <= 1;
  const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const holeEdges = new Set();
  for (const L of [M.upperIn, M.lowerIn]) for (let i = 0; i + 1 < L.length; i++) holeEdges.add(key(L[i], L[i + 1]));
  const pass = () => {
    const mid = new Map();
    const ensure = (a, b) => {
      const k = key(a, b);
      if (holeEdges.has(k)) return;
      if (mid.has(k)) return;
      const pa = P[a], pb = P[b];
      P.push(pa.map((v, j) => (v + pb[j]) / 2));
      const w = (rig.lowerW[a] + rig.lowerW[b]) / 2;
      rig.lowerW.push(w);
      rig.lower.push(w >= 0.5 ? 1 : 0);
      rig.headW.push((rig.headW[a] + rig.headW[b]) / 2);
      mid.set(k, P.length - 1);
    };
    for (const t of rig.tri) if (t.every((v) => inside(P[v]))) { ensure(t[0], t[1]); ensure(t[1], t[2]); ensure(t[2], t[0]); }
    const out = [];
    for (const [a, b, c] of rig.tri) {
      const m = [mid.get(key(a, b)), mid.get(key(b, c)), mid.get(key(c, a))];
      const k = m.filter((x) => x !== undefined).length;
      if (k === 0) { out.push([a, b, c]); continue; }
      if (k === 3) { out.push([a, m[0], m[2]], [m[0], b, m[1]], [m[2], m[1], c], [m[0], m[1], m[2]]); continue; }
      // rotate so the pattern starts at edge 0
      let v = [a, b, c], mm = m;
      for (let r = 0; r < 3; r++) {
        const ok = k === 1 ? mm[0] !== undefined : mm[0] !== undefined && mm[1] !== undefined;
        if (ok) break;
        v = [v[1], v[2], v[0]]; mm = [mm[1], mm[2], mm[0]];
      }
      if (k === 1) out.push([v[0], mm[0], v[2]], [mm[0], v[1], v[2]]);
      else out.push([v[0], mm[0], mm[1]], [mm[0], v[1], mm[1]], [v[0], mm[1], v[2]]);
    }
    rig.tri = out;
  };
  pass();
  pass();
  return rig;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// smooth 1D value noise in [-1, 1]: organic drift instead of repeating sine waves
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
const noise = (t, seed) => {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  const v = (k) => hash(k + seed * 101.3);
  return v(i) * (1 - u) + v(i + 1) * u;
};
const noise2 = (t, seed) => noise(t, seed) * 0.7 + noise(t * 2.3 + 5, seed + 7) * 0.3;
const smooth = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

function polyInterp(points, x) {
  // points: [[x,y]...] sorted by x
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return y0 + ((x - x0) / (x1 - x0 || 1)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}


// ---- reading timings from a recorded clip (sayAudio) ----
const ENV_RATE = 100; // loudness samples per second

// loudness over time (0..1) and the stretches where the voice is actually speaking
function audioEnvelope(buffer) {
  const sr = buffer.sampleRate, n = buffer.length, ch = Math.min(2, buffer.numberOfChannels);
  const mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
  const hop = Math.round(sr / ENV_RATE), win = hop * 2;
  const frames = Math.max(1, Math.ceil(n / hop));
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const a = Math.max(0, f * hop - hop / 2 | 0), b = Math.min(n, a + win);
    let sum = 0; for (let i = a; i < b; i++) sum += mono[i] * mono[i];
    rms[f] = Math.sqrt(sum / Math.max(1, b - a));
  }
  const sorted = Array.from(rms).sort((x, y) => x - y);
  const floor = sorted[Math.floor(sorted.length * 0.2)], peak = sorted[Math.floor(sorted.length * 0.98)] || sorted[sorted.length - 1] || 1;
  const thr = Math.max(floor * 2.5, peak * 0.08);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) env[f] = clamp((rms[f] - floor) / Math.max(1e-6, peak - floor), 0, 1);
  // speaking stretches; pauses shorter than 120 ms are part of a word
  const raw = [];
  let st = -1;
  for (let f = 0; f < frames; f++) {
    const on = rms[f] > thr;
    if (on && st < 0) st = f;
    if (!on && st >= 0) { raw.push([st / ENV_RATE, f / ENV_RATE]); st = -1; }
  }
  if (st >= 0) raw.push([st / ENV_RATE, buffer.duration]);
  const regions = [];
  for (const r of raw) {
    const last = regions[regions.length - 1];
    if (last && r[0] - last[1] < 0.12) last[1] = r[1]; else regions.push([...r]);
  }
  return { env, regions: regions.filter((r) => r[1] - r[0] >= 0.05).map(([a, b]) => [Math.max(0, a - 0.02), Math.min(buffer.duration, b + 0.02)]) };
}

// how long each word takes to say (relative), from its sounds
function wordWeight(w) {
  const ph = DICT?.get(w.toLowerCase());
  const sounds = ph ? ph.flatMap((x) => ARPA[x.replace(/\d/, '')] || []) : wordToVisemes(w);
  return Math.max(0.12, sounds.reduce((d, v) => d + (VOWEL.has(v) ? 0.105 : 0.07), 0));
}

// per-letter timings for `text`, fitted onto the speaking stretches of the real audio
function alignTextToAudio(text, duration, regions) {
  const chars = text.split(''), st = new Array(chars.length).fill(0), en = new Array(chars.length).fill(0);
  const words = [];
  const re = /[A-Za-z0-9']+/g;
  let m;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 3);
    words.push({ a: m.index, b: m.index + m[0].length, w: wordWeight(m[0]), brk: /^[^A-Za-z0-9']*[,.;:!?\n—–-]/.test(after) });
  }
  if (!regions.length) regions = [[0, duration]];
  // phrases of the text (split at punctuation) and long pauses in the audio
  const phrases = [];
  let cur = [];
  for (const w of words) { cur.push(w); if (w.brk) { phrases.push(cur); cur = []; } }
  if (cur.length) phrases.push(cur);
  const groups = [];
  for (const r of regions) {
    const g = groups[groups.length - 1];
    if (g && r[0] - g[g.length - 1][1] < 0.18) g.push(r); else groups.push([r]);
  }
  // lay a list of words along a list of speaking stretches, in proportion to their length
  const lay = (ws, rs) => {
    const total = ws.reduce((d, w) => d + w.w, 0) || 1;
    const active = rs.reduce((d, r) => d + (r[1] - r[0]), 0);
    const toAudio = (p) => {
      let acc = 0;
      for (const r of rs) { const L = r[1] - r[0]; if (p <= acc + L) return r[0] + (p - acc); acc += L; }
      return rs[rs.length - 1][1];
    };
    let pos = 0;
    for (const w of ws) {
      const t0 = toAudio((pos / total) * active), t1 = toAudio(((pos + w.w) / total) * active);
      const L = w.b - w.a;
      for (let i = 0; i < L; i++) { st[w.a + i] = t0 + ((t1 - t0) * i) / L; en[w.a + i] = t0 + ((t1 - t0) * (i + 1)) / L; }
      pos += w.w;
    }
  };
  if (phrases.length > 1 && phrases.length === groups.length) phrases.forEach((p, i) => lay(p, groups[i]));
  else lay(words, regions);
  // spaces and punctuation sit between the words around them
  let last = 0;
  for (let i = 0; i < chars.length; i++) {
    if (en[i] > 0) { last = en[i]; continue; }
    st[i] = last; en[i] = last;
  }
  return { characters: chars, character_start_times_seconds: st, character_end_times_seconds: en };
}

export class TalkingAvatar {
  static async create(container, opts = {}) {
    const base = opts.base ?? 'assets/';
    const rig = await (await fetch(base + 'rig.json')).json();
    const img = new Image();
    img.src = base + rig.image;
    await img.decode();
    // optional cut-out mask (white = person): lets a background show behind him
    let mask = null;
    if (opts.mask !== false) {
      const m = new Image();
      m.src = base + 'mask.png';
      try { await m.decode(); mask = m; } catch {}
    }
    return new TalkingAvatar(container, rig, img, { ...opts, maskImg: mask });
  }

  // build from parts made in the browser (see rigbuilder.js): rig object, photo, mask canvas
  static fromParts(container, rig, img, mask, opts = {}) {
    return new TalkingAvatar(container, rig, img, { ...opts, maskImg: mask });
  }

  destroy() {
    this._dead = true;
    this.stop();
    this.back.remove();
    this.front.remove();
    this.lidCv?.remove();
  }

  constructor(container, rig, img, opts) {
    this.rig = opts.smoothLips && rig.mouth ? smoothLipRig(rig) : rig;
    if (opts.denseMouth && this.rig.mouth) this.rig = densifyMouthRig(this.rig);
    this.img = img;
    this.maskImg = opts.maskImg || null;
    this.container = container;
    this.params = { jaw: 0, wide: 0, round: 0, upper: 0, tuck: 0, tongueUp: 0, tongueOut: 0, lipClose: 0, asym: 0, blink: 0, gx: 0, gy: 0 };
    this.vel = {}; // mouth velocities (spring motion)
    this.speechV2 = !!opts.speechV2;
    this.lipShape = opts.lipShape || {}; // { flatW, upLift } for comparing mouth openings
    this.target = { jaw: 0, wide: 0, round: 0, upper: 0 };
    this.manual = null; // set by debug sliders
    this.lively = !!opts.lively;
    // how much the head moves (1 = the original subtle motion; ~2 = a lively presenter)
    this.motion = opts.motion ?? 1;
    // expressive mode: eyebrows, real smiles, head tilts and blinks that follow what is being said
    this.expressive = !!opts.expressive;
    this.ex = { browL: 0, browR: 0, smile: 0, tilt: 0 };
    this.emo = Object.fromEntries(EMO_KEYS.map((k) => [k, 0])); // current emotion (blended)
    this.emoTarget = {};
    // each avatar gets its own rhythm, so several on one page never move in sync
    this.seed = Math.random() * 1000;
    this.rate = 0.85 + Math.random() * 0.3; // live-DP mode: more head/eye movement and a soft smile when not talking
    this.speaking = false;
    this.energy = 0;
    this.nextBlink = 0.5 + Math.random() * 3.5;
    this.blinkT = -1;
    this.nextGaze = 0.5 + Math.random() * 2.5;
    this.gazeTarget = [0, 0];
    this._buildDom();
    this._precompute();
    if (this.speechV2 && this.rig.eyes) this._prepEyes(); // real eyes: solid irises over a clean eye white
    this._initGL();
    this.setView(opts.view ?? 'portrait');
    new ResizeObserver(() => this._resize()).observe(container);
    this._last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
  }

  // ---------- setup ----------
  _buildDom() {
    const c = this.container;
    c.style.position ||= 'relative';
    this.back = document.createElement('canvas'); // mouth interior
    this.front = document.createElement('canvas'); // warped photo
    for (const cv of [this.back, this.front]) {
      Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
      c.appendChild(cv);
    }
    this.ctx = this.back.getContext('2d');
    this.lidCv = document.createElement('canvas'); // eyelids drawn over the photo when blinking
    Object.assign(this.lidCv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    c.appendChild(this.lidCv);
    this.lctx = this.lidCv.getContext('2d');
  }

  _precompute() {
    const r = this.rig, P = r.pts, n = P.length, F = r.face, M = r.mouth;
    const ui = M.upperIn.map((i) => P[i]), li = M.lowerIn.map((i) => P[i]);
    const hw = Math.hypot(P[308][0] - P[78][0], P[308][1] - P[78][1]) / 2;
    const mcx = (P[78][0] + P[308][0]) / 2;
    const mcy = [...ui, ...li].reduce((s, p) => s + p[1], 0) / (ui.length + li.length);
    let zMin = Infinity;
    for (const p of P) zMin = Math.min(zMin, p[2]);
    this.m = { hw, mcx, mcy };
    // this person's mouth: outer width and lip thickness (teeth are sized and placed from these)
    const dist = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
    this.anat = { mouthHalf: dist(61, 291) / 2, upLip: dist(0, 13), loLip: dist(14, 17) };
    this.pivot = [F.cx, F.chinY + F.h * 0.3];

    const A = (k) => new Float32Array(n);
    const Jfs = A(); // chin tipping back (hinged jaw), applied with the opening squared
    const Jdy = A(), Udy = A(), Wdx = A(), Wdy = A(), Rdx = A(), Rdy = A(), Bdy = A(), depth = A();
    const eyeId = new Int8Array(n).fill(-1), iris = new Uint8Array(n);
    const maxJaw = F.h * 0.075, maxU = F.h * 0.018;

    // eyes
    const eyes = Object.values(r.eyes).map((e) => {
      const up = e.upper.map((i) => P[i]).sort((a, b) => a[0] - b[0]);
      const lo = e.lower.map((i) => P[i]).sort((a, b) => a[0] - b[0]);
      return { e, up, lo };
    });
    eyes.forEach(({ e, up, lo }, k) => {
      const corners = new Set([e.upper[0], e.upper[e.upper.length - 1]]);
      for (const i of [...e.upper, ...e.iris]) {
        if (corners.has(i)) continue;
        const [x, y] = P[i];
        Bdy[i] = polyInterp(lo, x) - y;
        eyeId[i] = k;
      }
      for (const i of e.crease) {
        const x = P[i][0];
        Bdy[i] = (polyInterp(lo, x) - polyInterp(up, x)) * 0.4;
      }
      for (const i of e.iris) {
        const [x, y] = P[i];
        const yU = polyInterp(up, x), yL = polyInterp(lo, x);
        if (y <= yU + 0.5) Bdy[i] = yL - yU;  // hidden under the upper lid: it's lid skin, moves with the lid
        else if (y >= yL - 0.5) Bdy[i] = 0;   // under the lower lid: stays with the lower lid
        else iris[i] = 1;                      // visible iris: follows the gaze
      }
    });

    for (let i = 0; i < n; i++) {
      const [x, y, z] = P[i];
      const dx = x - mcx, lw = r.lowerW ? r.lowerW[i] : r.lower[i] === 1 ? 1 : 0, low = lw >= 0.5;
      depth[i] = (F.zBack - z) / (F.zBack - zMin || 1);
      if (lw > 0) {
        const v = clamp((y - mcy) / (F.chinY - mcy), 0, 1);
        const width = hw * (1 - v) + F.w * 0.5 * v;
        const lat = Math.pow(clamp(1 - (dx / (width * 1.25)) ** 2, 0, 1), 0.8);
        // improved mode: the jaw swings over the neck instead of dragging it (movement stops just below the chin)
        let fade = y > F.chinY ? 1 - clamp((y - F.chinY) / (F.h * (this.speechV2 ? 0.16 : 0.3)), 0, 1) : 1;
        // smooth S-curve, and long enough that the skin under the chin never folds over itself
        if (this.speechV2) fade = Math.sqrt(fade * fade * (3 - 2 * fade));
        Jdy[i] = maxJaw * lat * fade * fade;
        if (this.speechV2) {
          // the lip drops as one broad piece (a U): flat across the middle, easing up only near the
          // corners. Never a cone that pulls the middle of the lip down into a point.
          // the whole lower lip (inner edge down to where lip meets skin) moves as one piece, so it never
          // stretches taller; below the lip the movement eases into the chin
          const lipBot = P[17][1] + hw * 0.05;
          const flat = Math.exp(-((Math.abs(dx) / (hw * (this.lipShape.flatW ?? 0.95))) ** 6));
          // the jaw swings on a hinge near the ears (not a sliding block): how far a point travels depends
          // on how far in front of the hinge it is: lips and the front of the chin the most, the sides of the
          // jaw toward the ears hardly at all, so it fades smoothly into the cheeks
          const vv = clamp((y - mcy) / (F.chinY - mcy), 0, 1);
          const jawHalf = F.w * (0.5 * (1 - vv) + 0.38 * vv);
          const hinge = Math.pow(clamp(1 - (dx / jawHalf) ** 2, 0, 1), 0.6);
          // the lip itself keeps its corners pinched; just below it, it blends into the hinged jaw
          const tt = clamp((y - lipBot) / (hw * 0.4), 0, 1), blend = tt * tt * (3 - 2 * tt);
          Jdy[i] = maxJaw * (y <= lipBot ? flat : flat + (hinge - flat) * blend) * fade * fade;
          // as it swings open the chin tips back, away from the camera: lower points rise a little
          // (grows with the square of the opening), so the chin looks slightly shorter from the front
          Jfs[i] = -(y - mcy) * 0.06 * clamp(vv * 1.4, 0, 1) * hinge * fade * fade * (y > lipBot ? 1 : 0);
        }
        Jdy[i] *= lw;
      }
      if (lw < 1) {
        const lat = clamp(1 - (dx / (hw * 1.15)) ** 2, 0, 1);
        const vert = Math.exp(-(((mcy - y) / (F.h * 0.07)) ** 2));
        Udy[i] = -maxU * lat * vert * (1 - lw);
      }
      // improved mode: sideways stretch stays on the lips (cheeks, beard and face outline don't widen)
      const g = this.speechV2
        ? Math.exp(-((dx / (1.05 * hw)) ** 2 + ((y - mcy) / (0.4 * hw)) ** 2))
        : Math.exp(-((dx / (1.5 * hw)) ** 2 + ((y - mcy) / (0.75 * hw)) ** 2));
      const nx = clamp(dx / hw, -1.2, 1.2);
      Wdx[i] = 0.2 * hw * nx * g;
      Wdy[i] = -0.05 * hw * g * Math.abs(nx);
      Rdx[i] = -0.28 * hw * nx * g;
      Rdy[i] = (2 * lw - 1) * 0.07 * hw * g * clamp(1 - Math.abs(nx) / 1.4, 0, 1);
    }
    // irises move exactly with their own eye outline, so a head turn never shifts the gaze
    for (const e of Object.values(r.eyes)) {
      const ring = [...e.upper, ...e.lower];
      const d = ring.reduce((sum, i) => sum + depth[i], 0) / ring.length;
      for (const i of e.iris) depth[i] = d;
    }
    // turn depth: the head moves as one piece; only the area around the nose shifts a bit
    // more, which reads as a gentle rotation without the face sliding under the hair
    // 3D head shape for turning: an ellipsoid around the head (hair included) plus the
    // nose sticking out. Front of the face moves most, the sides/ears least.
    const [nX, nY] = P[1], nR = F.w * 0.2;
    this.head3d = { cx: F.cx, cy: F.cy - F.h * 0.1, rx: F.w * 0.62, ry: F.h * 0.85 };
    const H3 = this.head3d;
    this.z3 = Float32Array.from(P, ([x, y]) => {
      const u = (x - H3.cx) / H3.rx, v = (y - H3.cy) / H3.ry;
      return Math.sqrt(Math.max(0, 1 - u * u - v * v)) + 0.25 * Math.exp(-(((x - nX) ** 2 + (y - nY) ** 2) / (nR * nR)));
    });
    // body: everything above the waist sways around the hips; breathing/shrugs lift the shoulders and head
    const waistY = F.chinY + F.h * 2.2, shoulderY = F.chinY + F.h * 0.35, chestY = F.chinY + F.h * 1.1;
    const Sway = A(), Lift = A();
    for (let i = 0; i < n; i++) {
      const y = P[i][1];
      Sway[i] = clamp((waistY - y) / (waistY - shoulderY), 0, 1);
      Lift[i] = clamp((chestY - y) / (chestY - shoulderY), 0, 1);
    }
    this.body = { px: F.cx, py: waistY };

    // ----- expression shapes -----
    // eyebrows: each brow (and the forehead skin above it) lifts; the upper lid follows a little
    const BrL = A(), BrR = A(), Smx = A(), Smy = A();
    const browSets = [[70, 63, 105, 66, 107, 46, 53, 52, 65, 55], [300, 293, 334, 296, 336, 276, 283, 282, 295, 285]];
    browSets.forEach((set, side) => {
      const xs = set.map((i) => P[i][0]), ys = set.map((i) => P[i][1]);
      const bx = xs.reduce((a, b) => a + b) / xs.length, by = ys.reduce((a, b) => a + b) / ys.length;
      const bw = (Math.max(...xs) - Math.min(...xs)) * 0.75, up = F.h * 0.2, down = F.h * 0.055;
      const out = side ? BrR : BrL, lift = F.h * 0.03;
      for (let i = 0; i < n; i++) {
        const [x, y] = P[i], dy = y - by;
        out[i] = -lift * Math.exp(-(((x - bx) / bw) ** 2) - (dy / (dy < 0 ? up : down)) ** 2);
      }
    });
    // smile: mouth corners go up and out, the cheeks rise and the lower lids push up (a real smile reaches the eyes)
    const corners = [P[61], P[291]], cheeks = [P[205], P[425]];
    const SkRx = A(), SkRy = A(); // smile on the right side of the picture only (smirk / wink)
    const side = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y] = P[i];
      side[i] = x > F.cx ? 1 : 0;
      corners.forEach(([cx, cy], k) => {
        const g = Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (hw * 0.95) ** 2));
        // improved mode: the corners move, the skin beyond them barely follows sideways
        const gx = this.speechV2 ? Math.exp(-(((x - cx) ** 2 + ((y - cy) * 1.6) ** 2) / (hw * 0.5) ** 2)) : g;
        Smx[i] += (k ? 1 : -1) * hw * 0.1 * gx;
        Smy[i] -= F.h * 0.022 * g;
        if (k) { SkRx[i] += hw * 0.12 * gx; SkRy[i] -= F.h * 0.026 * g; }
      });
      cheeks.forEach(([cx, cy], k) => {
        const g = F.h * 0.013 * Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (F.w * 0.17) ** 2));
        Smy[i] -= g;
        if (k) SkRy[i] -= g * 1.2;
      });
    }
    eyes.forEach(({ e, up, lo }) => {
      const ends = new Set([e.lower[0], e.lower[e.lower.length - 1], e.upper[0], e.upper[e.upper.length - 1]]);
      for (const i of e.lower) {
        if (ends.has(i)) continue;
        const x = P[i][0];
        Smy[i] = -(polyInterp(lo, x) - polyInterp(up, x)) * 0.2;
      }
    });
    // emotion shapes: inner brows (sad), furrowed brows (angry), corners down (sad), lower lids up (squint)
    const BIdy = A(), FUdx = A(), FUdy = A(), FRdx = A(), FRdy = A(), LLdy = A();
    browSets.forEach((set) => {
      const pts = set.map((i) => P[i]);
      const xs = pts.map((q) => q[0]), by = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      const bw = (Math.max(...xs) - Math.min(...xs)) * 0.5;
      const ix = xs.reduce((best, x) => (Math.abs(x - F.cx) < Math.abs(best - F.cx) ? x : best));
      const ox = xs.reduce((best, x) => (Math.abs(x - F.cx) > Math.abs(best - F.cx) ? x : best));
      const toMid = Math.sign(F.cx - ix);
      for (let i = 0; i < n; i++) {
        const [x, y] = P[i], dy = y - by;
        const vert = Math.exp(-((dy / (dy < 0 ? F.h * 0.17 : F.h * 0.05)) ** 2));
        const gIn = Math.exp(-(((x - ix) / (bw * 0.75)) ** 2)) * vert;
        const gOut = Math.exp(-(((x - ox) / (bw * 0.7)) ** 2)) * vert;
        BIdy[i] += -F.h * 0.032 * gIn + F.h * 0.01 * gOut;
        FUdy[i] += F.h * 0.024 * gIn;
        FUdx[i] += toMid * F.w * 0.022 * gIn;
      }
    });
    corners.forEach(([cx, cy], k) => {
      for (let i = 0; i < n; i++) {
        const [x, y] = P[i];
        const g = Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (hw * 0.9) ** 2));
        FRdy[i] += F.h * 0.02 * g;
        FRdx[i] += (k ? -1 : 1) * hw * 0.05 * g;
      }
    });
    { // chin pushes the lower lip up a touch in a frown
      const [cx, cy] = P[17];
      for (let i = 0; i < n; i++) {
        const [x, y] = P[i];
        FRdy[i] -= F.h * 0.008 * Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (hw * 0.7) ** 2));
      }
    }
    eyes.forEach(({ e, up, lo }) => {
      const ends = new Set([e.lower[0], e.lower[e.lower.length - 1]]);
      for (const i of e.lower) {
        if (ends.has(i)) continue;
        const x = P[i][0];
        LLdy[i] = -(polyInterp(lo, x) - polyInterp(up, x)) * 0.28;
      }
    });
    // F/V: the lower lip rolls up against the upper teeth
    const LTdy = A();
    for (let i = 0; i < n; i++) {
      const lwi = r.lowerW ? r.lowerW[i] : r.lower[i] === 1 ? 1 : 0;
      if (lwi <= 0) continue;
      const [x, y] = P[i], dx = x - mcx;
      const lat = clamp(1 - (dx / (hw * 1.1)) ** 2, 0, 1);
      LTdy[i] = -F.h * 0.02 * lat * lwi * Math.exp(-(((y - (mcy + hw * 0.22)) / (hw * 0.3)) ** 2));
    }
    const LipM = A(); // how much each lower-face point is "lip" rather than chin
    for (let i = 0; i < n; i++) {
      const lwi = r.lowerW ? r.lowerW[i] : r.lower[i] === 1 ? 1 : 0;
      if (lwi <= 0) continue;
      const [x, y] = P[i], dx = x - mcx;
      const lat = clamp(1 - (dx / (hw * 1.2)) ** 2, 0, 1);
      const lipBot = P[17][1] + hw * 0.05; // whole lower lip as one piece, easing into the chin below it
      LipM[i] = lwi * lat * (y <= lipBot ? 1 : Math.exp(-(((y - lipBot) / (hw * 0.5)) ** 2)));
    }
    // cheeks: a soft area over each cheek (beside the nose, down to the smile line) that moves with speech
    const CkG = A(), CkS = A();
    for (let i = 0; i < n; i++) {
      const [x, y] = P[i];
      for (const [cx, cy] of [P[205], P[425]]) {
        const g = Math.exp(-(((x - cx) / (F.w * 0.16)) ** 2 + ((y - cy) / (F.h * 0.12)) ** 2));
        if (g > CkG[i]) { CkG[i] = g; CkS[i] = Math.sign(cx - mcx); }
      }
    }
    this.CkG = CkG; this.CkS = CkS;
    const LipC = A(); // lips: 1 in the middle of the mouth, fading toward the corners
    for (let i = 0; i < n; i++) LipC[i] = Math.exp(-((Math.abs(P[i][0] - mcx) / (hw * 0.9)) ** 6)); // broad and flat, no peak
    Object.assign(this, { BrL, BrR, Smx, Smy, BIdy, FUdx, FUdy, FRdx, FRdy, LLdy, SkRx, SkRy, side, LTdy, LipM, LipC });
    this.Jfs = Jfs;
    Object.assign(this, { Jdy, Udy, Wdx, Wdy, Rdx, Rdy, Bdy, depth, eyeId, iris, Sway, Lift });
    this.pos = new Float32Array(n * 2);
  }

  _initGL() {
    const gl = (this.gl = this.front.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }));
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, `
      attribute vec2 aPos; attribute vec2 aUV; uniform vec4 uView; varying vec2 vUV;
      void main(){ vUV=aUV; gl_Position=vec4((aPos.x-uView.x)/uView.z*2.0-1.0, 1.0-(aPos.y-uView.y)/uView.w*2.0, 0.0, 1.0); }`));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `
      precision mediump float; uniform sampler2D uTex; uniform sampler2D uMask; uniform float uHasMask; varying vec2 vUV;
      void main(){
        vec3 c = texture2D(uTex, vUV).rgb;
        float a = uHasMask > 0.5 ? texture2D(uMask, vUV).r : 1.0;
        gl_FragColor = vec4(c * a, a);
      }`));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.uView = gl.getUniformLocation(prog, 'uView');

    const { pts, w, h, tri } = this.rig;
    const uv = new Float32Array(pts.length * 2);
    pts.forEach((p, i) => { uv[i * 2] = p[0] / w; uv[i * 2 + 1] = p[1] / h; });
    const bind = (data, name) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, name === 'aPos' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      return b;
    };
    bind(uv, 'aUV');
    this.posBuf = bind(this.pos, 'aPos');
    // real-teeth layer (open-mouth photos) first, so the face and lips draw on top of it
    const idx = new Uint16Array([...(this.rig.itri || []).flat(), ...tri.flat()]);
    this.nIdx = idx.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.texImg || this.img);
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uMask'), 1);
    gl.uniform1f(gl.getUniformLocation(prog, 'uHasMask'), this.maskImg ? 1 : 0);
    if (this.maskImg) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.maskImg);
      gl.activeTexture(gl.TEXTURE0);
    }
  }

  // show an emotion on the face: 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'thinking'
  // Each emotion rises, holds a natural while (with slight life in it), then relaxes back to neutral.
  // onEmotionEnd (optional) is called when it has returned to neutral.
  setEmotion(name) {
    const e = EMOTIONS[name] || {};
    this.emoTarget = e;
    this.emotionName = EMOTIONS[name] ? name : 'neutral';
    this.emoUntil = (this.vt ?? performance.now() / 1000) + (e.hold || 0);
  }
  static get emotions() { return Object.keys(EMOTIONS); }
  // every mouth shape the lip-sync uses: { name: [jaw, wide, round, upperLip] }
  static get visemes() { return JSON.parse(JSON.stringify(VISEMES)); }
  static get visemes2() { return JSON.parse(JSON.stringify(VISEMES2)); }
  // pronunciation dictionary (lines of "word PH PH PH")
  static async loadDictionary(url) {
    if (DICT) return;
    const txt = await (await fetch(url)).text();
    const d = new Map();
    for (const line of txt.split('\n')) { const i = line.indexOf(' '); if (i > 0) d.set(line.slice(0, i), line.slice(i + 1).split(' ')); }
    DICT = d;
  }
  // how a text will be spoken, as dictionary sounds (for checking)
  static phonemes(text) {
    return (text.match(/[A-Za-z']+/g) || []).map((w) => {
      const ph = DICT?.get(w.toLowerCase());
      return ph ? `${w}: ${ph.join(' ')}` : `${w}: (spelling)`;
    });
  }

  setView(mode) {
    const { w, h, face: F } = this.rig;
    if (mode === 'full') this.view = [0, 0, w, h];
    else if (mode === 'circle') {
      const vw = F.w * 2.8;
      this.view = [F.cx - vw / 2, F.cy - vw * 0.5, vw, vw];
    } else {
      const vw = F.w * 2.4, vh = vw * 1.2;
      this.view = [F.cx - vw / 2, F.cy - vh * 0.48, vw, vh];
    }
    this.container.style.aspectRatio = `${this.view[2]} / ${this.view[3]}`;
    this._resize();
  }

  // custom framing: [x, y, size, size] in photo pixels
  setViewRect(r) {
    this.view = r.slice();
    this.container.style.aspectRatio = `${r[2]} / ${r[3]}`;
    this._resize();
  }

  // square framing that keeps the head (with hair) inside and, where possible, lets the photo
  // fill the bottom and sides so the body never looks cut off or floating
  autoFitView() {
    const { w: W, h: H, face: F } = this.rig;
    const top = Math.max(0, F.cy - F.h * 1.05);                    // just above the hair
    let v = Math.min(F.w * 2.8, W, H - top + F.h * 0.15);
    v = Math.max(v, F.w * 1.5);                                      // never closer than the face itself
    const x = W >= v ? clamp(F.cx - v / 2, 0, W - v) : F.cx - v / 2;
    let y = top - v * 0.06;
    if (H >= v) y = Math.min(y, H - v);                              // photo reaches the circle's bottom
    return [x, y, v, v];
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(this.container.clientWidth * dpr), H = Math.round(this.container.clientHeight * dpr);
    for (const cv of [this.back, this.front, this.lidCv]) { cv.width = W; cv.height = H; }
    this.gl.viewport(0, 0, W, H);
  }

  // ---------- animation ----------
  _frame(now) {
    if (this._dead) return;
    // slow motion: the whole avatar runs on its own clock, scaled by timeScale (1 = normal)
    const dt = clamp((now - this._last) / 1000, 0, 0.05) * (this.timeScale ?? 1);
    this._last = now;
    this.vt = (this.vt ?? now / 1000) + dt;
    const t = this.vt;
    this._updateDrivers(t, dt);
    this._idle(t, dt);
    this._deform(t);
    this._draw();
    requestAnimationFrame((tt) => this._frame(tt));
  }

  _updateDrivers(t, dt) {
    let tgt = { jaw: 0, wide: 0, round: 0, upper: 0 };
    if (this.manual) tgt = this.manual;
    else if (this.analyser) tgt = this._audioTarget();
    else if (this.speech) tgt = this._speechTarget(performance.now() / 1000);
    else if (Math.abs(this.emo.jaw) + Math.abs(this.emo.round) + Math.abs(this.emo.wide) + Math.abs(this.emo.upper) > 0.01) {
      const e = this.emo, laugh = e.bounce > 0.05 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 9)) : 1; // ha-ha-ha
      tgt = { jaw: e.jaw * laugh, wide: e.wide, round: e.round, upper: e.upper };
    }
    else if (this.lively) {
      // a soft closed-mouth smile that comes and goes
      if (t > (this.smileAt ?? 0)) {
        this.smile = Math.random() < 0.35 ? 0 : 0.25 + Math.random() * 0.35;
        this.smileAt = t + 1.5 + Math.random() * 3;
      }
      tgt = { jaw: 0, wide: this.smile || 0, round: 0, upper: 0 };
    }
    const p = this.params;
    for (const k of MOUTH_KEYS) {
      tgt[k] ??= 0;
      let tau = k === 'jaw' && tgt[k] < p[k] ? 0.06 : k === 'wide' && this.lively && !this.speech ? 0.35 : 0.04;
      if (this.speech?.exact) tau = k === 'jaw' ? (tgt[k] < p[k] ? (tgt.closing ? 0.022 : 0.04) : 0.028) : 0.032; // snappier, closes fast on m/b/p
      if (this.speech?.exact && this.speechV2) {
        // muscles have momentum: a slightly springy, critically-damped motion
        const w = k === 'lipClose' ? 48 : k === 'round' ? 26 : 34, z = 0.82;
        let vv = this.vel[k] || 0;
        const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
        for (let q = 0; q < steps; q++) { vv += (w * w * (tgt[k] - p[k]) - 2 * z * w * vv) * h; p[k] += vv * h; }
        this.vel[k] = vv;
        p[k] = clamp(p[k], -0.03, 1.1); // a tiny overshoot is natural; never more
      } else {
        this.vel[k] = 0;
        p[k] = smooth(p[k], tgt[k], dt, tau);
      }
    }
    this.energy = smooth(this.energy, p.jaw, dt, 0.3);
    if (this.emotionName && this.emotionName !== 'neutral' && t > this.emoUntil) {
      this.emoTarget = {};
      this.emotionName = 'neutral';
      this.onEmotionEnd?.();
    }
    const life = 0.9 + 0.1 * noise2(t * 0.7 + this.seed, 21); // never perfectly frozen
    for (const k of EMO_KEYS) {
      const tg = (this.emoTarget[k] || 0) * life, cur = this.emo[k];
      const tau = k === 'winkR' ? 0.07 : Math.abs(tg) > Math.abs(cur) ? 0.2 : 0.55; // quick in, slow relax
      this.emo[k] = smooth(cur, tg, dt, tau);
    }
    if (this.expressive) this._expression(t, dt);
  }

  // expressions: follow the script while speaking, small natural ones in between
  _expression(t, dt) {
    const s = this.speech, ex = this.ex;
    let browL = 0, browR = 0, smile = 0, tilt = 0;
    if (s?.exact && s.events) {
      const tt = this._speechClock(s);
      for (const e of s.events) {
        if (e.t > tt) break;
        const d = tt - e.t;
        if (e.kind === 'blink' || e.kind === 'nod') {
          if (!e.done) {
            e.done = true;
            if (e.kind === 'blink' && this.blinkT < 0) this.blinkT = 0;
            if (e.kind === 'nod') { this.nodT = t; this.nodAmp = e.amt; }
          }
          continue;
        }
        if (d > e.dur + 0.6) continue;
        // ease in, hold, ease out
        const env = d < 0.15 ? d / 0.15 : d < e.dur ? 1 : 1 - (d - e.dur) / 0.6;
        const v = e.amt * env * env * (3 - 2 * env);
        if (e.kind === 'brow') { browL += v; browR += v * (e.asym ?? 1); }
        else if (e.kind === 'smile') smile = Math.max(smile, v);
        else if (e.kind === 'tilt') tilt += v;
      }
      this.afterSpeech = t;
      this.baseSmile = s.mood ?? 0.15;
      smile = Math.max(smile, this.baseSmile); // a pleasant face while talking, not a blank one
    } else {
      // after speaking: a warm closing smile that slowly relaxes
      const since = t - (this.afterSpeech ?? -99);
      if (since < 2.5) smile = Math.max(0.55 * (1 - since / 2.5), 0);
      // idle: now and then a faint smile or a small brow movement, as people do while listening
      if (t > (this.microAt ?? 0)) {
        const r = Math.random();
        this.micro = r < 0.45 ? { smile: 0.12 + Math.random() * 0.25 } : r < 0.65 ? { brow: 0.25 + Math.random() * 0.25, until: t + 0.6 } : {};
        this.microAt = t + 2 + Math.random() * 4;
      }
      const m = this.micro || {};
      smile = Math.max(smile, m.smile || 0);
      if (m.brow && t < m.until) browL = browR = m.brow;
    }
    const k = smile > ex.smile ? 0.18 : 0.45; // smiles grow faster than they fade
    ex.smile = smooth(ex.smile, clamp(smile, 0, 1), dt, k);
    ex.browL = smooth(ex.browL, clamp(browL, -0.6, 1), dt, 0.09);
    ex.browR = smooth(ex.browR, clamp(browR, -0.6, 1), dt, 0.09);
    ex.tilt = smooth(ex.tilt, clamp(tilt, -1, 1), dt, 0.35);
  }

  // what the face does, read from the text and its exact word timings
  _expressionEvents(al) {
    const chars = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds;
    const text = chars.join(''), ev = [], words = [];
    const re = /[A-Za-z0-9']+/g;
    let m;
    while ((m = re.exec(text))) {
      const a = m.index, b = a + m[0].length - 1;
      const after = text.slice(b + 1).match(/^[^A-Za-z0-9']*/)[0];
      words.push({ w: m[0].toLowerCase(), raw: m[0], ws: st[a], we: en[b], punct: (after.match(/[.!?,;:]/) || [''])[0] });
    }
    const POS = /^(hi|hello|hey|thanks|thank|love|loved|lovely|glad|happy|great|enjoy|enjoyed|welcome|nice|fun|excited|exciting|beautiful|wonderful|amazing|awesome|fantastic|good|best|delighted|pleasure|smile|cool|perfect|brilliant|congratulations|yay)$/;
    const EMPH = /^(really|very|so|truly|never|always|every|everything|all|absolutely|actually|important|only|most|just|huge|incredible|simple|simpler|easy|easier|real|whole|any|biggest|first|exactly|definitely)$/;
    const NEG = /^(no|not|don't|can't|won't|never|problem|problems|difficult|hard|sorry|unfortunately|complicated|worry|wrong|bad|issue|issues|careful|serious)$/;
    let sentStart = 0, posCount = 0;
    words.forEach((wd, i) => {
      const len = wd.we - wd.ws;
      // the start of each phrase: eyebrows lift a little as the thought begins
      if (i === sentStart && Math.random() < 0.7) ev.push({ t: wd.ws - 0.05, kind: 'brow', amt: 0.35 + Math.random() * 0.2, dur: 0.35, asym: 0.8 + Math.random() * 0.4 });
      if (POS.test(wd.w)) { posCount++; ev.push({ t: wd.ws - 0.2, kind: 'smile', amt: 0.75 + Math.random() * 0.25, dur: len + 1.0 }); }
      if (EMPH.test(wd.w) || (wd.raw.length >= 8 && Math.random() < 0.3)) {
        ev.push({ t: wd.ws - 0.04, kind: 'brow', amt: 0.6 + Math.random() * 0.3, dur: Math.max(0.25, len), asym: 0.75 + Math.random() * 0.5 });
        if (Math.random() < 0.6) ev.push({ t: wd.ws + 0.03, kind: 'nod', amt: 0.9 + Math.random() * 0.5 });
      }
      if (NEG.test(wd.w)) ev.push({ t: wd.ws - 0.05, kind: 'brow', amt: -0.45, dur: len + 0.3, asym: 1 });
      if (wd.punct === '?') {
        // questions: brows up and a head tilt over the last words
        const from = words[Math.max(sentStart, i - 2)].ws;
        const side = Math.random() < 0.5 ? -1 : 1;
        ev.push({ t: from, kind: 'brow', amt: 0.85, dur: wd.we - from + 0.3, asym: 0.85 + Math.random() * 0.3 });
        ev.push({ t: from, kind: 'tilt', amt: side, dur: wd.we - from + 0.5 });
      }
      if (wd.punct === '!') ev.push({ t: wd.ws, kind: 'brow', amt: 0.7, dur: len + 0.2 }, { t: wd.ws, kind: 'nod', amt: 1.3 });
      if (wd.punct === '.' || wd.punct === '!' || wd.punct === '?') {
        // end of a sentence: settle with a small nod and a blink in the pause
        if (wd.punct === '.') ev.push({ t: wd.we - 0.15, kind: 'nod', amt: 0.7 + Math.random() * 0.4 });
        ev.push({ t: wd.we + 0.08, kind: 'blink' });
        sentStart = i + 1;
      } else if (wd.punct && Math.random() < 0.5) ev.push({ t: wd.we + 0.05, kind: 'blink' });
    });
    ev.sort((a, b) => a.t - b.t);
    // overall mood: friendlier texts get a warmer resting face while speaking
    const mood = clamp(0.12 + (posCount / Math.max(1, words.length)) * 2, 0.12, 0.35);
    return { events: ev, mood };
  }

  _idle(t, dt) {
    const p = this.params;
    if (!this.manual || this.manual.blink === undefined) {
      if (this.blinkT < 0 && t > this.nextBlink) this.blinkT = 0;
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const d = this.blinkT;
        p.blink = d < 0.07 ? d / 0.07 : d < 0.1 ? 1 : Math.max(0, 1 - (d - 0.1) / 0.1);
        if (d > 0.2) {
          this.blinkT = -1;
          this.nextBlink = t + (Math.random() < 0.15 ? 0.25 : 2 + Math.random() * 4);
        }
      }
    } else p.blink = this.manual.blink;
    // live-DP mode moves like a person in conversation (without the mouth)
    const talking = !!(this.speech || this.analyser) || this.lively;
    this.turnAt ??= t + 0.5 + Math.random() * 3;
    this.turnTarget ??= 0;
    this.turn ??= 0;
    this.turnVel ??= 0;
    if (talking && !this.wasTalking) this.turnAt = Math.min(this.turnAt, t + 0.5);
    this.wasTalking = talking;

    // head turns: while talking the head looks around naturally (one side, other side,
    // back to you); when idle it mostly rests facing you
    if (t > this.turnAt) {
      const side = () => (Math.random() < 0.5 ? -1 : 1);
      if (talking) {
        const toCenter = this.turnTarget !== 0 && Math.random() < 0.4;
        const dir = this.turnTarget === 0 ? side() : (Math.random() < 0.6 ? -1 : 1) * Math.sign(this.turnTarget);
        this.turnTarget = toCenter ? 0 : dir * (0.45 + Math.random() * 0.55);
        this.turnAt = t + 1.4 + Math.random() * 2.2;
      } else {
        const away = this.turnTarget === 0 && Math.random() < 0.4;
        this.turnTarget = away ? side() * (0.25 + Math.random() * 0.3) : 0;
        this.turnAt = t + (away ? 1.5 + Math.random() * 2 : 3 + Math.random() * 4);
      }
      // the eyes lead the turn, then settle back on you
      if (this.turnTarget !== 0) {
        this.gazeTarget = [Math.sign(this.turnTarget) * 0.6, 0];
        this.nextGaze = t + 0.35 + Math.random() * 0.3;
      }
    }
    // eye glances: small, quick, both eyes together; mostly looking at you
    if (t > this.nextGaze) {
      const r = Math.random();
      this.gazeTarget = r < 0.55 ? [0, 0] : r < 0.85
        ? [(Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.5]
        : [(Math.random() - 0.5) * 0.6, -0.6 - Math.random() * 0.3]; // thinking glance up
      this.nextGaze = t + (talking ? 0.7 + Math.random() * 1.6 : 1.2 + Math.random() * 2.8);
    }
    // slightly under-damped spring: eases in and settles with a tiny natural overshoot
    const k = 4.5, acc = k * k * (this.turnTarget - this.turn) - 2 * 0.8 * k * this.turnVel;
    this.turnVel += acc * dt;
    this.turn += this.turnVel * dt;

    // nods land on stressed syllables
    this.talkAmt = smooth(this.talkAmt ?? 0, talking ? 1 : 0, dt, 0.8);
    const nodGap = this.motion > 1 ? 0.6 : 0.8, nodOdds = this.motion > 1 ? 0.7 : 0.55;
    if (talking && p.jaw > 0.5 && (this.prevJaw ?? 0) <= 0.5 && t - (this.nodT ?? 0) > nodGap && Math.random() < nodOdds) {
      this.nodT = t;
      this.nodAmp = 0.6 + Math.random() * 0.6;
    }
    this.prevJaw = p.jaw;
    // idle with more motion: now and then a small nod or a thoughtful tilt, so he never looks frozen
    if (this.motion > 1 && !talking && t - (this.nodT ?? 0) > 3 && Math.random() < dt * 0.25) {
      this.nodT = t;
      this.nodAmp = 0.5 + Math.random() * 0.5;
    }
    if (this.motion > 1 && t > (this.tiltAt ?? 0)) {
      this.tiltTarget = Math.random() < 0.45 ? 0 : (Math.random() - 0.5) * (talking ? 1.4 : 0.9);
      this.tiltAt = t + (talking ? 1.2 + Math.random() * 2 : 2.5 + Math.random() * 3.5);
    }
    this.idleTilt = smooth(this.idleTilt ?? 0, this.tiltTarget ?? 0, dt, 0.5);
    // live-DP mode: an occasional small nod
    if (this.lively && !this.speech && t - (this.nodT ?? 0) > 1.8 && Math.random() < dt * 0.6) {
      this.nodT = t;
      this.nodAmp = 0.8 + Math.random() * 0.7;
    }
    p.gx = smooth(p.gx, this.gazeTarget[0], dt, 0.035);
    p.gy = smooth(p.gy, this.gazeTarget[1], dt, 0.035);
  }

  _deform(t) {
    const T = t * this.rate + this.seed; // this avatar's own clock for continuous motion
    const r = this.rig, P = r.pts, n = P.length, p = this.params, F = r.face, pos = this.pos;
    const talk = clamp(this.energy * 2, 0, 1);
    const turn = this.turn || 0, ta = this.talkAmt || 0;
    let nod = 0;
    if (this.nodT) {
      const d = (t - this.nodT) / 0.5;
      if (d < 1) nod = this.nodAmp * Math.sin(d * Math.PI) * (1 - d * 0.3);
    }
    // angles (radians): organic drift + turns + nods
    const M = this.motion;
    // The 3D turn below WARPS the face by depth, which looks like plastic when large, so it
    // stays at its original small size. Extra motion (M > 1) moves the head as one solid
    // piece instead (shift, dip, tilt), so the face itself never changes shape.
    let yawA = (0.02 + 0.025 * ta) * noise2(T * 0.35, 1) + turn * 0.06;
    let pitchA = (0.012 + 0.012 * ta) * noise2(T * 0.45, 2) + 0.02 * nod;
    const extra = Math.max(0, M - 1);
    // Extra motion is ONLY rotation of the head about the neck (the roll below): no sliding,
    // no bouncing, no body lean — a real neck turns, it does not translate.
    const em = this.emo;
    pitchA += em.pitch * 0.03 + em.bounce * 0.012 * Math.sin(t * 9); // laugh bounces the head
    let roll = (0.006 + 0.007 * ta) * (1 + extra * 0.6) * noise2(T * 0.3, 3) + turn * 0.012 + (this.ex.tilt + em.tilt) * 0.045
      + extra * ((this.idleTilt || 0) * 0.035 + turn * 0.022);
    pitchA -= Math.abs(this.ex.tilt) * 0.01; // chin lifts a touch on a question
    const H3 = this.head3d;
    // live-DP mode: a bit more movement so it clearly feels alive
    const L = this.lively && !this.speech ? 1.6 : 1;
    yawA *= L; pitchA *= L; roll *= L;
    if (this.fixedPose) ({ yawA, pitchA, roll } = this.fixedPose); // looping export drives the pose itself
    const cr = Math.cos(roll), sr = Math.sin(roll), [px, py] = this.pivot;
    // body language: slow sway, breathing, and a shrug now and then while talking
    // body language: slow sway, breathing, and a shrug now and then while talking
    let sway = 0.004 * Math.sin(T * 0.31) + 0.003 * Math.sin(T * 0.73 + 1) + talk * 0.005 * Math.sin(T * 1.1)
      // a slight, slow turn of the whole upper body about the hips (an axis, never a slide),
      // following the head a little
      + extra * (0.004 * turn + 0.003 * noise2(T * 0.18, 24));
    const breath = F.h * 0.007 * (0.5 + 0.5 * Math.sin(T * 1.5));
    if (talk > 0.3 && !this.shrugT && Math.random() < 0.004) this.shrugT = t;
    let shrug = 0;
    if (this.shrugT) {
      const d = (t - this.shrugT) / 0.7;
      if (d > 1) this.shrugT = 0; else shrug = F.h * 0.014 * Math.sin(d * Math.PI);
    }
    let lift = breath + shrug;
    if (this.fixedPose) ({ sway, lift } = this.fixedPose);
    const bc = Math.cos(sway), bs = Math.sin(sway), { px: bx, py: by } = this.body;
    // slow, gentle wander of both eyes together (on top of the occasional quick glance)
    let dX = 0.35 * noise2(T * 0.16, 11), dY = 0.22 * noise2(T * 0.12, 13);
    if (this.fixedPose) ({ dX, dY } = this.fixedPose);
    const gxs = F.w * 0.017 * (p.gx + dX + em.gx), gys = F.h * 0.009 * (p.gy + dY + em.gy);
    this._gaze = [gxs, gys]; // the iris discs use this (real eyes)
    // the script's own smiles fade out when the emotion is sad or angry
    const keepSmile = clamp(1 - (em.frown + em.furrow + em.browIn) * 1.5, 0, 1);
    const sm = Math.max(this.ex.smile * keepSmile, em.smile);
    const bL = this.ex.browL + em.browUp + em.browL, bR = this.ex.browR + em.browUp + em.browR;
    this.lidClose = em.lid; // read by the eyelid drawing too

    for (let i = 0; i < n; i++) {
      let [x, y] = P[i];
      x += p.wide * this.Wdx[i] + p.round * this.Rdx[i];
      y += p.jaw * this.Jdy[i] + p.upper * this.Udy[i] + p.wide * this.Wdy[i] + p.round * this.Rdy[i];
      y += (p.tuck || 0) * this.LTdy[i];
      if (this.speechV2) y += p.jaw * p.jaw * this.Jfs[i]; // hinged jaw: chin tips back as it opens
      const hwM = this.m.hw;
      if (this.speechV2 && (this.speech || this.manual)) {
        const open = p.jaw * (1 - p.lipClose);
        // upper lip lifts as the mouth opens (more in the middle), showing the teeth
        y += open * (this.lipShape.upLift ?? 1.4) * this.Udy[i] * (0.6 + 0.4 * this.LipC[i]);
        // the two sides never move exactly alike
        y += p.jaw * this.Jdy[i] * this.LipM[i] * p.asym * (P[i][0] > this.m.mcx ? 1 : -1);
        // cheeks: lift on smiley/ee sounds, pulled down a little as the jaw opens, drawn in on oo/w
        const ck = this.CkG[i];
        if (ck > 0.01) {
          y += ck * F.h * (-0.013 * clamp(p.wide, 0, 1.2) + 0.008 * p.jaw);
          x += ck * this.CkS[i] * hwM * (0.035 * clamp(p.wide, 0, 1.2) - 0.06 * p.round);
        }
      }
      if (p.lipClose > 0.001) {
        // M/B/P: lips press together even though the jaw is still partly open
        y -= p.lipClose * p.jaw * this.Jdy[i] * this.LipM[i] * 0.92;
        y -= p.lipClose * p.upper * this.Udy[i] * 0.9;
      }
      x += sm * this.Smx[i] + em.smirkR * this.SkRx[i] + em.furrow * this.FUdx[i] + em.frown * this.FRdx[i];
      y += sm * this.Smy[i] + em.smirkR * this.SkRy[i] + bL * this.BrL[i] + bR * this.BrR[i]
        + em.browIn * this.BIdy[i] + em.furrow * this.FUdy[i] + em.frown * this.FRdy[i] + em.squint * this.LLdy[i];
      // eyelids: blinks on top of how open the emotion holds the eyes
      // (a held lid only lowers the eyelid itself; the iris stays put)
      const lidHold = this.iris[i] ? 0 : em.lid;
      let close = p.blink + lidHold * (1 - p.blink);
      if (this.side[i]) close = Math.max(close, em.winkR); // wink: right-hand eye only
      y += close * (1 - sm * 0.25) * this.Bdy[i];
      if (this.iris[i] && !this._eyes) { x += gxs * (1 - p.blink); y += gys * (1 - p.blink); }
      const w = r.headW[i];
      if (w > 0) {
        const ox = x - px, oy = y - py;
        const rx = px + ox * cr - oy * sr, ry = py + ox * sr + oy * cr;
        // 3D turn: each point moves by how far it sticks out toward the viewer
        const z = this.z3[i];
        x += w * (rx - x + yawA * H3.rx * z);
        y += w * (ry - y + pitchA * H3.ry * z);
      }
      if (this.Sway[i] > 0) {
        y -= lift * this.Lift[i];
        const k = this.Sway[i], ox = x - bx, oy = y - by;
        x += k * (bx + ox * bc - oy * bs - x);
        y += k * (by + ox * bs + oy * bc - y);
      }
      pos[i * 2] = x;
      pos[i * 2 + 1] = y;
    }
  }

  // Frames for a seamless looping GIF/video: every movement completes whole cycles in `seconds`,
  // so the last frame flows straight back into the first. Rendered square at `size` px.
  async renderLoop({ seconds = 4, fps = 15, size = 360, background = '#111', onProgress = () => {} } = {}) {
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'fixed', left: '-10000px', top: '0', width: size + 'px', height: size + 'px' });
    document.body.appendChild(box);
    const r = new TalkingAvatar(box, this.rig, this.img, { maskImg: this.maskImg, view: 'circle' });
    r._dead = true;          // no live animation: we drive it frame by frame
    r._resize = () => {};    // fixed output size, whatever the screen
    r.setViewRect(this.view);
    for (const cv of [r.back, r.front, r.lidCv]) { cv.width = size; cv.height = size; }
    r.gl.viewport(0, 0, size, size);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const n = Math.round(seconds * fps), w = (2 * Math.PI) / seconds, F = this.rig.face, frames = [];
    for (let i = 0; i < n; i++) {
      const t = i / fps, p = r.params;
      const nod = Math.max(0, Math.sin(2 * w * t - 0.6)) ** 3;
      r.fixedPose = {
        yawA: 0.07 * Math.sin(w * t) + 0.02 * Math.sin(2 * w * t + 1),
        pitchA: 0.016 * Math.sin(2 * w * t + 0.4) + 0.022 * nod,
        roll: 0.014 * Math.sin(w * t + 2),
        sway: 0.004 * Math.sin(w * t + 0.5),
        lift: F.h * 0.007 * (0.5 + 0.5 * Math.sin(2 * w * t)),
        dX: 0.5 * Math.sin(w * t + 0.9), dY: 0.18 * Math.sin(2 * w * t + 2),
      };
      Object.assign(p, { jaw: 0, round: 0, upper: 0, gx: 0, gy: 0, wide: Math.max(0, 0.18 + 0.2 * Math.sin(w * t - 1.2)) });
      const bt = t - seconds * 0.62; // one blink per loop
      p.blink = Math.abs(bt) < 0.1 ? 1 - Math.abs(bt) / 0.1 : 0;
      r._deform(t);
      r._draw();
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(r.back, 0, 0);
      ctx.drawImage(r.front, 0, 0);
      ctx.drawImage(r.lidCv, 0, 0);
      frames.push(ctx.getImageData(0, 0, size, size));
      onProgress((i + 1) / n);
      if (i % 4 === 3) await new Promise((res) => setTimeout(res, 0)); // keep the page responsive
    }
    r.destroy();
    box.remove();
    return { frames, delay: Math.round(1000 / fps), size };
  }

  _draw() {
    const gl = this.gl, [vx, vy, vw, vh] = this.view;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4f(this.uView, vx, vy, vw, vh);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pos);
    gl.drawElements(gl.TRIANGLES, this.nIdx, gl.UNSIGNED_SHORT, 0);
    this._drawMouth();
    this._drawLids();
    this._drawLipEdge();
  }

  // lips roll softly into the mouth: a gentle shadow along the opening instead of a hard cut edge
  _drawLipEdge() {
    const L = this._lipEdge;
    if (!L) return;
    const ctx = this.lctx, { up, lo, hw } = L;
    ctx.save();
    ctx.filter = `blur(${Math.max(0.6, hw * 0.035)}px)`;
    ctx.beginPath();
    up.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    [...lo].reverse().forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(45,12,12,0.35)';
    ctx.lineWidth = Math.max(1.2, hw * 0.07);
    ctx.lineJoin = 'round';
    ctx.stroke();
    // the wet inner edge of the lower lip catches a little light
    ctx.beginPath();
    lo.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + hw * 0.03) : ctx.moveTo(x, y + hw * 0.03)));
    ctx.strokeStyle = 'rgba(255,225,220,0.12)';
    ctx.lineWidth = Math.max(0.8, hw * 0.025);
    ctx.stroke();
    ctx.restore();
  }

  // tooth colour for this photo: warm ivory, as bright as the photo's own lighting allows, a touch of the lips' tint
  _mouthColors() {
    const P = this.rig.pts, img = this.img;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = iw; c.height = ih;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const avg = (ids) => {
      let r = 0, gr = 0, b = 0, n = 0;
      for (const i of ids) {
        const x = Math.round(P[i][0]), y = Math.round(P[i][1]);
        if (x < 2 || y < 2 || x >= iw - 2 || y >= ih - 2) continue;
        const d = g.getImageData(x - 2, y - 2, 5, 5).data;
        for (let q = 0; q < d.length; q += 4) { r += d[q]; gr += d[q + 1]; b += d[q + 2]; n++; }
      }
      return n ? [r / n, gr / n, b / n] : [200, 160, 140];
    };
    const skin = avg([205, 425, 50, 280, 151]), lip = avg([0, 17, 37, 267, 84, 314]);
    const lum = (0.299 * skin[0] + 0.587 * skin[1] + 0.114 * skin[2]) / 255;
    const k = clamp(0.7 + lum * 0.5, 0.84, 1);
    const ivory = [238, 230, 216];
    const tooth = ivory.map((v, i) => (v * 0.9 + lip[i] * 0.1) * k);
    const gum = [lip[0] * 0.95 + 20, lip[1] * 0.7, lip[2] * 0.72].map((v) => Math.min(255, v * k)); // gums: pinker than the lips
    return { tooth, gum, k };
  }

  // the colour of each eyelid's skin, taken from the photo (between the lash line and the crease)
  _lidColors() {
    const P = this.rig.pts, img = this.img;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = iw; c.height = ih;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return Object.values(this.rig.eyes).map((e) => {
      let r = 0, gr = 0, b = 0, n = 0;
      const k = Math.min(e.upper.length, e.crease.length);
      for (let j = 2; j < k - 2; j++) {
        const [ux, uy] = P[e.upper[j]], [cx, cy] = P[e.crease[j]];
        for (const f of [0.45, 0.6, 0.75]) {
          const x = Math.round(ux + (cx - ux) * f), y = Math.round(uy + (cy - uy) * f);
          if (x < 1 || y < 1 || x >= iw - 1 || y >= ih - 1) continue;
          const d = g.getImageData(x - 1, y - 1, 3, 3).data;
          for (let q = 0; q < d.length; q += 4) { r += d[q]; gr += d[q + 1]; b += d[q + 2]; n++; }
        }
      }
      return n ? [r / n, gr / n, b / n] : [180, 130, 110];
    });
  }

  // ---- real eyes: each iris is a solid round disc that moves as one piece, clipped by the eyelids ----
  _prepEyes() {
    const P = this.rig.pts, img = this.img;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = iw; c.height = ih;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const inPoly = (poly, x, y) => {
      let ins = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    };
    const eyes = [];
    for (const e of Object.values(this.rig.eyes)) {
      if (!e.iris || e.iris.length < 5) continue;
      const [ci, ...ring] = e.iris;
      const [cx, cy] = P[ci];
      const R = ring.reduce((s, i) => s + Math.hypot(P[i][0] - cx, P[i][1] - cy), 0) / ring.length;
      if (!(R > 1)) continue;
      const open = [...e.upper.map((i) => P[i]), ...[...e.lower].reverse().map((i) => P[i])];
      const pad = 3, x0 = Math.floor(cx - R - pad), y0 = Math.floor(cy - R - pad), S = Math.ceil(2 * R + 2 * pad);
      if (x0 < 1 || y0 < 1 || x0 + S >= iw - 1 || y0 + S >= ih - 1) continue;
      const src = g.getImageData(x0, y0, S, S), d = src.data;
      // 1) the iris disc; the parts hidden under the lids get the iris's own edge colour
      let er = 0, eg = 0, eb = 0, en = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const px = x0 + x + 0.5, py = y0 + y + 0.5, dd = Math.hypot(px - cx, py - cy);
        if (dd > R * 0.7 && dd < R && inPoly(open, px, py)) { const q = (y * S + x) * 4; er += d[q]; eg += d[q + 1]; eb += d[q + 2]; en++; }
      }
      const edge = en ? [er / en, eg / en, eb / en] : [60, 40, 30];
      const crop = document.createElement('canvas');
      crop.width = crop.height = S;
      const cd = crop.getContext('2d').createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const px = x0 + x + 0.5, py = y0 + y + 0.5, dd = Math.hypot(px - cx, py - cy), q = (y * S + x) * 4;
        const a = clamp(R + 0.5 - dd, 0, 1);
        if (a <= 0) continue;
        const vis = inPoly(open, px, py);
        cd.data[q] = vis ? d[q] : edge[0]; cd.data[q + 1] = vis ? d[q + 1] : edge[1]; cd.data[q + 2] = vis ? d[q + 2] : edge[2];
        cd.data[q + 3] = a * 255;
      }
      crop.getContext('2d').putImageData(cd, 0, 0);
      // 2) eye white where the iris was: each row blended from the white on its left and right
      const R2 = R + 1.5;
      for (let y = 0; y < S; y++) {
        const py = y0 + y + 0.5, dy = py - cy;
        if (Math.abs(dy) > R2) continue;
        const half = Math.sqrt(R2 * R2 - dy * dy);
        const xl = Math.floor(cx - half - x0) - 1, xr = Math.ceil(cx + half - x0) + 1;
        const okL = xl >= 0 && inPoly(open, x0 + xl + 0.5, py), okR = xr < S && inPoly(open, x0 + xr + 0.5, py);
        if (!okL && !okR) continue;
        const col = (xx) => { const q = (y * S + xx) * 4; return [d[q], d[q + 1], d[q + 2]]; };
        const L = okL ? col(xl) : col(xr), Rr = okR ? col(xr) : col(xl);
        for (let x = Math.max(0, xl + 1); x < Math.min(S, xr); x++) {
          const px = x0 + x + 0.5;
          if (Math.hypot(px - cx, dy) > R2 || !inPoly(open, px, py)) continue;
          const t = (x - xl) / Math.max(1, xr - xl), q = (y * S + x) * 4;
          for (let k = 0; k < 3; k++) d[q + k] = L[k] + (Rr[k] - L[k]) * t;
        }
      }
      g.putImageData(src, x0, y0);
      const cMid = [(P[e.upper[0]][0] + P[e.upper[e.upper.length - 1]][0]) / 2, (P[e.upper[0]][1] + P[e.upper[e.upper.length - 1]][1]) / 2];
      eyes.push({ e, crop, half: S / 2, off: [cx - cMid[0] + (x0 + S / 2 - cx), cy - cMid[1] + (y0 + S / 2 - cy)] });
    }
    if (!eyes.length) return;
    this._eyes = eyes;
    this.texImg = c; // photo with clean eye whites (the irises are drawn on top)
  }

  _drawIrises() {
    const ctx = this.lctx, cv = this.lidCv, [vx, vy, vw, vh] = this.view, pos = this.pos;
    const sx = cv.width / vw, sy = cv.height / vh, [gx, gy] = this._gaze || [0, 0];
    const S = (i) => [(pos[i * 2] - vx) * sx, (pos[i * 2 + 1] - vy) * sy];
    for (const { e, crop, half, off } of this._eyes) {
      const a = S(e.upper[0]), b = S(e.upper[e.upper.length - 1]);
      // centre follows the eye corners (head motion), plus where the eyes look
      const cx = (a[0] + b[0]) / 2 + (off[0] + gx) * sx, cy = (a[1] + b[1]) / 2 + (off[1] + gy) * sy;
      ctx.save();
      ctx.beginPath();
      e.upper.forEach((i, j) => { const [x, y] = S(i); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      [...e.lower].reverse().forEach((i) => { const [x, y] = S(i); ctx.lineTo(x, y); });
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(crop, cx - half * sx, cy - half * sy, half * 2 * sx, half * 2 * sy);
      // the upper lid casts a soft shadow onto the top of the eye
      const top = Math.min(...e.upper.map((i) => S(i)[1]));
      const sh = ctx.createLinearGradient(0, top, 0, top + half * sy * 0.9);
      sh.addColorStop(0, 'rgba(20,10,8,0.28)');
      sh.addColorStop(1, 'rgba(20,10,8,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(cx - half * 3 * sx, top - 2, half * 6 * sx, half * sy * 0.9 + 2);
      ctx.restore();
    }
  }

  // Blinks with the person's real eyelid: the photo's own lid skin (crease down to the lash line) is cut
  // into thin vertical strips and each strip is stretched from the crease down to where the lid is now.
  // Open eye = every strip sits where it came from (no change); closing = real skin and lashes slide down.
  _drawRealLids(base, wink) {
    const ctx = this.lctx, cv = this.lidCv, [vx, vy, vw, vh] = this.view, pos = this.pos, P = this.rig.pts;
    const sx = cv.width / vw, sy = cv.height / vh;
    const cur = (i) => [(pos[i * 2] - vx) * sx, (pos[i * 2 + 1] - vy) * sy];
    const byX = (pts) => [...pts].sort((a, b) => a[0] - b[0]);
    for (const e of Object.values(this.rig.eyes)) {
      const bf = this.side[e.upper[4]] ? Math.max(base, wink) : base;
      if (bf < 0.03) continue;
      const restUp = byX(e.upper.map((i) => P[i])), restCr = byX(e.crease.map((i) => P[i]));
      const curUp = byX(e.upper.map(cur)), curCr = byX(e.crease.map(cur));
      const [ax, bx] = [restUp[0][0], restUp[restUp.length - 1][0]];
      const [cax, cbx] = [curUp[0][0], curUp[curUp.length - 1][0]];
      const N = 18;
      ctx.save();
      // keep it inside the lid area (crease down to the lid edge)
      ctx.beginPath();
      curCr.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      [...curUp].reverse().forEach(([x, y]) => ctx.lineTo(x, y + 1));
      ctx.closePath();
      ctx.clip();
      for (let j = 0; j < N; j++) {
        const t0 = j / N, t1 = (j + 1) / N, tm = (t0 + t1) / 2;
        const sxa = ax + (bx - ax) * t0, sxb = ax + (bx - ax) * t1, sxm = (sxa + sxb) / 2;
        const sTop = polyInterp(restCr, sxm), sBot = polyInterp(restUp, sxm) + 0.6;
        const dxa = cax + (cbx - cax) * t0, dxb = cax + (cbx - cax) * t1, dxm = cax + (cbx - cax) * tm;
        const dTop = polyInterp(curCr, dxm), dBot = polyInterp(curUp, dxm) + 0.6 * sy;
        if (sBot - sTop < 0.5 || dBot - dTop < 0.5) continue;
        ctx.drawImage(this.img, sxa, sTop, sxb - sxa, sBot - sTop, dxa - 0.3, dTop, dxb - dxa + 0.6, dBot - dTop);
      }
      ctx.restore();
    }
  }

  // blinks: a real eyelid (skin colour + lash line) slides down over the whole eye
  _drawLids() {
    const ctx = this.lctx, cv = this.lidCv, [vx, vy, vw, vh] = this.view, pos = this.pos;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (this._eyes) this._drawIrises();
    const b = this.params.blink, lid = Math.max(0, this.lidClose || 0), wink = this.emo?.winkR || 0;
    const base = (b + lid * (1 - b)) * (1 - (this.ex?.smile || 0) * 0.25);
    if (Math.max(base, wink) < 0.04) return;
    if (this.speechV2) return this._drawRealLids(base, wink);
    this._lidCol ||= this._lidColors();
    const sx = cv.width / vw, sy = cv.height / vh;
    Object.values(this.rig.eyes).forEach((e, k) => {
      const bf = this.side[e.upper[4]] ? Math.max(base, wink) : base;
      if (bf < 0.04) return;
      const cur = e.upper.map((i) => [(pos[i * 2] - vx) * sx, (pos[i * 2 + 1] - vy) * sy]);
      const rest = e.upper.map((i, j) => [cur[j][0], cur[j][1] - bf * this.Bdy[i] * sy]);
      const lo = e.lower.map((i) => [(pos[i * 2] - vx) * sx, (pos[i * 2 + 1] - vy) * sy]);
      const h = Math.max(...e.upper.map((i) => this.Bdy[i])) * sy; // open-eye height on screen
      const top = Math.min(...rest.map((p) => p[1])) - 1, bot = Math.max(...cur.map((p) => p[1]));
      const [r, g, b] = this._lidCol[k];
      const shade = (f) => `rgb(${r * f | 0},${g * f | 0},${b * f | 0})`;
      ctx.save();
      // only near full closure: a half-closed eye is just the real eyelid bent down (no painted lid)
      ctx.globalAlpha = clamp((bf - 0.55) / 0.3, 0, 1);
      if (ctx.globalAlpha <= 0) { ctx.restore(); return; }
      ctx.filter = `blur(${Math.max(0.4, h * 0.06)}px)`;
      // lid skin: from the open eye's top edge down to where the lid is now
      ctx.beginPath();
      rest.forEach(([x, y], j) => (j ? ctx.lineTo(x, y - 0.8) : ctx.moveTo(x, y - 0.8)));
      [...cur].reverse().forEach(([x, y]) => ctx.lineTo(x, y + 0.6));
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, top, 0, Math.max(bot, top + 1));
      grad.addColorStop(0, shade(0.97));
      grad.addColorStop(0.7, shade(0.9));
      grad.addColorStop(1, shade(0.72));
      ctx.fillStyle = grad;
      ctx.fill();
      // lash line along the lid's edge, strongest when fully closed
      ctx.beginPath();
      cur.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = `rgba(28,18,14,${0.35 + 0.55 * bf})`;
      ctx.lineWidth = Math.max(1, h * 0.16);
      ctx.lineCap = 'round';
      ctx.stroke();
      // lower lid stays defined: a faint line where the lids meet
      if (bf > 0.8) {
        ctx.beginPath();
        lo.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = 'rgba(40,25,20,0.25)';
        ctx.lineWidth = Math.max(0.6, h * 0.06);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  _drawMouth() {
    const ctx = this.ctx, cv = this.back, [vx, vy, vw, vh] = this.view, pos = this.pos;
    const sx = cv.width / vw, sy = cv.height / vh;
    const S = (i) => [(pos[i * 2] - vx) * sx, (pos[i * 2 + 1] - vy) * sy];
    const M = this.rig.mouth;
    const up = M.upperIn.map(S), lo = M.lowerIn.map(S);
    // the dark fill reaches out to the outer lip corners, so the small gaps the mesh leaves there
    // show the shadow of a real mouth corner instead of whatever is behind the avatar
    const cL = S(M.upperOut[0]), cR = S(M.upperOut[M.upperOut.length - 1]);
    const fillPath = () => {
      ctx.beginPath();
      ctx.moveTo(cL[0], cL[1]);
      up.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(cR[0], cR[1]);
      [...lo].reverse().forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.closePath();
    };
    ctx.clearRect(0, 0, cv.width, cv.height);
    this._lipEdge = null;
    // opening height: lower lip vs upper lip at the same x (the two lips may have different point counts)
    const upByX = [...up].sort((p, q) => p[0] - q[0]);
    const gap = Math.max(...lo.map((p) => p[1] - polyInterp(upByX, p[0])));
    const open = this.params.jaw + this.params.upper * 0.5;
    if (gap < 0.5 || open < 0.02 || this.rig.realTeeth) {
      // real-teeth photos: the photo's teeth are drawn by WebGL; only the opening between them is dark here
      // lips slightly apart at rest: show a dark mouth, never the background behind it
      ctx.fillStyle = '#2a0f10';
      fillPath();
      ctx.fill();
      return;
    }
    this._lipEdge = { up, lo, hw: Math.abs(up[up.length - 1][0] - up[0][0]) / 2 };
    const vis = clamp((open - 0.02) / 0.25, 0, 1); // fade the interior in as the mouth opens
    const upS = [...up].sort((a, b) => a[0] - b[0]), loS = [...lo].sort((a, b) => a[0] - b[0]);
    const x0 = upS[0][0], x1 = upS[upS.length - 1][0];
    const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
    const top = Math.min(...up.map((p) => p[1])), bot = Math.max(...lo.map((p) => p[1]));
    const yUp = (x) => polyInterp(upS, x), yLo = (x) => polyInterp(loS, x);
    const mouthPath = fillPath;
    const rrect = (x, y, w, h, rTop, rBot) => {
      ctx.beginPath();
      ctx.moveTo(x + rTop, y);
      ctx.lineTo(x + w - rTop, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rTop);
      ctx.lineTo(x + w, y + h - rBot);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rBot, y + h);
      ctx.lineTo(x + rBot, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rBot);
      ctx.lineTo(x, y + rTop);
      ctx.quadraticCurveTo(x, y, x + rTop, y);
      ctx.closePath();
    };

    ctx.save();
    mouthPath();
    ctx.clip();
    ctx.fillStyle = '#1a0607';
    ctx.fillRect(x0 - 6, top - 6, hw * 2 + 12, bot - top + 12);
    ctx.globalAlpha = vis;

    // dark cavity, darker toward the corners and the back
    const cav = ctx.createRadialGradient(cx, top + gap * 0.6, hw * 0.1, cx, top + gap * 0.6, hw * 1.1);
    cav.addColorStop(0, '#3a0f10');
    cav.addColorStop(1, '#0c0203');
    ctx.fillStyle = cav;
    ctx.fillRect(x0 - 6, top - 6, hw * 2 + 12, bot - top + 12);

    // tongue, low and behind the lower teeth
    const tg = ctx.createRadialGradient(cx, bot, hw * 0.1, cx, bot, hw * 0.8);
    tg.addColorStop(0, this.speechV2 ? '#5c2427' : '#7a3134');
    tg.addColorStop(1, this.speechV2 ? '#260a0b' : '#3a1214');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(cx, bot + gap * (this.speechV2 ? 0.45 : 0.15), hw * 0.7, Math.max(gap * 0.5, hw * 0.12), 0, 0, Math.PI * 2);
    ctx.fill();

    // Teeth are attached to the head, not the lips: fixed size and position from the
    // resting face, moved only by head motion (upper) and the jaw (lower). Lips just
    // cover/uncover them through the clip.
    const P0 = this.rig.pts;
    const R = (i) => [(P0[i][0] - vx) * sx, (P0[i][1] - vy) * sy];
    const [nx, ny] = S(2), [nx0, ny0] = R(2);           // nose base: follows the head only
    const [, cyN] = S(152), [, cy0] = R(152);           // chin: follows the jaw
    const jawDrop = (cyN - cy0) - (ny - ny0);
    // teeth sized from this mouth: the row spans corner to corner, front teeth about a third of the width
    const HW = this.anat.mouthHalf * 0.98 * sx;
    const soft = Math.max(0.35, sx * 0.8); // as soft as the photo itself (one photo pixel of blur)
    const ax = (this.m.mcx - vx) * sx + (nx - nx0), ay = (this.m.mcy - vy) * sy + (ny - ny0);
    // ---- teeth: drawn one by one like real teeth (gum, rounded tips, small dark gaps between) ----
    this._mcol ||= this._mouthColors();
    const { tooth: TC, gum: GC } = this._mcol;
    const rgb = (c, f, a = 1) => `rgba(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0},${a})`;
    // half a row from the centre out: [width, crown length]; teeth narrow toward the back as the arch turns away
    const UPPER = [[0.29, 0.42], [0.2, 0.36], [0.15, 0.37], [0.11, 0.31], [0.085, 0.27]];
    const LOWER = [[0.15, 0.28], [0.14, 0.28], [0.13, 0.28], [0.1, 0.25], [0.085, 0.22]];
    const row = (upper) => {
      const spec = upper ? UPPER : LOWER, teeth = [];
      for (const sgn of [-1, 1]) {
        let o = 0;
        spec.forEach(([w, h], k) => {
          const j = Math.sin(k * 12.9898 + sgn * 4.1414 + (upper ? 0 : 7)) * 0.5; // fixed small unevenness
          teeth.push({ c: sgn * (o + w / 2), w, h: h * (1 + j * 0.05), k, j, sgn });
          o += w;
        });
      }
      // biting edges follow the smile curve (centre lowest); lower teeth sit a little behind
      const A = this.anat;
      const edge = (off) => (upper
        ? ay + A.upLip * sy * 0.22 - HW * 0.14 * off * off
        : ay + A.loLip * sy * 0.18 + jawDrop - HW * 0.06 * off * off);
      ctx.save();
      ctx.filter = `blur(${soft}px)`;
      // gum behind the teeth (shows as small pink points between the teeth near the top)
      const gumY = upper ? Math.min(...teeth.map((t) => edge(t.c) - t.h * HW)) : Math.max(...teeth.map((t) => edge(t.c) + t.h * HW));
      const xs = teeth.map((t) => ax + t.c * HW);
      const xL = Math.min(...xs) - HW * 0.1, xR = Math.max(...xs) + HW * 0.1;
      const gg = ctx.createLinearGradient(0, gumY, 0, gumY + (upper ? HW * 0.16 : -HW * 0.16));
      gg.addColorStop(0, rgb(GC, 0.9));
      gg.addColorStop(1, rgb(GC, 0.9, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(xL, upper ? gumY - HW * 0.4 : gumY - HW * 0.16, xR - xL, HW * 0.56);
      // back teeth first, front teeth last (they overlap a touch, like a real arch)
      for (const t of [...teeth].sort((p, q) => q.k - p.k)) {
        const pad = t.w * HW * 0.035, x0 = ax + (t.c - t.w / 2) * HW + pad, x1 = ax + (t.c + t.w / 2) * HW - pad;
        const w = x1 - x0, xm = (x0 + x1) / 2, yE = edge(t.c), len = t.h * HW;
        const yG = upper ? yE - len : yE + len;          // gum end of the tooth
        const arch = w * 0.22 * (upper ? -1 : 1);        // gum line arches over each tooth
        const rMid = w * (t.k === 2 ? 0.42 : 0.2), rOut = w * (t.k === 2 ? 0.42 : 0.34); // canines come to a rounded point
        const rL = t.c < 0 ? rOut : rMid, rR = t.c < 0 ? rMid : rOut;
        const dir = upper ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x0, yG - arch * 0.2);
        ctx.quadraticCurveTo(xm, yG + arch, x1, yG - arch * 0.2);
        ctx.lineTo(x1, yE - dir * rR);
        ctx.quadraticCurveTo(x1, yE + dir * w * 0.02, x1 - rR, yE + dir * w * 0.02);
        ctx.quadraticCurveTo(xm, yE + dir * w * 0.05, x0 + rL, yE + dir * w * 0.02);
        ctx.quadraticCurveTo(x0, yE + dir * w * 0.02, x0, yE - dir * rL);
        ctx.closePath();
        // shade: creamy at the gum, brightest in the middle, a little see-through at the tip; back teeth darker
        const depth = (0.9 - t.k * (upper ? 0.1 : 0.12) + t.j * 0.04) * (upper ? 1 : 0.85);
        const vg = ctx.createLinearGradient(0, yG, 0, yE);
        vg.addColorStop(0, rgb([TC[0], TC[1] * 0.97, TC[2] * 0.88], depth * 0.86));
        vg.addColorStop(0.3, rgb(TC, depth * 1.0));
        vg.addColorStop(0.82, rgb(TC, depth * 0.98));
        vg.addColorStop(1, rgb([TC[0] * 0.9, TC[1] * 0.93, TC[2] * 0.98], depth * 0.88));
        ctx.fillStyle = vg;
        ctx.fill();
        // rounded front: darker toward the sides of each tooth
        ctx.save();
        ctx.clip();
        const hg = ctx.createLinearGradient(x0, 0, x1, 0);
        hg.addColorStop(0, 'rgba(70,45,30,0.28)');
        hg.addColorStop(0.22, 'rgba(70,45,30,0)');
        hg.addColorStop(0.78, 'rgba(70,45,30,0)');
        hg.addColorStop(1, 'rgba(70,45,30,0.28)');
        ctx.fillStyle = hg;
        ctx.fillRect(x0, Math.min(yG, yE) - 2, w, len + 4);
        // soft light reflection down the front teeth
        if (upper && t.k < 2) {
          const sx = xm - t.sgn * w * 0.12;
          const sg = ctx.createLinearGradient(sx - w * 0.12, 0, sx + w * 0.12, 0);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(0.5, `rgba(255,255,255,${t.k ? 0.12 : 0.18})`);
          sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sg;
          ctx.fillRect(sx - w * 0.12, Math.min(yG, yE) + len * 0.2, w * 0.24, len * 0.6);
        }
        ctx.restore();
      }
      ctx.restore();
    };
    const tv = vis * clamp((gap - hw * 0.06) / (hw * 0.14), 0, 1); // teeth only show once the lips are properly apart
    // teeth settings (defaults = what the live pages use; the /teeth page overrides them to tune)
    const TT = { upEdge: 0.22, loEdge: 0.18, bright: 0.8, scale: 1, ...this.teethTune };
    if (TEETH.ready) {
      // real teeth, fitted to this mouth: row as wide as the mouth, upper edge under the upper lip,
      // lower row riding on the jaw, turned with the head, coloured and softened like the photo
      const Mt = TEETH.meta, A = this.anat, scale = ((2 * HW) / Mt.rowWidth) * TT.scale;
      const [lx, ly] = S(61), [rx, ry] = S(291), ang = Math.atan2(ry - ly, rx - lx);
      const bright = this._mcol.k * TT.bright;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.filter = `blur(${soft}px) brightness(${bright.toFixed(3)}) saturate(0.8) sepia(0.1)`;
      const draw = (img, m, edgeY) => ctx.drawImage(img, -m.cx * scale, edgeY - m.edge * scale, img.width * scale, img.height * scale);
      const yU = A.upLip * sy * TT.upEdge, yL = A.loLip * sy * TT.loEdge + jawDrop, teethFilter = ctx.filter;
      const pr = this.params, tc = this._mcol.gum;
      const tongue = (cy, rx, ry, a) => {
        if (a < 0.02 || ry < 0.5) return;
        ctx.save();
        ctx.filter = `blur(${soft}px)`;
        ctx.globalAlpha = a * vis;
        const tg2 = ctx.createRadialGradient(0, cy - ry * 0.4, ry * 0.1, 0, cy, Math.max(rx, ry));
        tg2.addColorStop(0, `rgb(${tc[0] * 0.95 | 0},${tc[1] * 0.85 | 0},${tc[2] * 0.85 | 0})`);
        tg2.addColorStop(1, `rgb(${tc[0] * 0.55 | 0},${tc[1] * 0.4 | 0},${tc[2] * 0.42 | 0})`);
        ctx.fillStyle = tg2;
        ctx.beginPath();
        ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      ctx.globalAlpha = tv * 0.95;
      draw(TEETH.l, Mt.lower, yL);
      // T, D, N, L: tongue tip lifts up behind the top teeth
      tongue(yU + (yL - yU) * 0.45, HW * 0.34, Math.max(1, (yL - yU) * 0.5), pr.tongueUp);
      ctx.filter = teethFilter;
      ctx.globalAlpha = tv;
      draw(TEETH.u, Mt.upper, yU);
      // TH: tongue tip shows between the teeth
      tongue(yU + Math.max(1, (yL - yU) * 0.3), HW * 0.3, Math.max(1.2, (yL - yU) * 0.42), pr.tongueOut);
      ctx.restore();
    } else {
      ctx.globalAlpha = tv * 0.95;
      row(false); // lower teeth behind
      ctx.globalAlpha = tv;
      row(true);
    }
    ctx.globalAlpha = vis;

    // shadow cast by the upper lip onto the teeth
    const shH = Math.max(gap * 0.45, hw * 0.08), shA = this.teethTune?.shadow ?? 0.62;
    const ls = ctx.createLinearGradient(0, top, 0, top + shH);
    ls.addColorStop(0, `rgba(28,8,6,${shA})`);
    ls.addColorStop(0.5, `rgba(28,8,6,${shA * 0.35})`);
    ls.addColorStop(1, 'rgba(28,8,6,0)');
    ctx.fillStyle = ls;
    ctx.fillRect(x0 - 6, top - 2, hw * 2 + 12, shH + 2);
    // soft dark rim just inside the lips + darker corners
    ctx.filter = `blur(${Math.max(1, hw * 0.05)}px)`;
    mouthPath();
    ctx.strokeStyle = 'rgba(20,4,4,0.45)';
    ctx.lineWidth = hw * 0.07;
    ctx.stroke();
    ctx.filter = 'none';
    const cs = ctx.createRadialGradient(cx, (top + bot) / 2, hw * 0.7, cx, (top + bot) / 2, hw * 1.08);
    cs.addColorStop(0, 'rgba(0,0,0,0)');
    cs.addColorStop(1, 'rgba(8,1,1,0.7)');
    ctx.fillStyle = cs;
    ctx.fillRect(x0 - 6, top - 6, hw * 2 + 12, bot - top + 12);
    // corners of the mouth stay in shadow, like the inside of real cheeks
    ctx.globalAlpha = 1;
    const side = ctx.createLinearGradient(x0, 0, x1, 0);
    const cA = this.teethTune?.corners ?? 0.95;
    side.addColorStop(0, `rgba(14,3,3,${cA})`);
    side.addColorStop(0.24, 'rgba(14,3,3,0)');
    side.addColorStop(0.76, 'rgba(14,3,3,0)');
    side.addColorStop(1, `rgba(14,3,3,${cA})`);
    ctx.fillStyle = side;
    ctx.fillRect(x0 - 6, top - 6, hw * 2 + 12, bot - top + 12);
    ctx.restore();

    // where the interior is still faded out, show a dark lip line instead of the photo behind it
    if (vis < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - vis;
      ctx.fillStyle = '#2a0f10';
      mouthPath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- speech (browser voice + rule-based visemes) ----------
  say(text, { voice, rate = 1, pitch = 1 } = {}) {
    this.stop();
    const chunks = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) || [];
    const synth = window.speechSynthesis;
    return new Promise((resolve) => {
      chunks.forEach((chunk, ci) => {
        const u = new SpeechSynthesisUtterance(chunk);
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = pitch;
        const tl = this._timeline(chunk, rate);
        u.onstart = () => {
          const now = performance.now() / 1000;
          this.speech = { tl, t0: now, start: now, pace: this._pace ?? 1 };
        };
        u.onboundary = (e) => {
          // resync our estimated timeline to the real word the voice is on
          if (!this.speech || e.name !== 'word') return;
          const w = tl.words.find((wd) => wd.char >= e.charIndex);
          if (!w) return;
          const now = performance.now() / 1000, s = this.speech;
          if (w.start > 0.3) {
            const measured = w.start / Math.max(0.05, (now - s.start) * rate);
            this._pace = s.pace = clamp(s.pace * 0.6 + measured * 0.4, 0.5, 2);
          }
          s.t0 = now - w.start / (s.pace * rate);
        };
        u.onend = () => {
          if (ci === chunks.length - 1) { this.speech = null; resolve(); }
        };
        u.onerror = u.onend;
        synth.speak(u);
      });
      if (!chunks.length) resolve();
    });
  }

  // ---------- ElevenLabs (exact timing from the server) ----------
  async sayEleven(text, { endpoint = '/api/tts', voice } = {}) {
    this.stop();
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `TTS failed (${r.status})`);
    const bytes = Uint8Array.from(atob(j.audio), (c) => c.charCodeAt(0));
    return this.playWithTiming(bytes.buffer, j.alignment);
  }

  // Play audio and move the mouth from per-character timings
  // (alignment = { characters[], character_start_times_seconds[], character_end_times_seconds[] }).
  async playWithTiming(arrayBuffer, alignment, env = null) {
    this.stop();
    this.actx ||= new AudioContext();
    if (this.actx.state === 'suspended') await this.actx.resume();
    const buf = await this.actx.decodeAudioData(arrayBuffer);
    const keys = this._alignedKeys(alignment);
    const src = this.actx.createBufferSource();
    src.buffer = buf;
    // tap the voice level (for visuals like a pulsing halo)
    this._levelAn ||= Object.assign(this.actx.createAnalyser(), { fftSize: 512, smoothingTimeConstant: 0.3 });
    this._levelBuf ||= new Float32Array(512);
    src.connect(this._levelAn);
    src.connect(this.actx.destination);
    const t0 = this.actx.currentTime + 0.05;
    src.playbackRate.value = this.timeScale ?? 1;
    src.start(t0);
    this._source = src;
    this.speech = { exact: true, t0, pos0: 0, rate: this.timeScale ?? 1, keys, dur: buf.duration, env };
    if (this.expressive) Object.assign(this.speech, this._expressionEvents(alignment));
    return new Promise((res) => { src.onended = () => { if (this._source === src) { this.speech = null; this._source = null; } res(); }; });
  }

  // follow the real voice: shut when it is quiet, open with its loudness (the shape still comes from the text)
  _gateByVoice(out, env, tt) {
    const at = (t) => { const i = t * ENV_RATE; const i0 = Math.max(0, Math.min(env.length - 1, Math.floor(i))); const i1 = Math.min(env.length - 1, i0 + 1); return env[i0] + (env[i1] - env[i0]) * (i - i0); };
    // the mouth moves just before the sound
    const e = Math.max(at(tt), at(tt + 0.03));
    const g = clamp((e - 0.04) / 0.3, 0, 1), open = g * g * (3 - 2 * g);
    out.jaw = (out.jaw ?? 0) * (0.15 + 0.85 * open);
    out.wide = (out.wide ?? 0) * (0.4 + 0.6 * open);
    out.round = (out.round ?? 0) * (0.4 + 0.6 * open);
    out.tongueOut = (out.tongueOut ?? 0) * open;
    if (open < 0.05 && e < 0.03) for (const k of ['upper', 'tuck', 'tongueUp']) if (k in out) out[k] *= 0.3;
    return out;
  }

  // blend every nearby sound by its dominance and distance in time (real speech overlaps its sounds)
  _coartTarget(s, tt) {
    const keys = s.keys, n = keys.length;
    let i0 = s._ci || 0;
    while (i0 > 0 && keys[i0].t > tt - 0.4) i0--;
    while (i0 + 1 < n && keys[i0 + 1].t < tt - 0.4) i0++;
    s._ci = i0;
    const sum = new Float32Array(8), wsum = new Float32Array(8);
    for (let i = i0; i < n && keys[i].t < tt + 0.4; i++) {
      const k = keys[i], end = i + 1 < n ? keys[i + 1].t : k.t + 0.12;
      const half = Math.max(0.01, (end - k.t) / 2), c = k.t + half;
      const d = Math.max(0, Math.abs(tt - c) - half * 0.5); // full strength across the middle of its own span
      const T = VISEMES2[k.v] || VISEMES2.sil, D = DOMINANCE[k.v] || DOMINANCE.sil, amp = k.amp ?? 1;
      for (let j = 0; j < 8; j++) {
        let target = j === 7 ? (k.v === 'PP' ? 1 : 0) : T[j];
        if (j < 3) target *= amp;
        const w = D[j] * Math.exp(-d / REACH[j]);
        sum[j] += w * target;
        wsum[j] += w;
      }
    }
    const v = (j) => (wsum[j] > 1e-4 ? sum[j] / wsum[j] : 0);
    // follow real loudness a little (quiet bits stay smaller)
    const lvl = s.silent ? 0.55 : this._rawLevel();
    const jaw = clamp(v(0) * (0.85 + 0.5 * lvl), 0, 1);
    let near = i0;
    while (near + 1 < n && keys[near + 1].t <= tt) near++;
    const asym = (hashN(near * 7.3 + 1) - 0.5) * 0.22; // one side opens a touch more, different every sound
    // the mouth keeps its full width while talking and widens a little as it opens;
    // only real rounded sounds (O, OO, W) narrow it, and less than before
    const rnd = clamp(v(2), 0, 1);
    const wideT = v(1) + 0.35 * jaw * (1 - rnd);
    return { asym, jaw, wide: wideT, round: rnd * 0.6, upper: v(3), tuck: v(4), tongueUp: v(5), tongueOut: v(6), lipClose: clamp(v(7) * 1.15, 0, 1) };
  }

  // instant loudness of the playing voice, 0..1 (no smoothing, for the mouth)
  _rawLevel() {
    if (!this._source || !this._levelAn) return 0;
    this._rawBuf ||= new Float32Array(this._levelAn.fftSize);
    this._levelAn.getFloatTimeDomainData(this._rawBuf);
    let sum = 0;
    for (const x of this._rawBuf) sum += x * x;
    return Math.min(1, Math.sqrt(sum / this._rawBuf.length) * 5);
  }

  // current loudness of the voice, 0..1 (smoothed); falls back to mouth opening
  voiceLevel() {
    let v = 0;
    if (this._source && this._levelAn) {
      this._levelAn.getFloatTimeDomainData(this._levelBuf);
      let sum = 0;
      for (const x of this._levelBuf) sum += x * x;
      v = Math.min(1, Math.sqrt(sum / this._levelBuf.length) * 5);
    } else if (this.speech || this.analyser) {
      v = this.params.jaw * 0.7;
    }
    this._lvl = (this._lvl || 0) + (v - (this._lvl || 0)) * (v > (this._lvl || 0) ? 0.5 : 0.12);
    return this._lvl;
  }

  _alignedKeys(al) {
    const chars = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds;
    const text = chars.join('');
    const keys = [];
    let m;
    const re = /[A-Za-z0-9']+/g;
    let lastEnd = 0;
    while ((m = re.exec(text))) {
      const a = m.index, b = m.index + m[0].length - 1;
      const ws = st[a], we = en[b];
      if (ws - lastEnd > 0.12) keys.push({ t: lastEnd, v: 'sil' }); // real pause between words
      const ph = this.speechV2 && DICT ? DICT.get(m[0].toLowerCase()) : null;
      const at = ph ? null : wordToVisemesAt(m[0]);
      if (ph) {
        // real sounds of the word, timed along its letters' own timings
        // stress: the stressed syllable opens wide, unstressed ones stay small and relaxed
        const vs = [];
        for (const x of ph) {
          const st0 = x.match(/\d/)?.[0], amp = st0 === '1' ? 1.12 : st0 === '2' ? 0.88 : st0 === '0' ? 0.72 : 1;
          for (const v of ARPA[x.replace(/\d/, '')] || []) vs.push({ v, amp });
        }
        const L = m[0].length;
        let prevT = -1;
        vs.forEach(({ v, amp }, k) => {
          let t = st[a + Math.min(L - 1, Math.floor((k * L) / vs.length))];
          if (t <= prevT) t = prevT + Math.min(0.03, (we - ws) / (vs.length + 1));
          keys.push({ t, v, amp: amp * (0.9 + 0.2 * hashN(keys.length)) }); // no two syllables identical
          prevT = t;
        });
      } else if (at) {
        // each sound starts exactly when its letter is spoken
        let prevT = -1;
        for (const { v, at: k } of at) {
          let t = st[a + k];
          if (t <= prevT) t = prevT + 0.012; // two sounds on one letter: keep both, just after each other
          keys.push({ t, v });
          prevT = t;
        }
      } else {
        const vs = wordToVisemes(m[0]);
        const weights = vs.map((v) => (VOWEL.has(v) ? 1.6 : 1));
        const total = weights.reduce((x, y) => x + y, 0) || 1;
        let t = ws;
        vs.forEach((v, i) => { keys.push({ t, v }); t += ((we - ws) * weights[i]) / total; });
      }
      lastEnd = we;
    }
    keys.push({ t: lastEnd, v: 'sil' });
    return keys;
  }

  _timeline(text, rate) {
    const words = [], keys = [];
    let t = 0;
    const re = /[A-Za-z0-9']+|[,;:]/g;
    let m;
    while ((m = re.exec(text))) {
      if (/[,;:]/.test(m[0])) { keys.push({ t, v: 'sil' }); t += 0.22; continue; }
      words.push({ char: m.index, start: t });
      for (const v of wordToVisemes(m[0])) {
        keys.push({ t, v });
        t += VOWEL.has(v) ? 0.11 : 0.065;
      }
      keys.push({ t, v: 'sil', soft: true });
      t += 0.04;
    }
    keys.push({ t, v: 'sil' });
    return { words, keys, dur: t, rate };
  }

  _speechTarget(now) {
    const s = this.speech;
    if (s.exact) {
      // mouth leads the sound by ~40ms, like a real speaker
      const tt = this._speechClock(s) + 0.04;
      if (tt < 0 || tt > s.dur) return { jaw: 0, wide: 0, round: 0, upper: 0 };
      if (this.speechV2) return s.env ? this._gateByVoice(this._coartTarget(s, tt), s.env, tt) : this._coartTarget(s, tt);
      let ki = 0;
      while (ki + 1 < s.keys.length && s.keys[ki + 1].t <= tt) ki++;
      const k = s.keys[ki], nx = s.keys[ki + 1];
      const TBL = this.speechV2 ? VISEMES2 : VISEMES;
      const v = TBL[k.v] || VISEMES2[k.v] || VISEMES.sil;
      let out = [...v];
      // lips move toward the next sound a little before it (coarticulation)
      if (nx) {
        const win = Math.min(0.06, (nx.t - k.t) * 0.45);
        const f = win > 0 ? clamp((tt - (nx.t - win)) / win, 0, 1) : 0;
        if (f > 0) {
          const w = TBL[nx.v] || VISEMES2[nx.v] || VISEMES.sil, e = f * f * (3 - 2 * f);
          out = out.map((x, i) => x + ((w[i] ?? 0) - x) * e);
        }
      }
      // follow the real loudness: quiet sounds still move the mouth, loud ones open it more
      // silent test: no audio to measure, so use a speech-like loudness (stronger on vowels)
      const lvl = s.silent ? (VOWEL.has(k.v) ? 0.6 : 0.4) : this._rawLevel();
      const closed = k.v === 'PP' || k.v === 'sil';
      let jaw = out[0] * (0.65 + 0.6 * lvl);
      if (!closed && lvl > 0.05) jaw = Math.max(jaw, 0.08 + lvl * 0.3);
      return { jaw: clamp(jaw, 0, 1), wide: out[1], round: out[2], upper: out[3], tuck: out[4] || 0, tongueUp: out[5] || 0, tongueOut: out[6] || 0, closing: k.v === 'PP' };
    }
    const tt = (now - s.t0) * s.pace * s.tl.rate;
    const keys = s.tl.keys;
    let k = keys[0];
    for (const key of keys) { if (key.t <= tt) k = key; else break; }
    if (tt > s.tl.dur) return { jaw: 0, wide: 0, round: 0, upper: 0 };
    const v = VISEMES[k.v];
    const amp = k.soft ? 0.4 : 1;
    return { jaw: v[0] * amp, wide: v[1] * amp, round: v[2] * amp, upper: v[3] * amp };
  }

  // ---------- audio / microphone (signal analysis, no models) ----------
  _ensureAudio() {
    this.actx ||= new AudioContext();
    if (this.actx.state === 'suspended') this.actx.resume();
    const a = this.actx.createAnalyser();
    a.fftSize = 1024;
    a.smoothingTimeConstant = 0.5;
    this._td = new Float32Array(a.fftSize);
    this._fd = new Uint8Array(a.frequencyBinCount);
    return a;
  }

  async playAudio(src) {
    this.stop();
    const el = (this.audioEl = new Audio());
    el.src = src instanceof Blob ? URL.createObjectURL(src) : src;
    el.crossOrigin = 'anonymous';
    const a = this._ensureAudio();
    const node = this.actx.createMediaElementSource(el);
    node.connect(a);
    a.connect(this.actx.destination);
    this.analyser = a;
    this._audioNodes = [node, a];
    await el.play();
    return new Promise((res) => { el.onended = () => { this.stop(); res(); }; });
  }

  async useMicrophone() {
    this.stop();
    const stream = (this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true }));
    const a = this._ensureAudio();
    const node = this.actx.createMediaStreamSource(stream);
    node.connect(a); // not to destination, avoids echo
    this.analyser = a;
    this._audioNodes = [node, a];
  }

  _audioTarget() {
    const a = this.analyser;
    a.getFloatTimeDomainData(this._td);
    a.getByteFrequencyData(this._fd);
    let rms = 0;
    for (const v of this._td) rms += v * v;
    rms = Math.sqrt(rms / this._td.length);
    const hz = this.actx.sampleRate / a.fftSize;
    const band = (lo, hi) => {
      let s = 0, c = 0;
      for (let i = Math.floor(lo / hz); i < Math.min(this._fd.length, hi / hz); i++) { s += this._fd[i]; c++; }
      return s / (c || 1) / 255;
    };
    const low = band(200, 900), mid = band(900, 2500), high = band(3500, 8000);
    const level = clamp((rms - 0.008) * 9, 0, 1);
    if (level < 0.02) return { jaw: 0, wide: 0, round: 0, upper: 0 };
    const tot = low + mid + high + 1e-3;
    const sib = high / tot, rnd = low / tot;
    return {
      jaw: clamp(level * (1 - sib * 0.8), 0, 1),
      wide: clamp((mid / tot) * 1.4 + sib * 0.6 - 0.3, 0, 1) * Math.min(1, level * 3),
      round: clamp((rnd - 0.45) * 2.5, 0, 1) * Math.min(1, level * 3),
      upper: clamp(0.25 + sib, 0, 1) * Math.min(1, level * 4),
    };
  }

  _speechClock(s) {
    if (s.silent) return (this.vt ?? 0) - s.t0;
    // what is heard lags what is played by the speaker delay (large on Bluetooth)
    const lag = this.actx.outputLatency || this.actx.baseLatency || 0;
    return (s.pos0 || 0) + (this.actx.currentTime - s.t0 - lag) * (s.rate ?? 1);
  }

  // playback speed for testing: 1 = normal, 0.25 = four times slower (voice slows down too)
  setSpeed(r) {
    const s = this.speech;
    if (s?.exact && !s.silent && this.actx) {
      s.pos0 = this._speechClock(s);
      s.t0 = this.actx.currentTime;
      s.rate = r;
      if (this._source) this._source.playbackRate.value = r;
    }
    this.timeScale = r;
  }

  // Lip-sync a text with no audio (testing without spending voice credits).
  // Builds natural timings: word length from its sounds, pauses at commas, sentence ends and paragraphs.
  saySilent(text, { rate = 1 } = {}) {
    this.stop();
    const { alignment, dur: t } = this._textAlignment(text, rate);
    const keys = this._alignedKeys(alignment);
    const speech = { exact: true, silent: true, t0: this.vt ?? performance.now() / 1000, keys, dur: t };
    if (this.expressive) Object.assign(speech, this._expressionEvents(alignment));
    this.speech = speech;
    return new Promise((res) => {
      const check = () => (this.speech !== speech ? res() : this._speechClock(speech) > speech.dur ? ((this.speech = null), res()) : setTimeout(check, 100));
      check();
    });
  }

  // Speak a recorded clip of `text` (any voice, e.g. one made in the browser) with full mouth shapes.
  // The clip has no timings, so they are read from the audio itself: where the voice is speaking and
  // where it pauses. Each phrase of the text is fitted to its own stretch of speech, the mouth shuts
  // whenever the audio is quiet, and opens with the voice's loudness.
  async sayAudio(arrayBuffer, text) {
    this.stop();
    this.actx ||= new AudioContext();
    if (this.actx.state === 'suspended') await this.actx.resume();
    const buf = await this.actx.decodeAudioData(arrayBuffer.slice(0));
    const { env, regions } = audioEnvelope(buf);
    const alignment = alignTextToAudio(text, buf.duration, regions);
    return this.playWithTiming(arrayBuffer, alignment, env);
  }

  // natural per-character timings for a text: word length from its sounds, pauses at commas and sentence ends
  _textAlignment(text, rate = 1) {
    const chars = text.split(""), st = new Array(chars.length), en = new Array(chars.length);
    let t = 0.15;
    const re = /[A-Za-z0-9']+/g;
    let m, last = 0;
    const gap = (from, to) => {
      for (let i = from; i < to; i++) {
        const c = chars[i];
        const pause = c === '\n' ? 0.35 : /[.!?]/.test(c) ? 0.42 : /[,;:]/.test(c) ? 0.24 : c === ' ' ? 0.035 : 0;
        st[i] = t; t += pause / rate; en[i] = t;
      }
    };
    while ((m = re.exec(text))) {
      gap(last, m.index);
      const w = m[0], ph = DICT?.get(w.toLowerCase());
      const sounds = ph ? ph.flatMap((x) => ARPA[x.replace(/\d/, '')] || []) : wordToVisemes(w);
      const dur = Math.max(0.12, sounds.reduce((d, v) => d + (VOWEL.has(v) ? 0.105 : 0.07), 0)) / rate;
      for (let i = 0; i < w.length; i++) { st[m.index + i] = t + (dur * i) / w.length; en[m.index + i] = t + (dur * (i + 1)) / w.length; }
      t += dur;
      last = m.index + w.length;
    }
    gap(last, chars.length);
    return { alignment: { characters: chars, character_start_times_seconds: st, character_end_times_seconds: en }, dur: t };
  }

  stop() {
    window.speechSynthesis?.cancel();
    if (this._source) { try { this._source.stop(); } catch {} this._source = null; }
    this.speech = null;
    if (this.audioEl) { this.audioEl.pause(); this.audioEl = null; }
    if (this.micStream) { this.micStream.getTracks().forEach((t) => t.stop()); this.micStream = null; }
    this._audioNodes?.forEach((n) => n.disconnect());
    this._audioNodes = null;
    this.analyser = null;
  }
}
