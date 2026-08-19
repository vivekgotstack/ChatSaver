import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = join(frontendRoot, ".tauri-build");

await rm(stagingRoot, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });

await cp(join(frontendRoot, "src"), join(stagingRoot, "src"), {
  recursive: true,
  filter(source) {
    const relative = source.slice(frontendRoot.length).replaceAll("\\", "/");
    return !relative.startsWith("/src/app/api");
  },
});
const desktopPublicAssets = new Set([
  "/public/art",
  "/public/cs-transparent.png",
  "/public/icon.svg",
]);
await cp(join(frontendRoot, "public"), join(stagingRoot, "public"), {
  recursive: true,
  filter(source) {
    const relative = source.slice(frontendRoot.length).replaceAll("\\", "/");
    return relative === "/public"
      || [...desktopPublicAssets].some(
        (asset) => relative === asset || relative.startsWith(`${asset}/`),
      );
  },
});

for (const file of [
  "next.config.ts",
  "next-env.d.ts",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.json",
]) {
  await copyFile(join(frontendRoot, file), join(stagingRoot, file));
}

const nextCli = join(frontendRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "build"], {
  cwd: stagingRoot,
  env: {
    ...process.env,
    TAURI_BUILD: "true",
    NEXT_PUBLIC_API_ORIGIN:
      process.env.TAURI_API_ORIGIN ?? "https://chatsaver.viveknigam.co.in",
  },
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) process.exit(exitCode);
