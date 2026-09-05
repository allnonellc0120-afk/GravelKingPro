import { readFileSync, writeFileSync } from "node:fs";

const templatePath = "/tmp/template.csv";
const sourcePath = "deliverables/gravelkingpro-google-play-data-safety.csv";
const outputPath = sourcePath;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const template = parseCsv(readFileSync(templatePath, "utf8"));
const source = parseCsv(readFileSync(sourcePath, "utf8"));
const sourceAnswers = new Map(
  source.slice(1).map(([questionId, responseId, value]) => [
    `${questionId}\u0000${responseId}`,
    value,
  ]),
);

const answers = new Map(sourceAnswers);
const set = (questionId, responseId, value) => {
  answers.set(`${questionId}\u0000${responseId}`, value);
};

// Current account creation is through Replit OIDC OAuth; there is no local
// username/password account flow.
set("PSL_SUPPORTED_ACCOUNT_CREATION_METHODS", "PSL_ACM_OAUTH", "true");
set("PSL_ACCOUNT_DELETION_URL", "", "https://gravelkingpro.com/data-deletion");
set("PSL_SUPPORT_DATA_DELETION_BY_USER", "DATA_DELETION_YES", "true");
set("PSL_DATA_DELETION_URL", "", "https://gravelkingpro.com/data-deletion");

// The current template uses this question ID for the deletion mechanism.
answers.delete("PSL_DATA_COLLECTION_USER_REQUEST_DELETE\u0000");

const output = template
  .map((row, index) => {
    if (index === 0) return row;
    const [questionId, responseId, , requirement, label] = row;
    const key = `${questionId}\u0000${responseId}`;
    const value = answers.has(key) ? answers.get(key) : "";
    return [questionId, responseId, value, requirement, label];
  })
  .map((row) => row.map(csvCell).join(","))
  .join("\n") + "\n";

writeFileSync(outputPath, output);
writeFileSync("/tmp/gravelking-data-safety.csv", output);
console.log(`Prepared ${template.length - 1} current-template rows.`);