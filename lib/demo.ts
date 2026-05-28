import type { OddsApiEvent } from "@/types/betting"

export function demoEvents(): OddsApiEvent[] {
  const now = new Date()
  const live = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  const soon = (m: number) => new Date(now.getTime() + m * 60_000).toISOString()

  return [
    {
      id: "d-nba-1",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: live(38),
      home_team: "Oklahoma City Thunder",
      away_team: "Los Angeles Lakers",
      bookmakers: [
        { key: "fanduel",   title: "FanDuel",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -165 }, { name: "Los Angeles Lakers", price: 142 }] }] },
        { key: "draftkings",title: "DraftKings",last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -170 }, { name: "Los Angeles Lakers", price: 148 }] }] },
        { key: "betmgm",    title: "BetMGM",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -155 }, { name: "Los Angeles Lakers", price: 138 }] }] },
        { key: "caesars",   title: "Caesars",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -162 }, { name: "Los Angeles Lakers", price: 145 }] }] },
        { key: "pointsbet", title: "PointsBet", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Oklahoma City Thunder", price: -158 }, { name: "Los Angeles Lakers", price: 150 }] }] },
      ],
    },
    {
      id: "d-mlb-1",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: live(75),
      home_team: "Kansas City Royals",
      away_team: "New York Yankees",
      bookmakers: [
        { key: "fanduel",   title: "FanDuel",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 215 }, { name: "New York Yankees", price: -255 }] }] },
        { key: "draftkings",title: "DraftKings",last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 225 }, { name: "New York Yankees", price: -265 }] }] },
        { key: "betmgm",    title: "BetMGM",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 208 }, { name: "New York Yankees", price: -248 }] }] },
        { key: "caesars",   title: "Caesars",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 220 }, { name: "New York Yankees", price: -260 }] }] },
      ],
    },
    {
      id: "d-mlb-2",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: soon(30),
      home_team: "Pittsburgh Pirates",
      away_team: "Los Angeles Dodgers",
      bookmakers: [
        { key: "fanduel",   title: "FanDuel",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Pittsburgh Pirates", price: 310 }, { name: "Los Angeles Dodgers", price: -385 }] }] },
        { key: "draftkings",title: "DraftKings",last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Pittsburgh Pirates", price: 298 }, { name: "Los Angeles Dodgers", price: -372 }] }] },
        { key: "betmgm",    title: "BetMGM",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Pittsburgh Pirates", price: 325 }, { name: "Los Angeles Dodgers", price: -400 }] }] },
        { key: "caesars",   title: "Caesars",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Pittsburgh Pirates", price: 305 }, { name: "Los Angeles Dodgers", price: -380 }] }] },
      ],
    },
    {
      id: "d-nhl-1",
      sport_key: "icehockey_nhl",
      sport_title: "NHL",
      commence_time: soon(20),
      home_team: "Colorado Avalanche",
      away_team: "Florida Panthers",
      bookmakers: [
        { key: "fanduel",   title: "FanDuel",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 115 }, { name: "Florida Panthers", price: -138 }] }] },
        { key: "draftkings",title: "DraftKings",last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 112 }, { name: "Florida Panthers", price: -135 }] }] },
        { key: "betmgm",    title: "BetMGM",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 120 }, { name: "Florida Panthers", price: -142 }] }] },
      ],
    },
    {
      id: "d-soccer-1",
      sport_key: "soccer_epl",
      sport_title: "EPL",
      commence_time: live(52),
      home_team: "Wolverhampton Wanderers",
      away_team: "Arsenal",
      bookmakers: [
        { key: "fanduel",   title: "FanDuel",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Wolverhampton Wanderers", price: 480 }, { name: "Arsenal", price: -165 }] }] },
        { key: "draftkings",title: "DraftKings",last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Wolverhampton Wanderers", price: 465 }, { name: "Arsenal", price: -155 }] }] },
        { key: "betmgm",    title: "BetMGM",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Wolverhampton Wanderers", price: 500 }, { name: "Arsenal", price: -172 }] }] },
      ],
    },
    {
      id: "d-mls-1",
      sport_key: "soccer_usa_mls",
      sport_title: "MLS",
      commence_time: live(18),
      home_team: "Chicago Fire",
      away_team: "Inter Miami",
      bookmakers: [
        { key: "fanduel",   title: "FanDuel",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Chicago Fire", price: 255 }, { name: "Inter Miami", price: -310 }] }] },
        { key: "draftkings",title: "DraftKings",last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Chicago Fire", price: 248 }, { name: "Inter Miami", price: -298 }] }] },
        { key: "betmgm",    title: "BetMGM",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Chicago Fire", price: 265 }, { name: "Inter Miami", price: -320 }] }] },
      ],
    },
    {
      id: "d-nba-2",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: soon(90),
      home_team: "Washington Wizards",
      away_team: "Boston Celtics",
      bookmakers: [
        { key: "fanduel",   title: "FanDuel",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Washington Wizards", price: 560 }, { name: "Boston Celtics", price: -800 }] }] },
        { key: "draftkings",title: "DraftKings",last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Washington Wizards", price: 545 }, { name: "Boston Celtics", price: -785 }] }] },
        { key: "betmgm",    title: "BetMGM",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Washington Wizards", price: 580 }, { name: "Boston Celtics", price: -820 }] }] },
        { key: "caesars",   title: "Caesars",   last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Washington Wizards", price: 570 }, { name: "Boston Celtics", price: -810 }] }] },
      ],
    },
  ]
}
