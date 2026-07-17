import { Tabs } from "expo-router";
import { Globe, Music2, Mic2, BookOpen } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#09090b",
          borderTopColor: "#27272a",
        },
        tabBarActiveTintColor: "#f59e0b",
        tabBarInactiveTintColor: "#71717a",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "App",
          tabBarIcon: ({ color, size }) => <Globe color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bpm"
        options={{
          title: "BPM",
          tabBarIcon: ({ color, size }) => <Music2 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tuner"
        options={{
          title: "Keys",
          tabBarIcon: ({ color, size }) => <Mic2 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="lyrics"
        options={{
          title: "Lyrics",
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
