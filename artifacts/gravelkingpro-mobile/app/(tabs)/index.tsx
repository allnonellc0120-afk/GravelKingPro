import { useRef, useState } from "react";
import { StyleSheet, View, ActivityIndicator, Platform, Alert } from "react-native";
import { WebView as NativeWebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const WEB_APP_URL = "https://gravelkingpro.it.com";
// The installed WebView package's React 19 declaration currently resolves its
// props to `never`; runtime behavior is valid, so keep the boundary typed while
// preserving the native component.
const WebView = NativeWebView as any;

// react-native-webview has no web implementation; it renders a red "unsupported"
// message that looks like a crash. Use an iframe for Expo web preview only.
function WebViewWebFallback({ uri, style, onLoad }: { uri: string; style: any; onLoad: () => void }) {
  // @ts-ignore - iframe is valid in the web bundle only
  return <iframe src={uri} style={[style, { border: "none" }]} onLoad={onLoad} allow="microphone; camera; fullscreen" />;
}

export default function App() {
  const webViewRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const handleMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        name?: string;
        mimeType?: string;
        url?: string;
      };
      if (message.type !== "GK_DOWNLOAD" || !message.url || !message.name) return;
      const fileName = message.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const documentDirectory = FileSystem.documentDirectory;
      if (!documentDirectory) throw new Error("Device documents storage is unavailable");

      // The legacy downloader uses the OS background transfer manager, which is
      // reliable for large HTTPS WAVs on Android and iOS. Save into documents,
      // not cache, so the File URI remains valid when the system share picker
      // opens and the user chooses Downloads / Files.
      const destination = `${documentDirectory}${Date.now()}_${fileName}`;
      const response = await FileSystem.downloadAsync(message.url, destination);
      const info = await FileSystem.getInfoAsync(response.uri);
      const headerBase64 = await FileSystem.readAsStringAsync(response.uri, {
        encoding: FileSystem.EncodingType.Base64,
        position: 0,
        length: 12,
      });
      const header = globalThis.atob(headerBase64);
      // Do not offer a save sheet for an HTTP error page, partial file, or an
      // empty response. A WAV begins RIFF....WAVE and must contain audio bytes.
      const isWav = info.exists
        && (info.size ?? 0) > 44
        && header.slice(0, 4) === "RIFF"
        && header.slice(8, 12) === "WAVE";
      if (!isWav) {
        await FileSystem.deleteAsync(response.uri, { idempotent: true });
        throw new Error("Download did not produce a valid WAV");
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(response.uri, {
          mimeType: message.mimeType ?? "audio/wav",
          UTI: "com.microsoft.waveform-audio",
          dialogTitle: "Save your mastered WAV",
        });
      } else {
        Alert.alert("Master ready", "Your verified WAV is saved in the GravelKing Pro documents folder.");
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown download error";
      Alert.alert("Download failed", `The mastered WAV was not saved: ${detail}`);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
      {isWeb ? (
        <WebViewWebFallback
          uri={WEB_APP_URL}
          style={styles.webview}
          onLoad={() => setLoading(false)}
        />
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: WEB_APP_URL }}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
           onMessage={handleMessage as any}
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          scalesPageToFit={false}
          mixedContentMode="always"
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={() => true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  webview: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#09090b",
    zIndex: 10,
  },
});
