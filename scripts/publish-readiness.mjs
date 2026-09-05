import { spawn } from "node:child_process";

const checks = [
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
    workflow: "GravelKing Pro web (required)",
    command: "pnpm",
    args: ["--filter", "@workspace/gravelkingpro", "run", "build"],
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
  {
    workflow: "GravelKing Pro API (required)",
    command: "pnpm",
    args: ["--filter", "@workspace/api-server", "run", "build"],
  },
];

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

console.log("GravelKing Pro publish readiness");
console.log("Required release workflows: web + API");
console.log("Unrelated artifacts and their stopped workflows are not release blockers.\n");

const results = [];
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