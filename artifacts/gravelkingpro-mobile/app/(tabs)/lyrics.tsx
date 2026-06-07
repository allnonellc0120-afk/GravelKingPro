import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

type LrcLine = { timeMs: number; text: string };
type Track = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  syncedLyrics: string | null;
  plainLyrics: string | null;
};

function parseLrc(raw: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^\[(\d+):(\d+\.\d+)\](.*)/);
    if (m) {
      const ms = parseInt(m[1]) * 60000 + Math.round(parseFloat(m[2]) * 1000);
      lines.push({ timeMs: ms, text: m[3].trim() });
    }
  }
  return lines;
}

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const min = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export default function LyricsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Track | null>(null);

  const s = styles(colors);

  async function search() {
    if (!query.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setSearched(true);
    setResults([]);
    setSelected(null);
    try {
      const res = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query.trim())}`,
        { headers: { "Lrclib-Client": "GravelKingPro/1.0" } }
      );
      const data: Track[] = await res.json();
      setResults(Array.isArray(data) ? data.slice(0, 20) : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function selectTrack(track: Track) {
    setSelected(track);
    Haptics.selectionAsync();
  }

  // ── Lyrics detail view ──────────────────────────────────────────────────────
  if (selected) {
    const lrcLines = selected.syncedLyrics ? parseLrc(selected.syncedLyrics) : [];
    const plainLines = selected.plainLyrics?.split("\n") ?? [];
    const hasLyrics = lrcLines.length > 0 || plainLines.some(l => l.trim());

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[
          s.content,
          { paddingTop: isWeb ? 67 + insets.top : insets.top + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => setSelected(null)} style={s.backRow}>
          <Feather name="chevron-left" size={20} color={colors.primary} />
          <Text style={[s.backText, { color: colors.primary }]}>Search Results</Text>
        </Pressable>

        <Text style={[s.trackTitle, { color: colors.foreground }]}>{selected.trackName}</Text>
        <Text style={[s.trackArtist, { color: colors.mutedForeground }]}>{selected.artistName}</Text>

        <View style={s.metaRow}>
          {selected.syncedLyrics && (
            <View style={[s.lrcBadge, { backgroundColor: colors.primary }]}>
              <Feather name="clock" size={10} color={colors.primaryForeground} />
              <Text style={[s.lrcBadgeText, { color: colors.primaryForeground }]}>SYNCED LRC</Text>
            </View>
          )}
          <Text style={[s.metaDuration, { color: colors.mutedForeground }]}>
            {Math.floor(selected.duration / 60)}:{String(selected.duration % 60).padStart(2, "0")}
          </Text>
        </View>

        {hasLyrics ? (
          <View style={[s.lyricsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {lrcLines.length > 0
              ? lrcLines.map((l, i) => (
                  <View key={i} style={s.lrcLine}>
                    <Text style={[s.lrcTime, { color: colors.primary }]}>{fmtTime(l.timeMs)}</Text>
                    <Text style={[s.lrcText, { color: l.text ? colors.foreground : colors.mutedForeground }]}>
                      {l.text || "♪"}
                    </Text>
                  </View>
                ))
              : plainLines.map((l, i) => (
                  <Text key={i} style={[s.plainLine, { color: l.trim() ? colors.foreground : "transparent" }]}>
                    {l || " "}
                  </Text>
                ))
            }
          </View>
        ) : (
          <View style={[s.lyricsBox, s.noLyricsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="music" size={24} color={colors.mutedForeground} />
            <Text style={[s.noLyricsText, { color: colors.mutedForeground }]}>
              No lyrics available for this track
            </Text>
          </View>
        )}

        <Text style={[s.attribution, { color: colors.mutedForeground }]}>
          Lyrics via lrclib.net · GravelKing Protocol
        </Text>
      </ScrollView>
    );
  }

  // ── Search view ─────────────────────────────────────────────────────────────
  const topPad = isWeb ? 67 + insets.top : insets.top + 16;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Fixed header + search controls */}
      <View style={[s.header, { paddingTop: topPad }]}>
        <Text style={[s.heading, { color: colors.foreground }]}>Lyrics Hub</Text>
        <Text style={[s.sub, { color: colors.mutedForeground }]}>Synced LRC lyrics · lrclib.net</Text>

        <View style={[s.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder="Song title or artist…"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); setResults([]); setSearched(false); }}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={search}
          disabled={!query.trim() || loading}
          style={({ pressed }) => [
            s.searchBtn,
            { backgroundColor: colors.primary, opacity: pressed || !query.trim() ? 0.6 : 1 },
          ]}
        >
          {loading
            ? <ActivityIndicator size="small" color={colors.primaryForeground} />
            : <Text style={[s.searchBtnText, { color: colors.primaryForeground }]}>Search</Text>
          }
        </Pressable>
      </View>

      {/* Results list — FlatList for reliable touch hit-testing */}
      {loading ? (
        <View style={s.centerPad}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !searched ? (
        <View style={s.centerPad}>
          <Feather name="book-open" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Search any song for synced lyrics</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={s.centerPad}>
          <Feather name="music" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No results for "{query}"</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item: track }) => (
            <Pressable
              onPress={() => selectTrack(track)}
              style={({ pressed }) => [
                s.resultRow,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={s.resultInfo}>
                <Text style={[s.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {track.trackName}
                </Text>
                <Text style={[s.resultArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {track.artistName}
                </Text>
              </View>
              <View style={s.resultRight}>
                {track.syncedLyrics && (
                  <View style={[s.lrcPill, { backgroundColor: colors.primary }]}>
                    <Text style={[s.lrcPillText, { color: colors.primaryForeground }]}>LRC</Text>
                  </View>
                )}
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    header: { paddingHorizontal: 20, paddingBottom: 8 },
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    listContent: { paddingHorizontal: 20, paddingBottom: 120 },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 16 },
    searchRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
    },
    searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
    searchBtn: {
      paddingVertical: 13, alignItems: "center", justifyContent: "center", marginBottom: 8,
    },
    searchBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    centerPad: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
    emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
    resultRow: {
      flexDirection: "row", alignItems: "center", gap: 12,
      borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14,
    },
    resultInfo: { flex: 1, gap: 4 },
    resultTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    resultArtist: { fontSize: 12, fontFamily: "Inter_400Regular" },
    resultRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    lrcPill: { paddingHorizontal: 6, paddingVertical: 2 },
    lrcPillText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 20 },
    backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
    trackTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    trackArtist: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, marginBottom: 20 },
    lrcBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3 },
    lrcBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
    metaDuration: { fontSize: 12, fontFamily: "Inter_400Regular" },
    lyricsBox: { borderWidth: 1, padding: 16, gap: 6, marginBottom: 16 },
    noLyricsBox: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
    noLyricsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
    lrcLine: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    lrcTime: { fontSize: 10, fontFamily: "Inter_500Medium", width: 38, paddingTop: 2 },
    lrcText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
    plainLine: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
    attribution: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", paddingBottom: 8 },
  });
