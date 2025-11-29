import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ASSET_MAP = [
  { name: "INDEX_HTML", relativePath: "frontend/index.html" },
  { name: "APP_JS", relativePath: "frontend/dist/app.js" },
  { name: "STYLES_CSS", relativePath: "frontend/styles.css" }
];

const PROMPT_MAP = [
  { name: "FLOW_COACH_PROMPT", relativePath: "src/prompts/flow-coach.txt" }
];

async function main() {
  const scriptDir = dirname(new URL(import.meta.url).pathname);
  const root = resolve(scriptDir, "..");
  const generatedDir = resolve(root, "src/generated");
  const outPath = resolve(generatedDir, "assets.ts");

  let contents = "// Auto-generated; run `npm run build:frontend` to refresh.\n\n";
  for (const asset of ASSET_MAP) {
    const filePath = resolve(root, asset.relativePath);
    const data = await readFile(filePath, "utf-8");
    contents += `export const ${asset.name} = ${JSON.stringify(data)};\n`;
  }

  await writeFile(outPath, contents, "utf-8");

  const promptPath = resolve(generatedDir, "prompts.ts");
  let promptContents = "// Auto-generated prompts.\n\n";
  for (const prompt of PROMPT_MAP) {
    const filePath = resolve(root, prompt.relativePath);
    const data = await readFile(filePath, "utf-8");
    promptContents += `export const ${prompt.name} = ${JSON.stringify(data)};\n`;
  }
  await writeFile(promptPath, promptContents, "utf-8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

