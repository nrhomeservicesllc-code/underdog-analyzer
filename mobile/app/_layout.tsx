import { Tabs } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { StyleSheet, View } from "react-native"

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#09090b" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: "#09090b" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
          tabBarStyle: { backgroundColor: "#09090b", borderTopColor: "#27272a" },
          tabBarActiveTintColor: "#10b981",
          tabBarInactiveTintColor: "#71717a",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Underdog.",
            tabBarLabel: "Picks",
            tabBarIcon: ({ color, size }) => (
              <View style={[styles.dot, { backgroundColor: color }]} />
            ),
          }}
        />
        <Tabs.Screen
          name="tracker"
          options={{
            title: "My Picks",
            tabBarLabel: "My Picks",
            tabBarIcon: ({ color, size }) => (
              <View style={[styles.square, { borderColor: color }]} />
            ),
          }}
        />
      </Tabs>
    </>
  )
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  square: { width: 8, height: 8, borderRadius: 2, borderWidth: 2 },
})
