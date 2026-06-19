import { Audio, type AVPlaybackStatus } from "expo-av";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";

const isWeb = Platform.OS === "web";

export type AudioPlayer = { stop: () => void };

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "audio.wav";
}

/**
 * Turn raw audio bytes into a URI that can be played back and shared on the
 * current platform. On web this is an object URL; on native the bytes are
 * written to a cache file and a `file://` URI is returned (object URLs cannot
 * be opened by the OS share sheet or the native audio player).
 */
export async function bytesToPlayableUri(
  bytes: Uint8Array,
  filename: string,
  mimeType = "audio/wav",
): Promise<string> {
  if (isWeb) {
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
  }
  const file = new File(Paths.cache, `${Date.now()}-${sanitize(filename)}`);
  try {
    if (file.exists) file.delete();
  } catch {
    /* ignore — fresh write below */
  }
  file.create();
  file.write(bytes);
  return file.uri;
}

/**
 * Play an audio URI. Returns a handle whose `stop()` halts and releases
 * playback. Uses the DOM Audio element on web and expo-av on native.
 */
export async function playUri(
  uri: string,
  onEnded: () => void,
): Promise<AudioPlayer> {
  if (isWeb) {
    const audio = new window.Audio(uri);
    void audio.play().catch(() => {});
    audio.onended = () => onEnded();
    return {
      stop: () => {
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
      },
    };
  }

  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
  sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      onEnded();
      sound.unloadAsync().catch(() => {});
    }
  });
  return {
    stop: () => {
      sound.stopAsync().catch(() => {});
      sound.unloadAsync().catch(() => {});
    },
  };
}

/**
 * Save/share an already-materialized audio URI. On web this opens the file
 * (browser download); on native it presents the OS share sheet so the user can
 * save to Files or send it elsewhere.
 */
export async function downloadOrShare(
  uri: string,
  mimeType = "audio/wav",
): Promise<void> {
  if (isWeb) {
    Linking.openURL(uri).catch(() => {});
    return;
  }
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType, UTI: "public.audio" });
      return;
    }
  } catch {
    /* fall back to Linking below */
  }
  Linking.openURL(uri).catch(() => {});
}
