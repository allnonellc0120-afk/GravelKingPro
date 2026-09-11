import { exec } from "child_process";
import { promisify } from "util";
import * as readline from "readline";

const execAsync = promisify(exec);
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("ERROR: GEMINI_API_KEY environment variable is missing.");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("=== GEMINI CLI WORKSPACE BRIDGE ACTIVE ===");
console.log("Speak or type your command (Type 'exit' to quit):\n");

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{
      parts: [{
        text: `You are an automated Linux terminal execution agent inside a Replit workspace.\nUser instruction: "${prompt}"\nRules:\n1. Inspect the workspace, read files, or run shell fixes directly.\n2. Return ONLY an executable bash script or command block enclosed in \`\`\`bash ... \`\`\` that fulfills the request.\n3. Keep explanation strictly under 2 sentences.`
      }]
    }]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function promptUser() {
  rl.question("Gemini-Bridge > ", async (input) => {
    const query = input.trim();
    if (!query) return promptUser();
    if (query.toLowerCase() === "exit") {
      rl.close();
      process.exit(0);
    }

    try {
      console.log("[Thinking / Auditing...]");
      const text = await callGemini(query);
      const match = text.match(/```bash([\s\S]*?)```/);
      const command = match ? match[1].trim() : null;

      if (command) {
        console.log(`\n--- EXECUTING COMMAND ---\n${command}\n------------------------`);
        const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });
        if (stdout) console.log(`[OUTPUT]:\n${stdout}`);
        if (stderr) console.warn(`[STDERR]:\n${stderr}`);
      } else {
        console.log(`\n[GEMINI]: ${text}`);
      }
    } catch (err) {
      console.error(`[EXEC ERROR]: ${err.message}`);
    }

    promptUser();
  });
}

promptUser();
