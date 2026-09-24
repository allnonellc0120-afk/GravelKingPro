import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Log = { kind: string; text: string };
async function streamRequest(path: string, body: unknown, onEvent: (event: string, data: Record<string, unknown>) => void) {
  const response = await fetch(path, { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("Streaming response is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = frame.split(/\r?\n/).find(line => line.startsWith("event:"))?.slice(6).trim() ?? "message";
      const data = frame.split(/\r?\n/).find(line => line.startsWith("data:"))?.slice(5).trim();
      if (data) onEvent(event, JSON.parse(data) as Record<string, unknown>);
    }
    if (done) break;
  }
}

export function AdminIntelligencePanel() {
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState("");
  const [history, setHistory] = useState<Array<{ role: "user" | "model"; text: string }>>([]);
  const [task, setTask] = useState("uptime");
  const [terminal, setTerminal] = useState<Log[]>([]);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentOutput, setAgentOutput] = useState("");
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<Array<{ email: string; phone?: string; subject: string; body: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const log = (kind: string, text: string) => setTerminal(items => [...items.slice(-200), { kind, text }]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  const outbound = { recipients, subject, body };
  return <section className="space-y-4" aria-label="Admin intelligence and automation">
    <Card><CardContent className="pt-5 space-y-3">
      <h2 className="font-semibold">JAX · live operational intelligence</h2>
      <p className="text-xs text-muted-foreground">Gemini receives live, redacted schema, recent tool errors, runtime presets, system load and observed funnel counts. It cannot modify your workspace.</p>
      <textarea aria-label="Ask JAX" value={prompt} maxLength={4000} onChange={e => setPrompt(e.target.value)} className="w-full bg-secondary/40 border rounded p-2 min-h-20" placeholder="Ask about a mastering preset, an error or the funnel…" />
      <Button disabled={busy || !prompt.trim()} onClick={() => void run(async () => {
        setChat("");
        let answer = "";
        await streamRequest("/api/admin/jax/chat", { prompt, history }, (event, data) => {
          if (event === "token") { answer += String(data.text ?? ""); setChat(answer); }
          if (event === "exit" && data.status !== 0) log("error", String(data.error ?? "Gemini request failed"));
        });
        if (answer) setHistory([...history, { role: "user" as const, text: prompt }, { role: "model" as const, text: answer }].slice(-12));
      })}>Ask JAX</Button>
      <div className="whitespace-pre-wrap text-sm rounded border p-3 min-h-12" aria-live="polite">{chat}</div>
      <h3 className="font-medium">Fixed operational runner</h3>
      <p className="text-xs text-muted-foreground">No shell input is accepted. Migration takes an exact confirmation and uses bounded SQL timeouts.</p>
      <div className="flex gap-2 flex-wrap">
        <select aria-label="Allowed task" value={task} onChange={e => setTask(e.target.value)} className="bg-secondary border rounded p-2">
          {["uptime", "disk", "memory", "curl-health", "curl-home", "analytics-visitor-index"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button disabled={busy} onClick={() => void run(async () => {
          const confirm = task === "analytics-visitor-index" ? window.prompt("Confirm index migration by typing CREATE analytics-visitor-index") : undefined;
          if (task === "analytics-visitor-index" && confirm !== "CREATE analytics-visitor-index") return;
          log("task", `> ${task}`);
          await streamRequest("/api/admin/jax/run", { task, confirm }, (event, data) => {
            if (event === "output") log("stdout", String(data.text ?? ""));
            if (event === "exit") log(data.status === 0 ? "exit" : "error", `Exit ${data.status}${data.error ? `: ${data.error}` : ""}`);
          });
        })}>Run selected task</Button>
      </div>
      <div aria-live="polite" className="bg-black/80 text-green-300 font-mono text-xs rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap">
        {terminal.map((line, index) => <div key={index} className={line.kind === "error" ? "text-red-300" : ""}>{line.text}</div>)}
      </div>
    </CardContent></Card>
    <Card><CardContent className="pt-5 space-y-3">
      <h2 className="font-semibold">Direct agent webhook</h2>
      <p className="text-xs text-muted-foreground">Sends a bounded prompt only to the deployment-configured HTTPS agent. No browser-selected endpoints or credentials. An unconfigured agent fails explicitly.</p>
      <textarea aria-label="Agent prompt" maxLength={4000} value={agentPrompt} onChange={e => setAgentPrompt(e.target.value)} className="w-full bg-secondary/40 border rounded p-2 min-h-20" />
      <Button disabled={busy || !agentPrompt.trim()} onClick={() => void run(async () => {
        const response = await fetch("/api/admin/automation/agent", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: agentPrompt }) });
        const result = await response.json() as { error?: string; output?: string; status?: number };
        if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
        setAgentOutput(`HTTP ${result.status}: ${result.output ?? ""}`);
      })}>Trigger agent</Button>
      <pre className="whitespace-pre-wrap break-all text-xs max-h-48 overflow-auto" aria-live="polite">{agentOutput}</pre>
    </CardContent></Card>
    <Card><CardContent className="pt-5 space-y-3">
      <h2 className="font-semibold">Bulk outreach · SendGrid</h2>
      <p className="text-xs text-muted-foreground">Up to 100 opted-in recipients supplied by you. CSV columns: email,name,phone,link,artist_id; or one email per line. Phone numbers are imported for review only; SMS is not available. Variables: {"{name}"}, {"{link}"}, {"{artist_id}"}. Provider acceptance does not prove inbox delivery.</p>
      <textarea aria-label="Recipient CSV or email list" value={recipients} onChange={e => { setRecipients(e.target.value); setPreview(null); }} maxLength={30000} className="w-full bg-secondary/40 border rounded p-2 min-h-28" placeholder={"email,name,phone,link,artist_id\nrecipient@example.com,Artist,,https://example.com,artist-1"} />
      <input aria-label="Outreach subject" value={subject} onChange={e => { setSubject(e.target.value); setPreview(null); }} className="w-full bg-secondary/40 border rounded p-2" placeholder="Subject" />
      <textarea aria-label="Outreach template" value={body} onChange={e => { setBody(e.target.value); setPreview(null); }} className="w-full bg-secondary/40 border rounded p-2 min-h-24" placeholder="Hello {name}, see {link}" />
      <Button disabled={busy} variant="outline" onClick={() => void run(async () => {
        const response = await fetch("/api/admin/automation/outreach/preview", { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(outbound) });
        const result = await response.json() as { previews?: typeof preview; error?: string };
        if (!response.ok || !result.previews) throw new Error(result.error ?? "Preview failed");
        setPreview(result.previews);
      })}>Review exact messages</Button>
      {preview && <>
        <p className="text-sm">Review {preview.length} messages before dispatch. Send only to recipients who consented.</p>
        <div className="max-h-48 overflow-auto text-xs border rounded p-2 space-y-2">{preview.map(p =>
          <div key={p.email} className="border-b pb-2"><strong>{p.email}</strong> {p.phone && `· ${p.phone}`}<div>{p.subject}</div><div className="whitespace-pre-wrap">{p.body}</div></div>)}</div>
        <Button disabled={busy} onClick={() => void run(async () => {
          if (window.prompt(`Send ${preview.length} individual emails? Type SEND OUTREACH`) !== "SEND OUTREACH") return;
          setPreview(null);
          await streamRequest("/api/admin/automation/outreach/send", { ...outbound, confirm: "SEND OUTREACH" }, (event, data) => {
            if (event === "recipient") log("recipient", `${data.email}: ${data.status}`);
            if (event === "exit") log(data.status === 0 ? "exit" : "error", `Exit ${data.status} · accepted ${data.sent} · failed ${data.failed}`);
          });
        })}>Confirm and send {preview.length}</Button>
      </>}
    </CardContent></Card>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </section>;
}