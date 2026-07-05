#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const skipDocker = args.has("--skip-docker");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const dockerCmd = process.platform === "win32" ? "docker.exe" : "docker";
const dockerCaCert = process.env["ENTER_DOCKER_CA_CERT"];

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${commandArgs.join(" ")} exited ${code}`));
    });
  });
}

function checkFile(relativePath) {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing required deployment file: ${relativePath}`);
  }
}

function validateManifest() {
  const manifestPath = path.join(root, "packages/teams-bot/teams-manifest/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bot = manifest.bots?.[0];
  if (!bot) throw new Error("Teams manifest must define bots[0]");
  if (bot.scopes?.includes("personal")) {
    throw new Error("Teams manifest must not include personal scope");
  }
  if (!bot.scopes?.includes("team")) {
    throw new Error("Teams manifest must include team scope");
  }
  if (!bot.scopes?.includes("groupchat")) {
    throw new Error("Teams manifest must include groupchat scope");
  }
}

async function main() {
  checkFile(".env.example");
  checkFile("Dockerfile");
  checkFile(".dockerignore");
  checkFile("packages/teams-bot/teams-manifest/manifest.json");
  checkFile("packages/teams-bot/teams-manifest/README.md");
  validateManifest();

  await run(npmCmd, ["test"]);
  await run(npmCmd, ["run", "build:core"]);
  await run(npmCmd, ["run", "build:bot"]);
  await run(npmCmd, ["run", "build:docs"]);

  if (!skipDocker) {
    const dockerArgs = ["build", "-t", "enter-bot:verify"];
    if (dockerCaCert) {
      if (!fs.existsSync(dockerCaCert)) {
        throw new Error(`ENTER_DOCKER_CA_CERT does not exist: ${dockerCaCert}`);
      }
      dockerArgs.push("--secret", `id=enter_ca,src=${dockerCaCert}`);
    }
    dockerArgs.push(".");
    await run(dockerCmd, dockerArgs);
  }

  process.stdout.write("\nDeployment verification passed.\n");
}

main().catch((err) => {
  process.stderr.write(`\nDeployment verification failed: ${err.message}\n`);
  process.exit(1);
});
