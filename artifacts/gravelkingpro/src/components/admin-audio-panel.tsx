import { useEffect, useState } from "react";

type Band = { threshold: number; ratio: number; attack: number; release: number };
type Preset = {
  name: string; basePreset: string; saturationDrive: number; saturationMix: number;
  bands: Band[]; airDb: number; width: number; monoHz: number; targetLufs: -14 | -9 | -7;
};
type Voice = { modelKey: string; indexKey: string; pitchShift: number; indexRate: number; protect: number };
const headers = { "Content-Type": "application/json" };
const blank: Preset = {
  name: "My Master", basePreset: "baseline", saturationDrive: 0, saturationMix: 0,
  bands: [0, 1, 2].map(() => ({ threshold: -18, ratio: 1, attack: 25, release: 150 })),
  airDb: 0, width: 1, monoHz: 120, targetLufs: -14,
};
const ownerHeaders = { "x-admin-user": "allnonellc0120@gmail.com" };

export function AdminAudioPanel() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [defaultName, setDefaultName] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>(blank);
  const [oldName, setOldName] = useState<string | undefined>();
  const [voice, setVoice] = useState<Voice>({ modelKey: "models/gravelking_v2.pth", indexKey: "models/gravelking_v2.index", pitchShift: 0, indexRate: .75, protect: .38 });
  const [persona, setPersona] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`/api/admin/audio${path}`, {
      credentials: "include", ...init,
      headers: { ...ownerHeaders, ...(init?.body instanceof FormData ? {} : headers) },
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`);
    return response;
  }
  async function refresh() {
    const data = await (await request("")).json();
    setPresets(data.presets); setDefaultName(data.defaultName);
    setVoice(data.rvc); setPersona(data.persona);
  }
  useEffect(() => { void refresh().catch(e => setMessage(String(e))); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function action(task: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await task(); setMessage("Saved"); } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const number = (key: keyof Preset, label: string, min: number, max: number, step = .01) =>
    <label className="text-sm">{label}<input className="block w-full rounded border bg-background p-2" type="number" min={min} max={max} step={step}
      value={preset[key] as number} onChange={e => setPreset({ ...preset, [key]: Number(e.target.value) })} /></label>;
  return <section className="space-y-5 rounded-xl border p-5">
    <h2 className="text-xl font-semibold">Audio tuning · live render controls</h2>
    <p className="text-xs text-muted-foreground">Saved DSP presets run on the next mastering render; the global default applies when a render omits a preset.</p>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm">Edit saved preset<select className="block w-full rounded border bg-background p-2" value={oldName ?? ""} onChange={e => {
        const selected = presets.find(p => p.name === e.target.value);
        setOldName(selected?.name); setPreset(selected ? structuredClone(selected) : structuredClone(blank));
      }}><option value="">New preset</option>{presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</select></label>
      <label className="text-sm">Preset name / rename<input className="block w-full rounded border bg-background p-2" value={preset.name} onChange={e => setPreset({ ...preset, name: e.target.value })} /></label>
      <label className="text-sm">Base kernel preset<select className="block w-full rounded border bg-background p-2" value={preset.basePreset} onChange={e => setPreset({ ...preset, basePreset: e.target.value })}>{["baseline","spacious","normal","broadcast","vinyl","podcast","club","film","youtube","soundcloud","apple"].map(p => <option key={p}>{p}</option>)}</select></label>
      {number("saturationDrive", "Sub-harmonic saturation drive", 0, 4)}
      {number("saturationMix", "Saturation wet mix", 0, 1)}
      {number("airDb", "Air / top-end EQ dB", -12, 12)}
      {number("width", "Stereo field width", 0, 2)}
      {number("monoHz", "Low-end mono crossover Hz", 20, 400, 1)}
      <label className="text-sm">Limiter target LUFS<select className="block w-full rounded border bg-background p-2" value={preset.targetLufs} onChange={e => setPreset({ ...preset, targetLufs: Number(e.target.value) as -14 | -9 | -7 })}><option value={-14}>-14 streaming</option><option value={-9}>-9 punch</option><option value={-7}>-7 street heat</option></select></label>
    </div>
    <div className="grid gap-3 md:grid-cols-3">{preset.bands.map((band, i) => <fieldset key={i} className="rounded border p-3"><legend>{["Low", "Mid", "High"][i]} dynamics</legend>{(["threshold", "ratio", "attack", "release"] as const).map(key => <label key={key} className="block text-xs">{key}<input type="number" className="block w-full rounded border bg-background p-2" min={{ threshold: -60, ratio: 1, attack: 1, release: 10 }[key]} max={{ threshold: 0, ratio: 20, attack: 200, release: 2000 }[key]} step=".1" value={band[key]} onChange={e => setPreset({ ...preset, bands: preset.bands.map((b, j) => j === i ? { ...b, [key]: Number(e.target.value) } : b) })} /></label>)}</fieldset>)}</div>
    <div className="flex flex-wrap gap-2"><button className="rounded bg-primary px-4 py-2 text-primary-foreground" disabled={busy} onClick={() => void action(async () => { await request("/presets", { method: "PUT", body: JSON.stringify({ preset, oldName }) }); setOldName(preset.name); await refresh(); })}>Save / rename</button><button className="rounded border px-4 py-2" disabled={busy || !oldName} onClick={() => void action(async () => { await request("/default", { method: "PUT", body: JSON.stringify({ name: oldName }) }); await refresh(); })}>Set global default</button><span className="text-sm">Global: {defaultName ?? "built-in baseline"}</span></div>
    <h3 className="font-semibold">RVC voice & JAX persona</h3>
    <div className="grid gap-3 md:grid-cols-2">{(["modelKey", "indexKey"] as const).map(key => <label key={key} className="text-sm">{key} (bucket models/...)<input className="block w-full rounded border bg-background p-2" value={voice[key]} onChange={e => setVoice({ ...voice, [key]: e.target.value })} /></label>)}
      {(["pitchShift", "indexRate", "protect"] as const).map(key => <label key={key} className="text-sm">{key}: {voice[key]}<input className="block w-full" type="range" min={key === "pitchShift" ? -24 : 0} max={key === "pitchShift" ? 24 : 1} step={key === "pitchShift" ? 1 : .01} value={voice[key]} onChange={e => setVoice({ ...voice, [key]: Number(e.target.value) })} /></label>)}</div>
    <label className="block text-sm">Lyrical directives, tone and cadence<textarea className="mt-1 block min-h-28 w-full rounded border bg-background p-2" maxLength={4000} value={persona} onChange={e => setPersona(e.target.value)} /></label>
    <button className="rounded bg-primary px-4 py-2 text-primary-foreground" disabled={busy} onClick={() => void action(async () => { await request("/voice", { method: "PATCH", body: JSON.stringify({ ...voice, persona }) }); await refresh(); })}>Save voice & persona</button>
    <div className="space-y-2"><h3 className="font-semibold">Real pipeline voice preview</h3><input type="file" accept="audio/mpeg,.mp3" onChange={e => setFile(e.target.files?.[0] ?? null)} /><button className="rounded border px-4 py-2" disabled={busy || !file} onClick={() => void action(async () => { const body = new FormData(); body.append("audio", file!); const response = await request("/preview", { method: "POST", body }); setPreview(URL.createObjectURL(await response.blob())); })}>Render preview</button>{preview && <audio controls src={preview} />}</div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}