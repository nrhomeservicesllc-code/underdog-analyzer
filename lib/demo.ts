import type { OddsApiEvent } from "@/types/betting"

export function demoEvents(): OddsApiEvent[] {
  const now = new Date()
  const live = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  const soon = (m: number) => new Date(now.getTime() + m * 60_000).toISOString()

  return [
    // ── LIVE: Tennis ─────────────────────────────────────────────────────────
    {
      id: "d-tennis-1",
      sport_key: "tennis_atp_french_open",
      sport_title: "ATP French Open",
      commence_time: live(65),
      home_team: "Jannik Sinner",
      away_team: "Alejandro Davidovich Fokina",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Jannik Sinner", price: -320 }, { name: "Alejandro Davidovich Fokina", price: 260 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Jannik Sinner", price: -310 }, { name: "Alejandro Davidovich Fokina", price: 272 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Jannik Sinner", price: -300 }, { name: "Alejandro Davidovich Fokina", price: 255 }] }] },
        { key: "bet365",     title: "Bet365",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Jannik Sinner", price: -295 }, { name: "Alejandro Davidovich Fokina", price: 280 }] }] },
      ],
    },
    {
      id: "d-tennis-2",
      sport_key: "tennis_wta_french_open",
      sport_title: "WTA French Open",
      commence_time: live(45),
      home_team: "Iga Swiatek",
      away_team: "Mirra Andreeva",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Iga Swiatek", price: -450 }, { name: "Mirra Andreeva", price: 360 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Iga Swiatek", price: -430 }, { name: "Mirra Andreeva", price: 375 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Iga Swiatek", price: -420 }, { name: "Mirra Andreeva", price: 350 }] }] },
        { key: "caesars",    title: "Caesars",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Iga Swiatek", price: -440 }, { name: "Mirra Andreeva", price: 368 }] }] },
      ],
    },
    // ── LIVE: NBA ─────────────────────────────────────────────────────────────
    {
      id: "d-nba-1",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: live(42),
      home_team: "Oklahoma City Thunder",
      away_team: "Los Angeles Lakers",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -165 }, { name: "Los Angeles Lakers", price: 142 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -170 }, { name: "Los Angeles Lakers", price: 148 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -155 }, { name: "Los Angeles Lakers", price: 138 }] }] },
        { key: "caesars",    title: "Caesars",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -162 }, { name: "Los Angeles Lakers", price: 145 }] }] },
        { key: "pointsbet",  title: "PointsBet",  last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -158 }, { name: "Los Angeles Lakers", price: 150 }] }] },
      ],
    },
    // ── LIVE: MLB ─────────────────────────────────────────────────────────────
    {
      id: "d-mlb-1",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: live(95),
      home_team: "Kansas City Royals",
      away_team: "New York Yankees",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 215 }, { name: "New York Yankees", price: -255 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 225 }, { name: "New York Yankees", price: -265 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 208 }, { name: "New York Yankees", price: -248 }] }] },
        { key: "caesars",    title: "Caesars",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 220 }, { name: "New York Yankees", price: -260 }] }] },
      ],
    },
    // ── LIVE: Soccer ──────────────────────────────────────────────────────────
    {
      id: "d-epl-1",
      sport_key: "soccer_epl",
      sport_title: "EPL",
      commence_time: live(58),
      home_team: "Wolverhampton Wanderers",
      away_team: "Arsenal",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Wolverhampton Wanderers", price: 480 }, { name: "Arsenal", price: -165 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Wolverhampton Wanderers", price: 465 }, { name: "Arsenal", price: -155 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Wolverhampton Wanderers", price: 500 }, { name: "Arsenal", price: -172 }] }] },
        { key: "bet365",     title: "Bet365",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Wolverhampton Wanderers", price: 490 }, { name: "Arsenal", price: -168 }] }] },
      ],
    },
    {
      id: "d-laliga-1",
      sport_key: "soccer_spain_la_liga",
      sport_title: "La Liga",
      commence_time: live(35),
      home_team: "Getafe CF",
      away_team: "Real Madrid",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Getafe CF", price: 620 }, { name: "Real Madrid", price: -290 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Getafe CF", price: 600 }, { name: "Real Madrid", price: -275 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Getafe CF", price: 640 }, { name: "Real Madrid", price: -310 }] }] },
        { key: "bet365",     title: "Bet365",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Getafe CF", price: 610 }, { name: "Real Madrid", price: -298 }] }] },
      ],
    },
    // ── LIVE: MMA ─────────────────────────────────────────────────────────────
    {
      id: "d-mma-1",
      sport_key: "mma_mixed_martial_arts",
      sport_title: "MMA",
      commence_time: live(22),
      home_team: "Dustin Poirier",
      away_team: "Islam Makhachev",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Dustin Poirier", price: 340 }, { name: "Islam Makhachev", price: -425 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Dustin Poirier", price: 325 }, { name: "Islam Makhachev", price: -410 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Dustin Poirier", price: 355 }, { name: "Islam Makhachev", price: -440 }] }] },
        { key: "caesars",    title: "Caesars",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Dustin Poirier", price: 335 }, { name: "Islam Makhachev", price: -420 }] }] },
      ],
    },
    // ── LIVE: Cricket ─────────────────────────────────────────────────────────
    {
      id: "d-cricket-1",
      sport_key: "cricket_t20",
      sport_title: "T20 Cricket",
      commence_time: live(115),
      home_team: "India",
      away_team: "Australia",
      bookmakers: [
        { key: "bet365",     title: "Bet365",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "India", price: -180 }, { name: "Australia", price: 155 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "India", price: -175 }, { name: "Australia", price: 150 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "India", price: -185 }, { name: "Australia", price: 160 }] }] },
      ],
    },
    // ── Upcoming ──────────────────────────────────────────────────────────────
    {
      id: "d-mlb-2",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: soon(35),
      home_team: "Pittsburgh Pirates",
      away_team: "Los Angeles Dodgers",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Pittsburgh Pirates", price: 310 }, { name: "Los Angeles Dodgers", price: -385 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Pittsburgh Pirates", price: 298 }, { name: "Los Angeles Dodgers", price: -372 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Pittsburgh Pirates", price: 325 }, { name: "Los Angeles Dodgers", price: -400 }] }] },
        { key: "caesars",    title: "Caesars",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Pittsburgh Pirates", price: 305 }, { name: "Los Angeles Dodgers", price: -380 }] }] },
      ],
    },
    {
      id: "d-nhl-1",
      sport_key: "icehockey_nhl",
      sport_title: "NHL",
      commence_time: soon(25),
      home_team: "Colorado Avalanche",
      away_team: "Florida Panthers",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 115 }, { name: "Florida Panthers", price: -138 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 112 }, { name: "Florida Panthers", price: -135 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 120 }, { name: "Florida Panthers", price: -142 }] }] },
      ],
    },
    {
      id: "d-tennis-3",
      sport_key: "tennis_atp_french_open",
      sport_title: "ATP French Open",
      commence_time: soon(50),
      home_team: "Carlos Alcaraz",
      away_team: "Tommy Paul",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Carlos Alcaraz", price: -280 }, { name: "Tommy Paul", price: 230 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Carlos Alcaraz", price: -270 }, { name: "Tommy Paul", price: 225 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Carlos Alcaraz", price: -265 }, { name: "Tommy Paul", price: 220 }] }] },
        { key: "bet365",     title: "Bet365",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Carlos Alcaraz", price: -275 }, { name: "Tommy Paul", price: 235 }] }] },
      ],
    },
    {
      id: "d-bundesliga-1",
      sport_key: "soccer_germany_bundesliga",
      sport_title: "Bundesliga",
      commence_time: soon(90),
      home_team: "Heidenheim",
      away_team: "Bayern Munich",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Heidenheim", price: 750 }, { name: "Bayern Munich", price: -380 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Heidenheim", price: 725 }, { name: "Bayern Munich", price: -360 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Heidenheim", price: 775 }, { name: "Bayern Munich", price: -400 }] }] },
        { key: "bet365",     title: "Bet365",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Heidenheim", price: 740 }, { name: "Bayern Munich", price: -370 }] }] },
      ],
    },
    {
      id: "d-nba-2",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: soon(110),
      home_team: "Washington Wizards",
      away_team: "Boston Celtics",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Washington Wizards", price: 560 }, { name: "Boston Celtics", price: -800 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Washington Wizards", price: 545 }, { name: "Boston Celtics", price: -785 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Washington Wizards", price: 580 }, { name: "Boston Celtics", price: -820 }] }] },
        { key: "caesars",    title: "Caesars",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Washington Wizards", price: 570 }, { name: "Boston Celtics", price: -810 }] }] },
      ],
    },
  ]
}
