import { appendFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(frontendRoot, "package.json"), "utf8"));
const tauriConfig = JSON.parse(
  await readFile(join(frontendRoot, "src-tauri", "tauri.conf.json"), "utf8"),
);
const cargoToml = await readFile(join(frontendRoot, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = [packageJson.version, tauriConfig.version, cargoVersion];

if (versions.some((version) => typeof version !== "string") || new Set(versions).size !== 1) {
  throw new Error(`Desktop versions do not match: ${versions.join(", ")}`);
}

const version = versions[0];
if (process.env.GITHUB_REF_TYPE === "tag") {
  const expectedTag = `desktop-v${version}`;
  if (process.env.GITHUB_REF_NAME !== expectedTag) {
    throw new Error(
      `Release tag ${process.env.GITHUB_REF_NAME} does not match app version ${version}. Expected ${expectedTag}.`,
    );
  }
}

if (process.argv.includes("--github-output") && process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\n`, "utf8");
}

console.log(version);
