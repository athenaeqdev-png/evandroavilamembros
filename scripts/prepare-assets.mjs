import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceDirectory = path.resolve("public");
const outputDirectory = path.resolve("dist");
const sourceScript = path.join(sourceDirectory, "js", "app.js");
const sourceHtml = path.join(sourceDirectory, "index.html");

const script = await readFile(sourceScript);
const hash = createHash("sha256").update(script).digest("hex").slice(0, 12);
const versionedName = `app.${hash}.js`;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
await rename(path.join(outputDirectory, "js", "app.js"), path.join(outputDirectory, "js", versionedName));

const html = await readFile(sourceHtml, "utf8");
const assetReference = 'src="/js/app.js"';
if (!html.includes(assetReference)) {
  throw new Error(`Expected exactly one canonical asset reference: ${assetReference}`);
}
if (html.indexOf(assetReference) !== html.lastIndexOf(assetReference)) {
  throw new Error(`Found more than one canonical asset reference: ${assetReference}`);
}
await writeFile(
  path.join(outputDirectory, "index.html"),
  html.replace(assetReference, `src="/js/${versionedName}"`),
);

console.log(`/js/${versionedName}`);
