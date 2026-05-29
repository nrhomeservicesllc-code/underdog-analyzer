import { useCallback, useEffect, useState } from "react"
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import type { TrackedBet } from "@/types/betting"
import { calcRecord, loadBets, removeBet, settleBet } from "@/lib/tracker"

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function pnlForBet(b: TrackedBet) {
  const dec = b.odds > 0 ? b.odds / 100 + 1 : 100 / Math.abs(b.odds) + 1
  return b.status === "WON" ? (dec - 1) * 100 : -100
}

export default function TrackerScreen() {
  const [bets, setBets] = useState<TrackedBet[]>([])

  const reload = useCallback(async () => {
    setBets(await loadBets())
  }, [])

  useEffect(() => { reload() }, [reload])

  const pending = bets.filter((b) => b.status === "PENDING")
  const settled = bets.filter((b) => b.status !== "PENDING")
  const rec = calcRecord(bets)

  async function settle(id: string, status: "WON" | "LOST") {
    await settleBet(id, status)
    await reload()
  }

  async function remove(id: string) {
    await removeBet(id)
    await reload()
  }

  if (bets.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>No picks tracked yet</Text>
        <Text style={styles.emptyBody}>Expand any pick on the Picks tab and tap "Track This Pick" to start recording your bets.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Record summary */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          {rec.wins > 0 && (
            <View style={styles.winBadge}><Text style={styles.winText}>{rec.wins}W</Text></View>
          )}
          {rec.losses > 0 && (
            <View style={styles.lossBadge}><Text style={styles.lossText}>{rec.losses}L</Text></View>
          )}
          {rec.pending > 0 && (
            <View style={styles.pendingBadge}><Text style={styles.pendingText}>{rec.pending} pending</Text></View>
          )}
        </View>
        {(rec.wins > 0 || rec.losses > 0) && (
          <Text style={[styles.pnl, { color: rec.pnl >= 0 ? "#10b981" : "#f87171" }]}>
            {rec.pnl >= 0 ? "+" : ""}${rec.pnl.toFixed(0)} P&L <Text style={styles.pnlSub}>(@ $100/bet)</Text>
          </Text>
        )}
      </View>

      {/* ROI stats strip */}
      {(rec.wins > 0 || rec.losses > 0) && (() => {
        const totalSettled = rec.wins + rec.losses
        const winRate = totalSettled > 0 ? (rec.wins / totalSettled) * 100 : 0
        const roi = totalSettled > 0 ? (rec.pnl / (totalSettled * 100)) * 100 : 0
        return (
          <View style={styles.roiStrip}>
            {[
              { label: "Win Rate", value: `${winRate.toFixed(0)}%`, positive: winRate >= 50 },
              { label: "Total P&L", value: `${rec.pnl >= 0 ? "+" : ""}$${rec.pnl.toFixed(0)}`, positive: rec.pnl >= 0 },
              { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`, positive: roi >= 0 },
              { label: "Settled", value: `${totalSettled}`, neutral: true },
            ].map((s, i) => (
              <View key={s.label} style={[styles.roiCard, i > 0 && styles.roiCardBorder]}>
                <Text style={[styles.roiVal, s.neutral ? styles.white : s.positive ? styles.green : styles.red]}>{s.value}</Text>
                <Text style={styles.roiLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )
      })()}

      <FlatList
        data={[...pending, ...settled]}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: b }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.sport}>{b.sportTitle}</Text>
              {b.status === "PENDING" ? (
                <View style={styles.pendingChip}><Text style={styles.pendingChipText}>PENDING</Text></View>
              ) : (
                <View style={[styles.settledChip, b.status === "WON" ? styles.wonChip : styles.lostChip]}>
                  <Text style={[styles.settledText, { color: b.status === "WON" ? "#10b981" : "#f87171" }]}>
                    {b.status}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.team}>{b.underdogTeam}</Text>
            <Text style={styles.odds}>{fmt(b.odds)} <Text style={styles.book}>@ {b.bookmaker}</Text></Text>
            <Text style={styles.matchup}>{b.homeTeam} vs {b.awayTeam}</Text>
            <Text style={styles.date}>Tracked {fmtDate(b.trackedAt)}</Text>

            {b.status === "PENDING" ? (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.wonBtn} onPress={() => settle(b.id, "WON")}>
                  <Text style={styles.wonBtnText}>Won ✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.lostBtn} onPress={() => settle(b.id, "LOST")}>
                  <Text style={styles.lostBtnText}>Lost ✗</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeBtn} onPress={() => remove(b.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.actions}>
                <Text style={[styles.pnlLine, { color: pnlForBet(b) >= 0 ? "#10b981" : "#f87171" }]}>
                  {pnlForBet(b) >= 0 ? "+" : ""}${pnlForBet(b).toFixed(0)} on $100
                </Text>
                <TouchableOpacity style={styles.removeBtn} onPress={() => remove(b.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const C = { bg: "#09090b", card: "#18181b", border: "#27272a", text: "#fff", sub: "#71717a", green: "#10b981", red: "#f87171" }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: C.text },
  emptyBody: { fontSize: 14, color: C.sub, textAlign: "center", lineHeight: 20 },
  summary: { padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, gap: 6 },
  summaryRow: { flexDirection: "row", gap: 8 },
  winBadge: { backgroundColor: "rgba(16,185,129,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  winText: { color: C.green, fontWeight: "700", fontSize: 13 },
  lossBadge: { backgroundColor: "rgba(239,68,68,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  lossText: { color: C.red, fontWeight: "700", fontSize: 13 },
  pendingBadge: { backgroundColor: "#27272a", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pendingText: { color: C.sub, fontWeight: "600", fontSize: 13 },
  pnl: { fontSize: 20, fontWeight: "800" },
  pnlSub: { fontSize: 13, fontWeight: "400", color: C.sub },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  sport: { fontSize: 11, color: C.sub, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  pendingChip: { backgroundColor: "rgba(245,158,11,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pendingChipText: { color: "#f59e0b", fontSize: 11, fontWeight: "700" },
  settledChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  wonChip: { backgroundColor: "rgba(16,185,129,0.15)" },
  lostChip: { backgroundColor: "rgba(239,68,68,0.15)" },
  settledText: { fontSize: 11, fontWeight: "700" },
  team: { fontSize: 17, fontWeight: "800", color: C.text },
  odds: { fontSize: 22, fontWeight: "900", color: C.green },
  book: { fontSize: 13, color: C.sub, fontWeight: "400" },
  matchup: { fontSize: 13, color: C.sub },
  date: { fontSize: 11, color: "#52525b", marginTop: 2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" },
  wonBtn: { backgroundColor: "#065f46", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, flex: 1 },
  wonBtnText: { color: C.green, fontWeight: "700", textAlign: "center" },
  lostBtn: { backgroundColor: "#450a0a", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, flex: 1 },
  lostBtnText: { color: C.red, fontWeight: "700", textAlign: "center" },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  removeText: { color: "#52525b", fontSize: 13 },
  pnlLine: { fontSize: 16, fontWeight: "700", flex: 1 },
  roiStrip: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, backgroundColor: "#0a0a0c" },
  roiCard: { flex: 1, alignItems: "center", paddingVertical: 12 },
  roiCardBorder: { borderLeftWidth: 1, borderLeftColor: C.border },
  roiVal: { fontSize: 18, fontWeight: "900" },
  roiLabel: { fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
})
