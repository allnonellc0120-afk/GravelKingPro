import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Pen, Music, Download, RefreshCw, Zap, Copy, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type Genre = "hiphop" | "rnb" | "pop" | "trap" | "lofi" | "gospel" | "soul" | "country";
type Mood = "uplifting" | "dark" | "romantic" | "aggressive" | "chill" | "melancholic" | "triumphant" | "introspective";
type Structure = "verse-chorus" | "aaba" | "verse-chorus-bridge" | "through-composed";

const GENRES: { id: Genre; label: string; emoji: string }[] = [
  { id: "hiphop", label: "Hip Hop", emoji: "🎤" },
  { id: "rnb", label: "R&B", emoji: "🎵" },
  { id: "pop", label: "Pop", emoji: "🌟" },
  { id: "trap", label: "Trap", emoji: "🔥" },
  { id: "lofi", label: "Lo-fi", emoji: "☕" },
  { id: "gospel", label: "Gospel", emoji: "✨" },
  { id: "soul", label: "Soul", emoji: "💿" },
  { id: "country", label: "Country", emoji: "🎸" },
];

const MOODS: { id: Mood; label: string }[] = [
  { id: "uplifting", label: "Uplifting" }, { id: "dark", label: "Dark" },
  { id: "romantic", label: "Romantic" }, { id: "aggressive", label: "Aggressive" },
  { id: "chill", label: "Chill" }, { id: "melancholic", label: "Melancholic" },
  { id: "triumphant", label: "Triumphant" }, { id: "introspective", label: "Introspective" },
];

const THEMES: Record<Genre, string[]> = {
  hiphop: ["rise from nothing", "street wisdom", "loyalty", "legacy", "grind"],
  rnb: ["love lost", "midnight feelings", "devotion", "healing", "desire"],
  pop: ["freedom", "chasing dreams", "heartbreak", "new beginnings", "self-love"],
  trap: ["hustle", "pressure", "trap life", "paper", "come up"],
  lofi: ["rainy days", "nostalgia", "solitude", "daydream", "late night"],
  gospel: ["faith", "redemption", "grace", "gratitude", "salvation"],
  soul: ["pain and beauty", "real love", "roots", "forgiveness", "strength"],
  country: ["hometown", "open road", "heartland", "working hard", "family"],
};

const RHYME_PATTERNS: Record<string, string> = {
  aabb: "AABB (paired rhymes)",
  abab: "ABAB (alternating rhymes)",
  abcb: "ABCB (ballad)",
  aaaa: "AAAA (monorhyme)",
};

