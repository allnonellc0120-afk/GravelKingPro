import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const productionBuildDefinitions = [
  {
    workflow: "GravelKing Pro web (required production build)",
    artifactPath: "artifacts/gravelkingpro/.replit-artifact/artifact.toml",
    section: "services.production",
    key: "build",
    expected: ["pnpm", "--filter", "@workspace/gravelkingpro", "run", "build"],
  },
  {
    workflow: "GravelKing Pro API (required production build)",
    artifactPath: "artifacts/api-server/.replit-artifact/artifact.toml",
    section: "services.production.build",
    key: "args",
    expected: ["pnpm", "--filter", "@workspace/api-server", "run", "build"],
  },
];

const readinessChecks = [
  {
    workflow: "GravelKing Pro web (required)",
    command: "pnpm",
    args: ["--filter", "@workspace/gravelkingpro", "run", "test"],
  },
  {
    workflow: "GravelKing Pro web (required)",
    command: "pnpm",
    args: ["--filter", "@workspace/gravelkingpro", "run", "typecheck"],
  },
  {
    workflow: "GravelKing Pro API (required)",
    command: "pnpm",
    args: ["--filter", "@workspace/api-server", "run", "typecheck"],
  },
  {
    workflow: "GravelKing Pro API (required; studio-audio test workflow)",
    command: "pnpm",
    args: ["--filter", "@workspace/api-server", "run", "test"],
  },
];

function stripTomlComment(line) {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && !escaped) {
      inString = !inString;
    }
    if (character === "#" && !inString) {
      return line.slice(0, index);
    }
    escaped = character === "\\" && !escaped;
    if (character !== "\\") {
      escaped = false;
    }
  }
  return line;
}

function tomlArrayIsComplete(value) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (character === '"' && !escaped) {
      inString = !inString;
    } else if (!inString && character === "[") {
      depth += 1;
    } else if (!inString && character === "]") {
      depth -= 1;
    }
    escaped = character === "\\" && !escaped;
    if (character !== "\\") {
      escaped = false;
    }
  }
  return depth === 0 && !inString;
}

function parseTomlStringArray(value, sourceDescription) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !tomlArrayIsComplete(trimmed)) {
    throw new Error(`${sourceDescription} must be a complete TOML array`);
  }

  const values = [];
  let index = 1;
  while (index < trimmed.length - 1) {
    while (index < trimmed.length - 1 && /[\s,]/.test(trimmed[index])) {
      index += 1;
    }
    if (index >= trimmed.length - 1) {
      break;
    }
    if (trimmed[index] !== '"') {
      throw new Error(`${sourceDescription} must contain only double-quoted strings`);
    }

    const start = index;
    index += 1;
    let escaped = false;
    for (; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (character === '"' && !escaped) {
        index += 1;
        break;
      }
      escaped = character === "\\" && !escaped;
      if (character !== "\\") {
        escaped = false;
      }
    }
    const token = trimmed.slice(start, index);
    try {
      values.push(JSON.parse(token));
    } catch {
      throw new Error(`${sourceDescription} contains an invalid TOML string`);
    }
  }
  return values;
}

function readTomlStringArray({ artifactPath, section, key }) {
  const absolutePath = resolve(repoRoot, artifactPath);
  let source;
  try {
    source = readFileSync(absolutePath, "utf8");
  } catch {
    throw new Error(`could not read ${artifactPath}`);
  }

  let currentSection = "";
  const lines = source.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = stripTomlComment(lines[lineIndex]).trim();
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    if (currentSection !== section) {
      continue;
    }

    const assignmentMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    if (!assignmentMatch || assignmentMatch[1] !== key) {
      continue;
    }

    let value = assignmentMatch[2];
    while (!tomlArrayIsComplete(value)) {
      lineIndex += 1;
      if (lineIndex >= lines.length) {
        throw new Error(`${artifactPath} [${section}] ${key} is not a complete TOML array`);
      }
      value += ` ${stripTomlComment(lines[lineIndex]).trim()}`;
    }
    return parseTomlStringArray(value, `${artifactPath} [${section}] ${key}`);
  }

  throw new Error(`${artifactPath} is missing [${section}] ${key}`);
}

function commandsMatch(actual, expected) {
  return actual.length === expected.length && actual.every((part, index) => part === expected[index]);
}

function formatCommand(command) {
  return command.map((part) => JSON.stringify(part)).join(" ");
}

function getProductionBuildChecks() {
  const errors = [];
  const checks = [];

  for (const definition of productionBuildDefinitions) {
    let configured;
    try {
      configured = readTomlStringArray(definition);
    } catch (error) {
      errors.push(`${definition.workflow}: ${error.message}`);
      continue;
    }

    if (!commandsMatch(configured, definition.expected)) {
      errors.push(
        [
          `${definition.workflow}: production build command does not match the publish gate.`,
          `  configured: ${formatCommand(configured)}`,
          `  expected:   ${formatCommand(definition.expected)}`,
          `  source:     ${definition.artifactPath}`,
        ].join("\n"),
      );
      continue;
    }

    checks.push({
      workflow: definition.workflow,
      command: configured[0],
      args: configured.slice(1),
    });
  }

  return { checks, errors };
}

function runCheck({ command, args }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code, signal) => resolve(code === 0 && !signal));
  });
}

const { checks: productionBuildChecks, errors: configurationErrors } = getProductionBuildChecks();

console.log("GravelKing Pro publish readiness");
console.log("Required release workflows: web + API");
console.log("Unrelated artifacts and their stopped workflows are not release blockers.\n");

if (configurationErrors.length > 0) {
  console.log("Configuration validation failed before running release checks.");
  for (const error of configurationErrors) {
    console.log(`- ${error}`);
  }
  console.log("\nFAIL — Align the publish gate with the production artifact configuration before publishing.");
  process.exit(1);
}

const results = [];
const checks = [
  ...readinessChecks.slice(0, 2),
  productionBuildChecks[0],
  ...readinessChecks.slice(2),
  productionBuildChecks[1],
];
for (const check of checks) {
  process.stdout.write(`▶ ${check.workflow}: ${check.args.at(-1)}\n`);
  const passed = await runCheck(check);
  results.push({ ...check, passed });
  console.log(`${passed ? "PASS" : "FAIL"} ${check.workflow}: ${check.args.at(-1)}\n`);
}

const failed = results.filter(({ passed }) => !passed);
console.log("Readiness summary");
console.log(`Required checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length === 0) {
  console.log("PASS — GravelKing Pro web and API are ready to publish.");
  process.exit(0);
}

console.log("FAIL — Do not publish until the failed required checks are fixed.");
for (const check of failed) {
  console.log(`- ${check.workflow}: ${check.args.at(-1)}`);
}
process.exit(1);