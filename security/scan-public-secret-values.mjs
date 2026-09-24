// Reads local secret values in memory; reports only variable names and matched paths.
// Does not print values, send data externally, or modify assets.
import fs from "node:fs";
import path from "node:path";
const envText = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const secrets = [];
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (!match || match[1].startsWith("NEXT_PUBLIC_")) continue;
  const name = match[1];
  if (!/SECRET|TOKEN|PASSWORD|DATABASE_URL|API_KEY|KEY_SECRET/.test(name)) continue;
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (value.length >= 12) secrets.push({ name, value });
}
const roots = [".next/static", "public"];
let scanned = 0;
const matches = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|map|json|html|txt|css|svg)$/i.test(file)) {
      scanned++;
      const text = fs.readFileSync(file, "utf8");
      for (const { name, value } of secrets) if (text.includes(value)) matches.push({ variable: name, file });
    }
  }
}
roots.forEach(walk);
console.log(JSON.stringify({ checkedSecretCount: secrets.length, scannedTextAssets: scanned, matches, limitation: "Exact-value scan of existing local assets only; not a fresh production build, historical scan or proof of absence of encoded/other secrets." }, null, 2));
process.exitCode = matches.length ? 1 : 0;