function generateLyrics(
  genre: Genre,
  mood: Mood,
  theme: string,
  title: string,
  bpm: number[],
  structure: Structure,
  rhyme: string,
  artist: string
): string {
  const isSlowBpm = bpm[0] < 90;
  const isFastBpm = bpm[0] > 130;
  const tempoWord = isSlowBpm ? "slow" : isFastBpm ? "fast" : "steady";

  const moodPhrases: Record<Mood, string[]> = {
    uplifting: ["rise above", "light through the dark", "reach higher", "never give up", "break through"],
    dark: ["shadows follow", "no way out", "lost in the night", "broken silence", "cold and empty"],
    romantic: ["your touch lingers", "all I need", "forever with you", "souls aligned", "love runs deep"],
    aggressive: ["won't back down", "take what's mine", "fire in my veins", "no retreat", "standing tall"],
    chill: ["take it slow", "drift away", "easy like Sunday", "breathe it in", "let it flow"],
    melancholic: ["what could have been", "fading memories", "hollow echoes", "left behind", "silence speaks"],
    triumphant: ["we made it through", "standing on the top", "earned every scar", "glory hard-won", "champions rise"],
    introspective: ["who am I now", "mirrors never lie", "deep within", "truth finds me", "quiet revelation"],
  };

  const genrePhrases: Record<Genre, { verse: string[]; hook: string }> = {
    hiphop: {
      verse: ["flow like a river, sharp like a blade", "bars built from concrete, mind unafraid", "every word weighted, every line paid", "streets wrote my story, this the upgrade"],
      hook: "yeah, we came from nothing / now look at where we at / every move intentional / never looking back",
    },
    rnb: {
      verse: ["late night melodies, you fill my soul", "every note we breathe makes the story whole", "smooth like velvet, warm like summer gold", "this feeling between us, worth more than told"],
      hook: "I don't need the world / just need your light / staying close to you / feels like doing right",
    },
    pop: {
      verse: ["standing at the edge of something new", "heartbeat syncing up with my breakthrough", "colors bleeding into morning dew", "every single day I'm finding you"],
      hook: "let the feeling take us higher / burning bright like open fire / we don't need to ask permission / living out our own decision",
    },
    trap: {
      verse: ["started from the bottom, no cap on the grind", "every single day I left the past behind", "racks on the table, keep the circle tight", "pressure make diamonds when you do it right"],
      hook: "all I know is hustle / all I breathe is real / from the trap to the top / this how winners feel",
    },
    lofi: {
      verse: ["coffee getting cold beside my notebook page", "rainy window watching as I come of age", "vinyl spinning soft in golden afternoon", "words come easy when I'm underneath the moon"],
      hook: "just another quiet night / just another page / writing out the feelings / that I can't quite place",
    },
    gospel: {
      verse: ["every valley lifted, every mountain moved", "faith don't waver when the spirit's proved", "grace sufficient, mercy runs so deep", "promises He made are His to keep"],
      hook: "hallelujah, we made it through / every storm was worth it / leading back to You",
    },
    soul: {
      verse: ["real love ain't easy, takes a steady hand", "years of understanding, that's the common strand", "roots run deeper than the eye can see", "soul to soul connection sets us free"],
      hook: "it's a soul thing / deeper than the skin / love that stands the seasons / love that grows within",
    },
    country: {
      verse: ["back road running, radio loud and clear", "hometown calling every single year", "mama's porch and daddy's old guitar", "found my way back underneath these stars"],
      hook: "take me back to where the heart is / simple roads and open skies / where the truth don't need no polish / just your eyes and fireflies",
    },
  };

  const moodP = moodPhrases[mood];
  const genreP = genrePhrases[genre];
  const themeWords = THEMES[genre];

  const finalTheme = theme || themeWords[Math.floor(Math.random() * themeWords.length)];
  const songTitle = title || `${finalTheme.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}`;
  const artistLine = artist ? `Written for: ${artist}` : "";

  const lines: string[] = [];

  lines.push(`╔═══════════════════════════════╗`);
  lines.push(`  "${songTitle.toUpperCase()}"`);
  if (artistLine) lines.push(`  ${artistLine}`);
  lines.push(`  Genre: ${GENRES.find(g => g.id === genre)?.label} | Mood: ${mood} | BPM: ${bpm[0]} (${tempoWord})`);
  lines.push(`  Theme: ${finalTheme}`);
  lines.push(`╚═══════════════════════════════╝`);
  lines.push(``);

  if (structure === "verse-chorus" || structure === "verse-chorus-bridge") {
    lines.push(`[Verse 1]`);
    genreP.verse.forEach(l => lines.push(l));
    lines.push(`${moodP[0]}, let it ride`);
    lines.push(`${finalTheme} — can't be denied`);
    lines.push(``);
    lines.push(`[Chorus]`);
    genreP.hook.split(" / ").forEach(l => lines.push(l));
    lines.push(`${moodP[2]} — this is my time`);
    lines.push(``);
    lines.push(`[Verse 2]`);
    genreP.verse.slice().reverse().forEach(l => lines.push(l));
    lines.push(`${moodP[1]}, eyes on the prize`);
    lines.push(`${finalTheme} — watch me rise`);
    lines.push(``);
    lines.push(`[Chorus]`);
    genreP.hook.split(" / ").forEach(l => lines.push(l));
    lines.push(`${moodP[2]} — this is my time`);

    if (structure === "verse-chorus-bridge") {
      lines.push(``);
      lines.push(`[Bridge]`);
      lines.push(`${moodP[3]}`);
      lines.push(`${moodP[4]}`);
      lines.push(`everything they said I couldn't do`);
      lines.push(`became the reason I pushed through`);
      lines.push(``);
      lines.push(`[Final Chorus]`);
      genreP.hook.split(" / ").forEach(l => lines.push(l));
      lines.push(`${moodP[2]} — forever this time`);
    }
  } else if (structure === "aaba") {
    lines.push(`[Section A]`);
    genreP.verse.slice(0, 2).forEach(l => lines.push(l));
    lines.push(``);
    lines.push(`[Section A]`);
    genreP.verse.slice(2).forEach(l => lines.push(l));
    lines.push(``);
    lines.push(`[Section B — Bridge]`);
    lines.push(`${moodP[3]}, ${moodP[4]}`);
    lines.push(`${finalTheme} runs through my soul`);
    lines.push(``);
    lines.push(`[Section A — Final]`);
    genreP.verse.slice(0, 2).forEach(l => lines.push(l));
  } else {
    genreP.verse.forEach(l => lines.push(l));
    lines.push(``);
    genreP.hook.split(" / ").forEach(l => lines.push(l));
    lines.push(``);
    lines.push(`${moodP[0]}, ${moodP[1]}`);
    lines.push(`${finalTheme} defines this`);
  }

  lines.push(``);
  lines.push(`────────────────────────────────`);
  lines.push(`Generated by GravelKing Productions Songwriter`);
  lines.push(`Rhyme scheme: ${RHYME_PATTERNS[rhyme]} | Structure: ${structure}`);

  return lines.join("\n");
}

