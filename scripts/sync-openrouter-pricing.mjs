#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchOpenRouterModels,
  normalizeOpenRouterModelsResponse,
} from "./model-pricing/openrouter-pricing.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(
  repoRoot,
  "src",
  "data",
  "model-pricing",
  "openrouter.json",
);

const response = await fetchOpenRouterModels();
const snapshot = normalizeOpenRouterModelsResponse(response);
const json = `${JSON.stringify(snapshot, null, 2)}\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, json, "utf8");

console.log(
  `Synced ${snapshot.models.length} OpenRouter model prices to ${path.relative(repoRoot, outputPath)}`,
);
