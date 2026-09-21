import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const assetDirectory = path.resolve(process.argv[2] ?? "dist");
const forbiddenMarkers = [
  'const loginForm = document.querySelector("#login-form")',
  "Funcionalidade de recuperação será ativada em breve",
];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
  }));
  return files.flat();
}

const files = await filesBelow(assetDirectory);
const readableAssets = files.filter((file) => /\.(?:html|js|css|json|txt)$/i.test(file));
const contents = await Promise.all(readableAssets.map(async (file) => ({
  file,
  content: await readFile(file, "utf8"),
})));

for (const marker of forbiddenMarkers) {
  const matches = contents.filter(({ content }) => content.includes(marker));
  if (matches.length) {
    throw new Error(`Legacy frontend marker found (${JSON.stringify(marker)}): ${matches.map(({ file }) => path.relative(assetDirectory, file)).join(", ")}`);
  }
}

const index = await readFile(path.join(assetDirectory, "index.html"), "utf8");
const applicationScripts = [...index.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
  .map((match) => match[1])
  .filter((source) => source.startsWith("/"));
if (applicationScripts.length !== 1 || !/^\/js\/app\.[a-f0-9]{12}\.js$/.test(applicationScripts[0])) {
  throw new Error(`Expected one versioned application script, found: ${applicationScripts.join(", ") || "none"}`);
}

const expectedBundle = path.join(assetDirectory, applicationScripts[0].slice(1));
const bundle = await readFile(expectedBundle, "utf8");
for (const marker of ["E-mail ou telefone", "/api/v1/auth/"]) {
  if (!bundle.includes(marker)) {
    throw new Error(`Current frontend marker missing from ${path.relative(assetDirectory, expectedBundle)}: ${JSON.stringify(marker)}`);
  }
}

const obsoleteBundles = files.filter((file) => /(?:^|\/)app\.js$/.test(file));
if (obsoleteBundles.length) {
  throw new Error(`Unversioned app.js would be published: ${obsoleteBundles.map((file) => path.relative(assetDirectory, file)).join(", ")}`);
}

console.log(`Validated ${files.length} publishable assets; application bundle: ${applicationScripts[0]}`);
