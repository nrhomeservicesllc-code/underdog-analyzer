import { useState } from "react"
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import type { BetAnalysis } from "@/types/betting"

const REC_COLOR = {
  "STRONG BUY": "#10b981",
  BUY: "#3b82f6",
  WATCH: "#f59e0b",
  AVOID: "#52525b",
}

function fmt(n: number) { return n > 0 ? `+${n}` : `${n}` }

function gameTime(iso: string, live: boolean) {
  if (live) return null
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function UnderdogCard({
  analysis,
  rank,
  expanded,
  tracked,
  onToggle,
  onTrack,
}: {
  analysis: BetAnalysis
  rank: number
  expanded: boolean
  tracked: boolean
  onToggle: () => void
  onTrack: () => void
}) {
  const ud = analysis.underdogTeam
  const fav = analysis.favoriteTeam
  const recColor = REC_COLOR[analysis.recommendation]
  const time = gameTime(analysis.commenceTime, analysis.isLive)

  return (
    <View style={[styles.card, tracked && styles.cardTracked]}>
      <View style={[styles.bar, { backgroundColor: recColor }]} />

      <TouchableOpacity style={styles.header} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.rank}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Text style={styles.sport}>{analysis.sportTitle}</Text>
            {analysis.isLive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : (
              <Text style={styles.time}>{time}</Text>
            )}
            {tracked && <Text style={styles.tracking}>Tracking</Text>}
          </View>

          <Text style={styles.matchup}>{analysis.homeTeam} vs {analysis.awayTeam}</Text>

          <View style={styles.statsRow}>
            <Text style={styles.udLabel}>
              <Text style={styles.udName}>{ud.team} </Text>
              <Text style={[styles.udOdds, { color: analysis.expectedValuePct > 0 ? "#10b981" : "#a1a1aa" }]}>
                {fmt(ud.bestAmericanOdds)}
              </Text>
            </Text>
            <View style={styles.chips}>
              <View style={[styles.chip, { backgroundColor: analysis.expectedValuePct > 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" }]}>
                <Text style={[styles.chipText, { color: analysis.expectedValuePct > 0 ? "#10b981" : "#f87171" }]}>
                  EV {analysis.expectedValuePct > 0 ? "+" : ""}{analysis.expectedValuePct.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.recBadge, { backgroundColor: recColor + "30", borderColor: recColor + "60" }]}>
          <Text style={[styles.recText, { color: recColor }]}>{analysis.recommendation.replace(" ", "\n")}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.detail}>
          {/* Payout stats */}
          <View style={styles.payoutRow}>
            {[
              { label: "Win prob", val: `${(analysis.consensusProbability * 100).toFixed(1)}%` },
              { label: "$100 returns", val: `$${(ud.bestDecimalOdds * 100).toFixed(0)}` },
              { label: "Exp. value", val: `${analysis.expectedValue >= 0 ? "+" : ""}$${(analysis.expectedValue * 100).toFixed(2)}`, green: analysis.expectedValue > 0 },
            ].map((s) => (
              <View key={s.label} style={styles.payoutCard}>
                <Text style={styles.payoutLabel}>{s.label}</Text>
                <Text style={[styles.payoutVal, s.green ? styles.green : s.green === false ? styles.red : styles.white]}>{s.val}</Text>
              </View>
            ))}
          </View>

          {/* Book odds */}
          <View style={styles.oddsSection}>
            <Text style={styles.oddsSectionTitle}>Underdog odds — {ud.team}</Text>
            {ud.allOdds.map((o) => (
              <View key={o.bookmaker} style={styles.oddsRow}>
                <Text style={styles.bookName}>{o.bookmaker}</Text>
                <Text style={[styles.bookOdds, o.decimal === ud.bestDecimalOdds && styles.bestOdds]}>{fmt(o.american)}</Text>
              </View>
            ))}
          </View>

          {/* Notes */}
          {analysis.analysisNotes.length > 0 && (
            <View style={styles.notes}>
              {analysis.analysisNotes.map((n, i) => (
                <Text key={i} style={styles.note}>▸ {n}</Text>
              ))}
            </View>
          )}

          {/* Track button */}
          <TouchableOpacity
            style={[styles.trackBtn, tracked && styles.trackBtnActive]}
            onPress={onTrack}
          >
            <Text style={[styles.trackBtnText, tracked && styles.trackBtnTextActive]}>
              {tracked ? "Remove from My Picks" : "Track This Pick"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const C = { bg: "#09090b", card: "#18181b", border: "#27272a", text: "#fff", sub: "#71717a" }

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.border },
  cardTracked: { borderColor: "#d97706" },
  bar: { height: 3, width: "100%" },
  header: { padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#27272a", alignItems: "center", justifyContent: "center" },
  rankText: { color: C.sub, fontSize: 11, fontWeight: "700" },
  body: { flex: 1, gap: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  sport: { fontSize: 10, color: C.sub, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#f87171" },
  liveText: { color: "#f87171", fontSize: 10, fontWeight: "800" },
  time: { color: "#52525b", fontSize: 10 },
  tracking: { color: "#f59e0b", fontSize: 10, fontWeight: "700", backgroundColor: "rgba(245,158,11,0.1)", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  matchup: { fontSize: 13, color: C.sub },
  statsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 2 },
  udLabel: { fontSize: 15 },
  udName: { color: C.text, fontWeight: "700" },
  udOdds: { fontWeight: "900", fontSize: 18 },
  chips: { flexDirection: "row", gap: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  chipText: { fontSize: 11, fontWeight: "700" },
  recBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", minWidth: 68 },
  recText: { fontSize: 10, fontWeight: "800", textAlign: "center" },
  detail: { borderTopWidth: 1, borderTopColor: C.border, padding: 14, gap: 14 },
  payoutRow: { flexDirection: "row", gap: 8 },
  payoutCard: { flex: 1, backgroundColor: "#27272a", borderRadius: 12, padding: 10, alignItems: "center" },
  payoutLabel: { fontSize: 10, color: C.sub, marginBottom: 4, textAlign: "center" },
  payoutVal: { fontSize: 16, fontWeight: "800" },
  green: { color: "#10b981" },
  red: { color: "#f87171" },
  white: { color: C.text },
  oddsSection: { gap: 6 },
  oddsSectionTitle: { fontSize: 11, color: C.sub, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  oddsRow: { flexDirection: "row", justifyContent: "space-between" },
  bookName: { color: C.sub, fontSize: 13 },
  bookOdds: { color: C.text, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  bestOdds: { color: "#10b981", fontWeight: "800" },
  notes: { gap: 6 },
  note: { color: C.sub, fontSize: 13, lineHeight: 18 },
  trackBtn: { backgroundColor: "#10b981", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  trackBtnActive: { backgroundColor: "rgba(245,158,11,0.15)", borderWidth: 1, borderColor: "#d97706" },
  trackBtnText: { color: C.text, fontWeight: "700", fontSize: 15 },
  trackBtnTextActive: { color: "#f59e0b" },
})
