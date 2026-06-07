import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { API_BASE } from "@/lib/api";

type Beat = {
  id: number;
  title: string;
  bpm: number;
  key: string;
  genre: string;
  mood: string | null;
  tags: string | null;
  audioUrl: string;
  downloadUrl: string | null;
  isFeatured: boolean;
  downloadCount: number;
};

function BeatCard({
  beat,
  playing,
  onPlay,
}: {
  beat: Beat;
  playing: boolean;
  onPlay: (beat: Beat) => void;
}) {
  const colors = useColors();
  const s = cardStyles(colors);

  return (
    <View style={[s.card, { borderColor: beat.isFeatured ? colors.primary : colors.border }]}>
      {beat.isFeatured && (
        <View style={[s.featuredTag, { backgroundColor: colors.primary }]}>
          <Feather name="star" size={9} color={colors.primaryForeground} />
          <Text style={[s.featuredTagText, { color: colors.primaryForeground }]}>BEAT OF THE MONTH</Text>
        </View>
      )}

      <View style={s.row}>
        <Pressable
          onPress={() => { onPlay(beat); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={({ pressed }) => [
            s.playBtn,
            {
              backgroundColor: playing ? colors.primary : colors.secondary,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather name={playing ? "pause" : "play"} size={18} color={playing ? colors.primaryForeground : colors.foreground} />
        </Pressable>

        <View style={s.info}>
          <Text style={[s.title, { color: colors.foreground }]} numberOfLines={1}>{beat.title}</Text>
          <View style={s.chips}>
            {beat.bpm > 0 && <Text style={[s.chip, { color: colors.mutedForeground, borderColor: colors.border }]}>{beat.bpm} BPM</Text>}
            {beat.key ? <Text style={[s.chip, { color: colors.mutedForeground, borderColor: colors.border }]}>{beat.key}</Text> : null}
            <Text style={[s.chip, { color: colors.mutedForeground, borderColor: colors.border }]}>{beat.genre}</Text>
          </View>
        </View>

        <Text style={[s.downloads, { color: colors.mutedForeground }]}>
          {beat.downloadCount > 0 ? `${beat.downloadCount.toLocaleString()}↓` : ""}
        </Text>
      </View>

      {beat.tags && (
        <View style={s.tags}>
          {beat.tags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
            <Text key={tag} style={[s.tag, { color: colors.mutedForeground, borderColor: colors.border }]}>#{tag}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function BeatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [beats, setBeats] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const loadBeats = useCallback(async (refresh = false) => {
    if (!API_BASE) { setLoading(false); setError("API not configured"); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/beats`);
      const d = await r.json();
      if (d.success) setBeats(d.beats);
      else setError(d.error ?? "Failed to load beats");
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadBeats(); }, [loadBeats]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const handlePlay = useCallback(async (beat: Beat) => {
    if (playingId === beat.id) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setPlayingId(null);
      return;
    }
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    if (!beat.audioUrl) return;
    const url = beat.audioUrl.startsWith("http") ? beat.audioUrl : `${API_BASE}${beat.audioUrl}`;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayingId(beat.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          soundRef.current = null;
        }
      });
    } catch {
      setPlayingId(null);
    }
  }, [playingId]);

  const s = styles(colors);

  const featured = beats.find(b => b.isFeatured);
  const library = beats.filter(b => !b.isFeatured);

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading beats…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
        <Feather name="alert-circle" size={32} color={colors.destructive} />
        <Text style={[s.errorText, { color: colors.foreground }]}>Couldn't load beats</Text>
        <Text style={[s.errorSub, { color: colors.mutedForeground }]}>{error}</Text>
        <Pressable onPress={() => loadBeats()} style={[s.retryBtn, { borderColor: colors.border }]}>
          <Text style={[s.retryText, { color: colors.foreground }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        s.list,
        { paddingTop: isWeb ? 67 + insets.top : insets.top + 16 },
      ]}
      data={library}
      keyExtractor={b => String(b.id)}
      scrollEnabled={!!beats.length}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadBeats(true)}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <>
          <Text style={[s.heading, { color: colors.foreground }]}>Beats</Text>
          <Text style={[s.sub, { color: colors.mutedForeground }]}>by Kevin Morris · GravelKing Productions</Text>

          {featured && (
            <>
              <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>BEAT OF THE MONTH</Text>
              <BeatCard beat={featured} playing={playingId === featured.id} onPlay={handlePlay} />
            </>
          )}

          {library.length > 0 && (
            <Text style={[s.sectionLabel, { color: colors.mutedForeground, marginTop: 24 }]}>SAMPLE LIBRARY</Text>
          )}
        </>
      }
      ListEmptyComponent={
        <View style={s.emptyState}>
          <Feather name="music" size={32} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No beats in the library yet</Text>
        </View>
      }
      renderItem={({ item }) => (
        <BeatCard beat={item} playing={playingId === item.id} onPlay={handlePlay} />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    />
  );
}

const cardStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    card: { borderWidth: 1, padding: 14, gap: 10 },
    featuredTag: {
      flexDirection: "row", alignItems: "center", gap: 4,
      alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3,
    },
    featuredTagText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    playBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    info: { flex: 1, gap: 5 },
    title: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    chips: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
    chip: { fontSize: 10, fontFamily: "Inter_400Regular", borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
    downloads: { fontSize: 10, fontFamily: "Inter_400Regular" },
    tags: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
    tag: { fontSize: 9, fontFamily: "Inter_400Regular", borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  });

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    list: { paddingHorizontal: 20, paddingBottom: 120 },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 24 },
    sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 10 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
    errorText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
    errorSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
    retryBtn: { borderWidth: 1, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
    retryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    emptyState: { alignItems: "center", gap: 10, paddingTop: 40 },
    emptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  });
