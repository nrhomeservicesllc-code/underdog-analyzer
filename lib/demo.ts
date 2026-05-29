import type { OddsApiEvent } from "@/types/betting"

export function demoEvents(): OddsApiEvent[] {
  const now = new Date()
  const live = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  const soon = (m: number) => new Date(now.getTime() + m * 60_000).toISOString()

  return [
    {
      id: "demo-nba-1",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: live(38),
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
    {
      id: "demo-epl-1",
      sport_key: "soccer_epl",
      sport_title: "EPL",
      commence_time: live(52),
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
      id: "demo-tennis-1",
      sport_key: "tennis_atp_french_open",
      sport_title: "ATP French Open",
      commence_time: live(72),
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
      id: "demo-mlb-1",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: live(88),
      home_team: "Kansas City Royals",
      away_team: "New York Yankees",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 215 }, { name: "New York Yankees", price: -255 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 225 }, { name: "New York Yankees", price: -265 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 208 }, { name: "New York Yankees", price: -248 }] }] },
        { key: "caesars",    title: "Caesars",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Kansas City Royals", price: 220 }, { name: "New York Yankees", price: -260 }] }] },
      ],
    },
    {
      id: "demo-mma-1",
      sport_key: "mma_mixed_martial_arts",
      sport_title: "MMA",
      commence_time: live(18),
      home_team: "Dustin Poirier",
      away_team: "Islam Makhachev",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Dustin Poirier", price: 340 }, { name: "Islam Makhachev", price: -425 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Dustin Poirier", price: 325 }, { name: "Islam Makhachev", price: -410 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Dustin Poirier", price: 355 }, { name: "Islam Makhachev", price: -440 }] }] },
        { key: "caesars",    title: "Caesars",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Dustin Poirier", price: 335 }, { name: "Islam Makhachev", price: -420 }] }] },
      ],
    },
    {
      id: "demo-nhl-1",
      sport_key: "icehockey_nhl",
      sport_title: "NHL",
      commence_time: soon(40),
      home_team: "Colorado Avalanche",
      away_team: "Florida Panthers",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 115 }, { name: "Florida Panthers", price: -138 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 112 }, { name: "Florida Panthers", price: -135 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 120 }, { name: "Florida Panthers", price: -142 }] }] },
        { key: "bet365",     title: "Bet365",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Colorado Avalanche", price: 118 }, { name: "Florida Panthers", price: -140 }] }] },
      ],
    },
    {
      id: "demo-mlb-2",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: soon(75),
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
      id: "demo-bundesliga-1",
      sport_key: "soccer_germany_bundesliga",
      sport_title: "Bundesliga",
      commence_time: soon(110),
      home_team: "Heidenheim",
      away_team: "Bayern Munich",
      bookmakers: [
        { key: "fanduel",    title: "FanDuel",    last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Heidenheim", price: 750 }, { name: "Bayern Munich", price: -380 }] }] },
        { key: "draftkings", title: "DraftKings", last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Heidenheim", price: 725 }, { name: "Bayern Munich", price: -360 }] }] },
        { key: "betmgm",     title: "BetMGM",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Heidenheim", price: 775 }, { name: "Bayern Munich", price: -400 }] }] },
        { key: "bet365",     title: "Bet365",     last_update: now.toISOString(), markets: [{ key: "h2h", last_update: now.toISOString(), outcomes: [{ name: "Heidenheim", price: 740 }, { name: "Bayern Munich", price: -370 }] }] },
      ],
    },
  ]
}
