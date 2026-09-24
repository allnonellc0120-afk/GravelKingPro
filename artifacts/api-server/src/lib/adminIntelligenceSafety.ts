export function redactDiagnostics(input: string): string {
  return input
    .replace(/(?:sk|AIza|SG)[-_A-Za-z0-9]{16,}/g, "[REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/(?:Bearer\s+|(?:api[_-]?key|secret|token|password)\s*[:=]\s*)[^\s"',;]+/gi, "[REDACTED]")
    .replace(/https?:\/\/[^\s"']+/gi, "[URL]")
    .slice(0, 16000);
}

export type Recipient = { name: string; email: string; phone?: string; link?: string; artist_id?: string };
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]{2,}$/;
const VARIABLES = new Set(["name", "link", "artist_id"]);

export function parseRecipients(text: string): Recipient[] {
  if (typeof text !== "string" || text.length > 30000) throw new Error("Recipient input exceeds 30 KB.");
  // Quoted RFC4180 CSV cells, including escaped double quotes and embedded line breaks.
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (!quoted && !cell) quoted = true;
      else if (quoted) quoted = false;
      else throw new Error("Malformed CSV quotation.");
    } else if (quoted) cell += ch;
    else if (ch === ",") { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (quoted) throw new Error("Unclosed CSV quotation.");
  if (row.length || cell) { row.push(cell.trim()); rows.push(row); }
  if (!rows.length) throw new Error("Recipient list is empty.");
  const header = rows[0]!.map(v => v.toLowerCase());
  const hasHeader = header.includes("email");
  const columns = hasHeader ? header : ["email", "name", "phone", "link", "artist_id"];
  const data = hasHeader ? rows.slice(1) : rows;
  if (data.length > 100) throw new Error("Maximum 100 recipients per dispatch.");
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const [index, values] of data.entries()) {
    if (values.every(v => !v)) continue;
    const get = (key: string) => values[columns.indexOf(key)]?.trim() ?? "";
    const email = get("email").toLowerCase();
    if (!EMAIL.test(email)) throw new Error(`Invalid email at row ${index + (hasHeader ? 2 : 1)}.`);
    if (seen.has(email)) throw new Error(`Duplicate address at row ${index + (hasHeader ? 2 : 1)}.`);
    seen.add(email);
    const record = { name: get("name").slice(0, 120), email, phone: get("phone").slice(0, 40),
      link: get("link").slice(0, 500), artist_id: get("artist_id").slice(0, 120) };
    if (record.link && (!/^https:\/\//i.test(record.link) || /[\r\n]/.test(record.link))) throw new Error(`Invalid HTTPS link at row ${index + 1}.`);
    recipients.push(record);
  }
  if (!recipients.length) throw new Error("Recipient list is empty.");
  return recipients;
}

export function mergeTemplate(template: string, recipient: Recipient): string {
  if (typeof template !== "string" || !template.trim() || template.length > 10000) throw new Error("Template is required (max 10 KB).");
  return template.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    if (!VARIABLES.has(key)) throw new Error(`Unsupported merge variable: ${key}`);
    return recipient[key as keyof Recipient] ?? "";
  });
}

export function validatedAgentUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
      /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(url.hostname) ||
      /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(":")) {
    throw new Error("Agent target must be an HTTPS public hostname without credentials, port or query.");
  }
  return url;
}