export default function SongBot() {
  const [genre, setGenre] = useState<Genre>("hiphop");
  const [mood, setMood] = useState<Mood>("uplifting");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [theme, setTheme] = useState("");
  const [bpm, setBpm] = useState([95]);
  const [structure, setStructure] = useState<Structure>("verse-chorus-bridge");
  const [rhyme, setRhyme] = useState("abab");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleGenerate = () => {
    setGenerating(true);
    setOutput("");
    setTimeout(() => {
      const lyrics = generateLyrics(genre, mood, theme, title, bpm, structure, rhyme, artist);
      setOutput(lyrics);
      setGenerating(false);
    }, 800);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GKP_${(title || "song").replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">Songwriter</h1>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">Free</Badge>
            </div>
            <p className="text-muted-foreground text-sm">Generate structured song lyrics — verse, chorus, bridge — in any genre.</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
            <Zap className="w-3.5 h-3.5" /> GravelKing Productions
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-4">
            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-5 space-y-4">
                <span className="font-medium text-sm flex items-center gap-2"><Pen className="w-4 h-4 text-amber-500" /> Song Details</span>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Song Title (optional)</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-secondary/40 border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
                    placeholder="Leave blank to auto-generate"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Artist / Stage Name (optional)</label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className="w-full bg-secondary/40 border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
                    placeholder="Your name or artist name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Theme / Concept (optional)</label>
                  <input
                    type="text"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full bg-secondary/40 border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
                    placeholder={`e.g. "${THEMES[genre][0]}"`}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Genre</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {GENRES.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setGenre(g.id)}
                        className={`text-center py-1.5 px-2 rounded-lg border text-xs transition-colors ${genre === g.id ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-border/40 bg-secondary/20 hover:border-amber-500/40"}`}
                      >
                        <div className="text-base">{g.emoji}</div>
                        <div className="text-[10px] mt-0.5">{g.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-5 space-y-4">
                <span className="font-medium text-sm flex items-center gap-2"><Music className="w-4 h-4 text-amber-500" /> Composition Settings</span>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Mood</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MOODS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMood(m.id)}
                        className={`text-left px-3 py-1.5 rounded-lg border text-xs transition-colors ${mood === m.id ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-border/40 bg-secondary/20 hover:border-amber-500/40"}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-xs text-muted-foreground">BPM</label>
                    <span className="text-xs font-mono text-amber-400">{bpm[0]}</span>
                  </div>
                  <Slider value={bpm} onValueChange={setBpm} min={60} max={180} step={1} />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60">
                    <span>Slow (60)</span><span>Mid (120)</span><span>Fast (180)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Structure</label>
                    <Select value={structure} onValueChange={(v) => setStructure(v as Structure)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verse-chorus">Verse / Chorus</SelectItem>
                        <SelectItem value="verse-chorus-bridge">V / C / Bridge</SelectItem>
                        <SelectItem value="aaba">AABA</SelectItem>
                        <SelectItem value="through-composed">Through-composed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Rhyme Scheme</label>
                    <Select value={rhyme} onValueChange={setRhyme}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(RHYME_PATTERNS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-11"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating
                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Writing lyrics...</>
                    : <><Pen className="w-4 h-4 mr-2" />Generate Song</>
                  }
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Output */}
          <div className="space-y-3">
            <AnimatePresence>
              {output && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <Card className="border-border/40 bg-card/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">Generated Lyrics</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={handleCopy}>
                            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={handleDownload}>
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={handleGenerate}>
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={output}
                        onChange={(e) => setOutput(e.target.value)}
                        className="font-mono text-xs bg-secondary/20 border-border/30 min-h-[480px] resize-none leading-relaxed"
                      />
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
            {!output && !generating && (
              <div className="flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed border-border/30 text-center gap-3 p-6">
                <Pen className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">Set your parameters and click <strong>Generate Song</strong></p>
                <p className="text-xs text-muted-foreground/60">Supports Hip Hop, R&B, Pop, Trap, Lo-fi, Gospel, Soul, Country</p>
              </div>
            )}
          </div>
        </div>

      </motion.div>
    </Layout>
  );
}
