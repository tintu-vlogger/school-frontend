// Collects the English text shown on screen (JSX text, labels, hints, placeholders, menu names,
// messages) from the web app's source into scripts/i18n/source.json. Text with values in it
// (`${n} days`) becomes a pattern ("{0} days"). Re-run after UI changes, then translate.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const DIRS = ["src/app", "src/components", "src/lib"];
const SKIP_FILES = [/\/i18n\//, /\.d\.ts$/, /\/voice\//, /talking-avatar/];
const SKIP_ATTRS = new Set(["className", "class", "href", "src", "id", "key", "type", "name", "role", "variant", "size", "tone", "icon",
  "mode", "method", "target", "rel", "autoComplete", "inputMode", "d", "viewBox", "fill", "stroke", "strokeLinecap", "strokeLinejoin",
  "accept", "htmlFor", "form", "pattern", "lang", "dir", "value", "defaultValue", "data-testid", "as", "align", "side", "position",
  "columns", "format", "sort", "field", "path", "url", "endpoint", "queryKey", "storageKey", "color", "width", "height", "fontFamily"]);
const SKIP_CALLS = /^(api\.|fetch|localStorage|sessionStorage|console\.|router\.|new URL|document\.|window\.|URLSearchParams|params\.|searchParams\.|require|import|setAttribute|getAttribute|addEventListener|removeEventListener|classList|matchMedia|querySelector|cn|cx|clsx|twMerge|Intl\.|toLocaleString|toLocaleDateString|formatDate|formatDateTime|publicFetch|platformApi\.|encodeURIComponent|split|join|replace|startsWith|endsWith|includes|indexOf|padStart|padEnd|test|match)/;
const TW = /^(!?-?[a-z]+(-[a-z0-9.\/\[\]%#()]+)+|[a-z]+:[^\s]+|flex|grid|block|hidden|inline|relative|absolute|fixed|sticky|truncate|italic|underline|uppercase|lowercase|capitalize|rounded|border|shadow|transition|antialiased|tabular|contents|static|grow|shrink|isolate|group|peer|sr-only|container|prose|ring|outline|transform|filter|invisible|visible|collapse|table|ordinal|blur|grayscale|invert|sepia|resize|select-none)$/;

const out = new Map();
const add = (s, file) => {
  s = s.replace(/\s+/g, " ").trim();
  if (!s || s.length < 2 || s.length > 600) return;
  if (!/[A-Za-z]/.test(s)) return;
  if (/^(https?:|\/|\.\/|#|mailto:|tel:|data:|[a-z]+:\/\/)/.test(s)) return;
  if (/[{}]/.test(s.replace(/\{\d+\}/g, ""))) return;              // code, not text
  if (/(gradient\(|rgba?\(|hsl\(|var\(--|url\(|\[data-|^\^|=>|&&|\|\||\$\{|<\/?[a-z]+[ >])/.test(s)) return; // css, selectors, regex, code
  if (/^#[0-9a-f]{3,8}$/i.test(s) || /^\d/.test(s) && !/[a-z]{3}/i.test(s)) return;
  if (/^[a-z0-9_.\-:\/\[\]#@=?&%*]+$/.test(s)) return;               // ids, keys, paths, lower-case tokens
  if (/^[A-Z0-9_]+$/.test(s)) return;                                // CONSTANTS / acronyms alone
  if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(s)) return;                   // camelCase
  if (/^[\w.-]+\.(png|jpe?g|svg|webp|json|csv|xlsx?|pdf|zip|ics|txt|js|ts|tsx|css|html|ttf|woff2?)$/i.test(s)) return;
  const toks = s.split(" ");
  if (toks.length > 1 && toks.filter((t) => TW.test(t)).length / toks.length >= 0.5) return; // tailwind classes
  if (toks.length === 1 && !/^[A-Z][a-z]/.test(s) && !/\{\d+\}/.test(s)) return; // lone lower-case word
  if (!out.has(s)) out.set(s, new Set());
  out.get(s).add(path.relative(ROOT, file));
};

function calleeName(n) {
  try { return n.expression.getText(); } catch { return ""; }
}

function walk(file) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const skipped = (node) => {
    for (let p = node.parent, child = node; p; child = p, p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isTypeNode(p)) return true;
      if (ts.isJsxAttribute(p)) return SKIP_ATTRS.has(p.name.getText()) || /^on[A-Z]|^aria-(describedby|labelledby|controls)$|^data-/.test(p.name.getText());
      if (ts.isPropertyAssignment(p) && p.name === child) return true;   // object keys
      if (ts.isPropertyAssignment(p) && SKIP_ATTRS.has(p.name.getText().replace(/["']/g, ""))) return true;
      if (ts.isPropertyAssignment(p) && ["keywords", "related", "audience", "click", "find"].includes(p.name.getText())) return true; // help guide fields not shown as text
      if (ts.isElementAccessExpression(p) && p.argumentExpression === child) return true;
      if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
      if (ts.isCaseClause(p) && p.expression === child) return true;
      if (ts.isCallExpression(p) || ts.isNewExpression(p)) { if (SKIP_CALLS.test(calleeName(p))) return true; }
      if (ts.isTaggedTemplateExpression(p)) return true;
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isFunctionLike(p) || ts.isSourceFile(p)) return false;
    }
    return false;
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) add(node.getText(), file);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { if (!skipped(node)) add(node.text, file); }
    else if (ts.isTemplateExpression(node)) {
      if (!skipped(node)) {
        let s = node.head.text;
        node.templateSpans.forEach((sp, i) => { s += `{${i}}` + sp.literal.text; });
        if (/[A-Za-z]{2,}/.test(s.replace(/\{\d+\}/g, ""))) add(s, file);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

const files = [];
const scan = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) scan(p); else if (/\.(tsx?|jsx?)$/.test(f) && !SKIP_FILES.some((r) => r.test(p))) files.push(p); } };
DIRS.forEach((d) => scan(path.join(ROOT, d)));
files.forEach(walk);
const list = [...out.keys()].sort();
fs.mkdirSync(path.join(ROOT, "scripts/i18n"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "scripts/i18n/source.json"), JSON.stringify(list, null, 1));
console.log(`${files.length} files, ${list.length} texts, ${list.reduce((a, s) => a + s.length, 0)} characters`);
