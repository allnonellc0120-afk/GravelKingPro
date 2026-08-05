import { useRef, useState } from "react";
import { StyleSheet, View, ActivityIndicator, Platform, Alert } from "react-native";
import { WebView as NativeWebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
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
      const destination = new File(Paths.cache, fileName);
      const downloaded = await File.downloadFileAsync(message.url, destination, {
        idempotent: true,
      });
      // Do not offer a save sheet for an HTTP error page, partial file, or an
      // empty response. A WAV begins RIFF....WAVE and must contain audio bytes.
      const header = (await downloaded.bytes()).slice(0, 12);
      const isWav = downloaded.size > 44
        && String.fromCharCode(...header.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...header.slice(8, 12)) === "WAVE";
      if (!isWav) {
        downloaded.delete();
        throw new Error("Downloaded file was not a valid WAV");
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: message.mimeType ?? "audio/wav",
          UTI: "com.microsoft.waveform-audio",
          dialogTitle: "Save your mastered WAV",
        });
      } else {
        Alert.alert("Master downloaded", "Open the Files app to save or move your mastered WAV.");
      }
    } catch {
      Alert.alert("Download failed", "The mastered WAV could not be saved. Please try again.");
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
