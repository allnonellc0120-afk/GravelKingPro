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
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

  const lrcLines = selected?.syncedLyrics ? parseLrc(selected.syncedLyrics) : [];
  const plainLines = selected?.plainLyrics?.split("\n") ?? [];

  if (selected) {
    return (
      <ScrollView
        style={[{ backgroundColor: colors.background }]}
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
                <Text key={i} style={[s.plainLine, { color: l ? colors.foreground : "transparent" }]}>
                  {l || " "}
                </Text>
              ))
          }
        </View>

        <Text style={[s.attribution, { color: colors.mutedForeground }]}>
          Lyrics via lrclib.net · GravelKing Protocol
        </Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        s.content,
        { paddingTop: isWeb ? 67 + insets.top : insets.top + 16 },
      ]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      <Text style={[s.heading, { color: colors.foreground }]}>Lyrics Hub</Text>
      <Text style={[s.sub, { color: colors.mutedForeground }]}>Synced LRC lyrics · lrclib.net</Text>

      {/* Search bar */}
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

      {/* Results */}
      {loading && (
        <View style={s.centerPad}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {!loading && searched && results.length === 0 && (
        <View style={s.centerPad}>
          <Feather name="music" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No results for "{query}"</Text>
        </View>
      )}

      {!loading && !searched && (
        <View style={s.centerPad}>
          <Feather name="book-open" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Search any song for synced lyrics</Text>
        </View>
      )}

      {results.map((track) => (
        <Pressable
          key={track.id}
          onPress={() => { setSelected(track); Haptics.selectionAsync(); }}
          style={({ pressed }) => [
            s.resultRow,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <View style={s.resultInfo}>
            <Text style={[s.resultTitle, { color: colors.foreground }]} numberOfLines={1}>{track.trackName}</Text>
            <Text style={[s.resultArtist, { color: colors.mutedForeground }]} numberOfLines={1}>{track.artistName}</Text>
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
      ))}
    </KeyboardAwareScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 20 },
    searchRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
    },
    searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
    searchBtn: {
      paddingVertical: 13, alignItems: "center", justifyContent: "center", marginBottom: 24,
    },
    searchBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    centerPad: { alignItems: "center", gap: 10, paddingTop: 32 },
    emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
    resultRow: {
      flexDirection: "row", alignItems: "center", gap: 12,
      borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    },
    resultInfo: { flex: 1, gap: 3 },
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
    lrcLine: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    lrcTime: { fontSize: 10, fontFamily: "Inter_500Medium", width: 38, paddingTop: 2 },
    lrcText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
    plainLine: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
    attribution: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", paddingBottom: 8 },
  });
