/**
 * Dynamic preset style-tag pills with smart refresh (🎲).
 *
 * Renders a row of clickable tag pills below a style-prompt input. Tapping a
 * pill APPENDS the tag to the prompt (never wipes existing text). The dice
 * button re-rolls a fresh mix of instrument / mood / genre / texture tags,
 * tailored to whether vocals (lyrics) are ON or OFF.
 *
 * Shared by the Lyric Studio generate card and the Mastering Tool remix modal.
 */
import { useEffect, useState } from "react";
import { Dices } from "lucide-react";

const INSTRUMENTS = [
  "Southern Harmonica", "Acoustic Guitar", "Cinematic Strings", "808 Bass",
  "Brass Section", "Slide Guitar", "Rhodes Keys", "Church Organ",
  "Upright Bass", "Analog Synth Pads", "Trap Hi-Hats", "Live Drum Kit",
  "Talkbox", "Dobro Resonator", "Muted Trumpet", "Wurlitzer Piano",
];

// All descriptors are purely musical/sonic — no violent, explicit, or
// artist-referencing language — so a tag alone can never trip Vertex AI's
// content policy filter.
const MOODS = [
  "Gritty Soul", "Late-Night Melancholy", "Triumphant", "Smoky and Slow",
  "Dark Cinematic", "Sun-Drenched", "Moody Bounce", "Warm Nostalgia",
  "Confident Swagger", "Rain-Soaked Blues",
];

const GENRES = [
  "Southern Hip-Hop", "Country Trap", "Neo-Soul", "Gospel Blues",
  "Phonk", "Delta Blues", "Lo-fi R&B", "Arena Rock", "Outlaw Country",
];

const TEXTURES = [
  "Vinyl Crackle", "Tape Saturation", "Reverb-Washed",
  "Stripped-Down Acoustic", "Stadium Reverb", "Dusty Sample Chops",
];

/** Only meaningful when vocals are ON. */
const VOCAL_TAGS = [
  "Stacked Harmonies", "Gospel Choir Backing", "Gravelly Lead Vocal",
  "Rapid-Fire Verses", "Call-and-Response Hooks", "Falsetto Hooks",
  "Spoken-Word Bridge",
];

/** Only meaningful when vocals are OFF (instrumental). */
const INSTRUMENTAL_TAGS = [
  "Melodic Lead Guitar Hook", "Orchestral Swells", "Extended Solo Section",
  "Evolving Synth Arpeggios", "Breakdown and Build",
];

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function rollTags(lyricsOn: boolean): string[] {
  const pick = (pool: readonly string[], n: number) => shuffle(pool).slice(0, n);
  return shuffle([
    ...pick(INSTRUMENTS, 3),
    ...pick(MOODS, 2),
    ...pick(GENRES, 1),
    ...pick(TEXTURES, 1),
    ...pick(lyricsOn ? VOCAL_TAGS : INSTRUMENTAL_TAGS, 1),
  ]);
}

/** Append a tag to an existing prompt without wiping it (comma-separated, no dupes). */
export function appendStyleTag(existing: string, tag: string): string {
  if (existing.toLowerCase().includes(tag.toLowerCase())) return existing;
  const trimmed = existing.replace(/[\s,]+$/, "");
  return trimmed ? `${trimmed}, ${tag}` : tag;
}

export function StyleTagPills({
  lyricsOn,
  onAppend,
}: {
  lyricsOn: boolean;
  onAppend: (tag: string) => void;
}) {
  const [tags, setTags] = useState<string[]>(() => rollTags(lyricsOn));

  // Re-roll when the vocals toggle flips so vocal-specific tags never show in
  // instrumental mode (and vice versa).
  useEffect(() => {
    setTags(rollTags(lyricsOn));
  }, [lyricsOn]);

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="style-tag-pills">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onAppend(tag)}
          className="px-2 py-1 rounded-full text-[11px] font-medium border border-amber-500/25 bg-amber-500/5 text-amber-300/90 hover:border-amber-500/60 hover:bg-amber-500/15 transition-colors"
          title={`Add "${tag}" to your style prompt`}
        >
          {tag}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setTags(rollTags(lyricsOn))}
        className="p-1.5 rounded-full border border-border/40 text-muted-foreground hover:text-amber-300 hover:border-amber-500/50 transition-colors"
        aria-label="Refresh preset tags"
        title="Re-roll preset tags"
      >
        <Dices className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
