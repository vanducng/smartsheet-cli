import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const baseEnv = Object.fromEntries(
  [
    "PATH",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "SystemRoot",
    "COMSPEC",
    "ComSpec",
    "PATHEXT",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "CI",
  ].flatMap((key) =>
    process.env[key] === undefined ? [] : [[key, process.env[key]]],
  ),
);

function execute(command, args, cwd, env) {
  return spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60_000,
  });
}

function run(command, args, cwd, env) {
  const result = execute(command, args, cwd, env);
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed with exit ${result.status ?? "unknown"}.`,
    );
  }
  return result.stdout;
}

function executable(prefix) {
  return process.platform === "win32"
    ? join(prefix, "smartsheet.cmd")
    : join(prefix, "bin", "smartsheet");
}

export async function withPackedCli(check, extraEnv = {}, tarballPath) {
  const temp = mkdtempSync(join(tmpdir(), "smartsheet-cli-package-"));
  const env = { ...baseEnv, ...extraEnv };
  try {
    let files = [];
    let tarball;
    if (tarballPath) {
      tarball = resolve(root, tarballPath);
      if (!existsSync(tarball)) {
        throw new Error("Provided package tarball does not exist.");
      }
    } else {
      const packed = JSON.parse(
        run(
          "npm",
          ["pack", "--json", "--ignore-scripts", "--pack-destination", temp],
          root,
          env,
        ),
      )[0];
      tarball = join(temp, packed.filename);
      files = packed.files.map((file) => file.path);
    }
    const prefix = join(temp, "install");
    run(
      "npm",
      ["install", "--ignore-scripts", "--global", "--prefix", prefix, tarball],
      temp,
      env,
    );
    const packageRoot = join(
      run("npm", ["root", "--global", "--prefix", prefix], temp, env).trim(),
      "@vanducng",
      "smartsheet-cli",
    );
    await check({
      cli: (args) => execute(executable(prefix), args, temp, env),
      files,
      packageRoot,
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function packageSmoke() {
  await withPackedCli(
    async ({ cli, files, packageRoot }) => {
      if (
        files.some(
          (path) =>
            path === ".env" ||
            path.startsWith("src/") ||
            path.includes(".test.") ||
            path.startsWith("node_modules/"),
        )
      ) {
        throw new Error("Packed artifact contains repository-only files.");
      }
      const built = join(packageRoot, "bin", "smartsheet.js");
      if (
        !existsSync(built) ||
        !readFileSync(built, "utf8").startsWith("#!/usr/bin/env node\n")
      ) {
        throw new Error("Installed binary is missing its Node shebang.");
      }
      for (const path of [
        "AGENTS.md",
        "README.md",
        "LICENSE",
        join("docs", "agent-usage.md"),
        join("skills", "smartsheet", "SKILL.md"),
        join("skills", "smartsheet", "agents", "openai.yaml"),
      ]) {
        if (!existsSync(join(packageRoot, path))) {
          throw new Error(`Installed package is missing ${path}.`);
        }
      }

      for (const args of [["--help"], ["--version"]]) {
        const result = cli(args);
        if (
          result.status !== 0 ||
          result.stderr !== "" ||
          result.stdout === ""
        ) {
          throw new Error(`Installed ${args[0]} contract failed.`);
        }
      }

      const invalid = cli(["not-a-command"]);
      if (invalid.status === 0 || invalid.stdout !== "") {
        throw new Error("Installed invalid-command contract failed.");
      }
      const failure = JSON.parse(invalid.stderr);
      if (
        failure.ok !== false ||
        typeof failure.error?.code !== "string" ||
        typeof failure.error?.retryable !== "boolean" ||
        !Array.isArray(failure.error?.next_steps)
      ) {
        throw new Error(
          "Installed invalid-command response is not agent-safe JSON.",
        );
      }
    },
    {},
    process.argv[2],
  );
  console.log("Package smoke: PASS (packed, installed, help, version, errors)");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await packageSmoke();
}
