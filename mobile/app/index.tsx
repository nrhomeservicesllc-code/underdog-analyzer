import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import type { AnalysisResponse, BetAnalysis, TrackedBet } from "@/types/betting"
import { fetchOdds } from "@/lib/api"
import { isTracked, loadBets, trackBet, untrackBet } from "@/lib/tracker"
import { UnderdogCard } from "@/components/UnderdogCard"

type Filter = "LIVE" | "ALL" | "STRONG BUY" | "BUY" | "WATCH"
const FILTERS: Filter[] = ["LIVE", "ALL", "STRONG BUY", "BUY", "WATCH"]

function filterList(list: BetAnalysis[], f: Filter) {
  if (f === "LIVE") return list.filter((a) => a.isLive)
  if (f === "ALL") return list
  return list.filter((a) => a.recommendation === f)
}

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

export default function HomeScreen() {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("LIVE")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [trackedBets, setTrackedBets] = useState<TrackedBet[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reloadBets = useCallback(async () => {
    setTrackedBets(await loadBets())
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const json = await fetchOdds()
      setData(json)
      await reloadBets()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [reloadBets])

  useEffect(() => {
    load()
  }, [load])

  // Faster refresh when live games active
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const ms = (data?.marketStats.liveCount ?? 0) > 0 ? 30_000 : 90_000
    intervalRef.current = setInterval(() => load(true), ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load, data?.marketStats.liveCount])

  async function handleTrack(analysis: BetAnalysis) {
    if (isTracked(analysis.eventId, trackedBets)) {
      await untrackBet(analysis.eventId)
    } else {
      await trackBet(analysis)
    }
    await reloadBets()
  }

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Scanning live markets…</Text>
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  if (!data) return null

  const top = data.topUnderdog
  const visible = filterList(data.allAnalyses, filter)

  const counts: Record<Filter, number> = {
    LIVE: data.allAnalyses.filter((a) => a.isLive).length,
    ALL: data.allAnalyses.length,
    "STRONG BUY": data.allAnalyses.filter((a) => a.recommendation === "STRONG BUY").length,
    BUY: data.allAnalyses.filter((a) => a.recommendation === "BUY").length,
    WATCH: data.allAnalyses.filter((a) => a.recommendation === "WATCH").length,
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Stat row */}
      <View style={styles.statRow}>
        {[
          { label: "Live", val: data.liveGameCount, accent: "#f87171" },
          { label: "+EV Bets", val: data.marketStats.positiveEvCount, accent: "#10b981" },
          { label: "Strong Buy", val: data.marketStats.strongBuyCount, accent: "#fff" },
          { label: "Sports", val: data.sportsAnalyzed.length, accent: "#fff" },
        ].map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={[styles.statVal, { color: s.accent }]}>{s.val}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Top pick hero */}
      {top && (
        <View style={[styles.hero, top.isLive ? styles.heroLive : styles.heroNormal]}>
          <Text style={[styles.heroLabel, { color: top.isLive ? "#f87171" : "#10b981" }]}>
            {top.isLive ? "⬤  Top Live Pick" : "Top Underdog Pick"}
          </Text>
          <Text style={styles.heroTeam}>{top.underdogTeam.team}</Text>
          <Text style={styles.heroMatchup}>{top.homeTeam} vs {top.awayTeam}</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Best Odds</Text>
              <Text style={styles.heroOdds}>{fmt(top.underdogTeam.bestAmericanOdds)}</Text>
              <Text style={styles.heroBook}>@ {top.underdogTeam.bestBookmaker}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>EV</Text>
              <Text style={[styles.heroEv, { color: top.expectedValuePct > 0 ? "#10b981" : "#f87171" }]}>
                {top.expectedValuePct > 0 ? "+" : ""}{top.expectedValuePct.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>$100 wins</Text>
              <Text style={styles.heroPayout}>${((top.underdogTeam.bestDecimalOdds - 1) * 100).toFixed(0)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterChip,
              filter === f && (
                f === "LIVE" ? styles.chipLive :
                f === "STRONG BUY" ? styles.chipStrongBuy :
                f === "BUY" ? styles.chipBuy :
                f === "WATCH" ? styles.chipWatch :
                styles.chipAll
              ),
            ]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f}{counts[f] > 0 ? ` (${counts[f]})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Cards list */}
      <FlatList
        data={visible}
        keyExtractor={(a) => a.eventId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor="#10b981" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {filter === "LIVE" ? "No live games right now — check back soon." : "No picks match this filter."}
            </Text>
            {filter === "LIVE" && (
              <TouchableOpacity onPress={() => setFilter("ALL")}>
                <Text style={styles.emptyLink}>Show all upcoming games</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <UnderdogCard
            analysis={item}
            rank={index + 1}
            expanded={expanded === item.eventId}
            tracked={isTracked(item.eventId, trackedBets)}
            onToggle={() => setExpanded((p) => (p === item.eventId ? null : item.eventId))}
            onTrack={() => handleTrack(item)}
          />
        )}
      />
    </SafeAreaView>
  )
}

const C = { bg: "#09090b", card: "#18181b", border: "#27272a", text: "#fff", sub: "#71717a", green: "#10b981", red: "#f87171" }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: C.sub, fontSize: 14 },
  errorText: { color: C.red, fontSize: 14, textAlign: "center", paddingHorizontal: 24 },
  retryBtn: { backgroundColor: C.green, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: C.text, fontWeight: "600" },
  statRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: C.border },
  statVal: { fontSize: 22, fontWeight: "800", color: C.text },
  statLabel: { fontSize: 10, color: C.sub, marginTop: 2 },
  hero: { margin: 16, borderRadius: 16, padding: 16, borderWidth: 1 },
  heroLive: { backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" },
  heroNormal: { backgroundColor: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.3)" },
  heroLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  heroTeam: { fontSize: 22, fontWeight: "900", color: C.text },
  heroMatchup: { fontSize: 13, color: C.sub, marginTop: 2 },
  heroStats: { flexDirection: "row", marginTop: 12, gap: 20 },
  heroStat: {},
  heroStatLabel: { fontSize: 11, color: C.sub, marginBottom: 2 },
  heroOdds: { fontSize: 28, fontWeight: "900", color: C.green },
  heroBook: { fontSize: 11, color: C.sub },
  heroEv: { fontSize: 22, fontWeight: "700" },
  heroPayout: { fontSize: 22, fontWeight: "700", color: C.text },
  filterScroll: { flexGrow: 0 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  filterText: { fontSize: 12, fontWeight: "600", color: C.sub },
  filterTextActive: { color: C.text },
  chipLive: { backgroundColor: "#7f1d1d", borderColor: "#ef4444" },
  chipStrongBuy: { backgroundColor: "#064e3b", borderColor: C.green },
  chipBuy: { backgroundColor: "#1e3a5f", borderColor: "#3b82f6" },
  chipWatch: { backgroundColor: "#451a03", borderColor: "#f59e0b" },
  chipAll: { backgroundColor: "#fff", borderColor: "#fff" },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  empty: { paddingVertical: 48, alignItems: "center", gap: 10 },
  emptyText: { color: C.sub, fontSize: 14, textAlign: "center" },
  emptyLink: { color: C.green, fontSize: 13, textDecorationLine: "underline" },
})
