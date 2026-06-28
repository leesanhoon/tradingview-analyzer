import type { ApiFootballBet } from "./betting-api.js";
import type { CompactMarket, CompactOdds, CompactOutcome, MatchInfo } from "./betting-types.js";

export const NAME_LEGEND =
  "name codes: H=home,A=away,D=draw,O=over,U=under,GG=both teams score,NG=not both teams score. " +
  "KQ+TOT dùng code 2 ký tự (HO/HU/DO/DU/AO/AU = kết quả+tổng). " +
  "Point trong asia_handicap/asia_totals/result_total_goals/corners_handicap/corners_totals/team_goals_home/team_goals_away giữ nguyên dấu từ nguồn. " +
  "asia_handicap/asia_totals/corners_handicap/corners_totals/team_goals_home/team_goals_away chỉ giữ ±2 mốc (level) quanh equilibrium, bỏ mốc cực đoan. " +
  "corners_1x2/corners_handicap/corners_totals là kèo phạt góc (Corners 1x2 / Corners Asian Handicap / Corners Over Under). " +
  "btts (Both Teams Score) là kèo GG/NG. team_goals_home/team_goals_away là Tài Xỉu số bàn thắng riêng của từng đội (Total - Home / Total - Away).";

const EQUILIBRIUM_PRICE_RANGE = { low: 1.8, high: 2.0 };
const MIN_TOTALS_PRICE = 1.7;
/** Mốc handicap "giữa" — luôn giữ, không cần xét vùng giá trị. */
const MIDDLE_HANDICAP_LEVELS = [0.75, 1];
/** Mốc handicap "biên" — chỉ giữ khi odds nằm trong vùng giá trị (equilibrium). */
const EDGE_HANDICAP_LEVELS = [0, 0.25, 1.25];
/** Mốc Corners HCP lệch quá xa — luôn bỏ dù ở vùng giá trị nào. */
const EXTREME_CORNERS_HANDICAP_LEVELS = [1.5, 2];

function findBet(bets: ApiFootballBet[], name: string): ApiFootballBet | undefined {
  return bets.find((b) => b.name.toLowerCase() === name.toLowerCase());
}

function compact3Way(bet: ApiFootballBet | undefined): CompactOutcome[] {
  if (!bet) return [];
  const map: Record<string, string> = { Home: "H", Draw: "D", Away: "A" };
  return bet.values
    .filter((v) => map[v.value] !== undefined)
    .map((v) => ({ name: map[v.value], price: Number(v.odd) }));
}

/** "Home -1" / "Away +0.5" -> { side: "H"|"A", point: number }. */
function parseSidePoint(value: string): { side: "H" | "A"; point: number } | null {
  const m = value.match(/^(Home|Away)\s+([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { side: m[1] === "Home" ? "H" : "A", point: Number(m[2]) };
}

/**
 * "Asian Handicap" — giữ mốc giữa (±0.75, ±1) luôn, mốc biên (0, ±0.25, ±1.25) chỉ giữ khi
 * odds nằm trong vùng giá trị (equilibrium); với Corners HCP còn bỏ thêm mốc lệch quá xa (±1.5, ±2).
 */
function compactHandicap(bet: ApiFootballBet | undefined, isCorners = false): CompactOutcome[] {
  if (!bet) return [];
  const parsed = bet.values
    .map((v) => {
      const sp = parseSidePoint(v.value);
      return sp ? { ...sp, price: Number(v.odd) } : null;
    })
    .filter((v): v is { side: "H" | "A"; point: number; price: number } => v !== null);

  if (parsed.length === 0) return [];

  return parsed
    .filter((p) => {
      const abs = Math.abs(p.point);
      if (isCorners && EXTREME_CORNERS_HANDICAP_LEVELS.includes(abs)) return false;
      if (MIDDLE_HANDICAP_LEVELS.includes(abs)) return true;
      if (EDGE_HANDICAP_LEVELS.includes(abs)) {
        return p.price >= EQUILIBRIUM_PRICE_RANGE.low && p.price <= EQUILIBRIUM_PRICE_RANGE.high;
      }
      return false;
    })
    .map((p) => ({ name: p.side, price: p.price, point: p.point }));
}

/** "Over 1.5" / "Under 1.5" -> { side: "Over"|"Under", point: number }. */
function parseTotalPoint(value: string): { side: "Over" | "Under"; point: number } | null {
  const m = value.match(/^(Over|Under)\s+([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { side: m[1] as "Over" | "Under", point: Number(m[2]) };
}

/** "Goals Over/Under" — chỉ giữ mốc có odds (Over và Under) đều ≥ 1.70, bỏ mốc lệch quá xa. */
function compactTotals(bet: ApiFootballBet | undefined): CompactOutcome[] {
  if (!bet) return [];
  const parsed = bet.values
    .map((v) => {
      const tp = parseTotalPoint(v.value);
      return tp ? { ...tp, price: Number(v.odd) } : null;
    })
    .filter((v): v is { side: "Over" | "Under"; point: number; price: number } => v !== null);

  if (parsed.length === 0) return [];

  const minPriceByPoint = new Map<number, number>();
  for (const p of parsed) {
    const existing = minPriceByPoint.get(p.point);
    if (existing === undefined || p.price < existing) minPriceByPoint.set(p.point, p.price);
  }

  return parsed
    .filter((p) => (minPriceByPoint.get(p.point) ?? 0) >= MIN_TOTALS_PRICE)
    .map((p) => ({ name: p.side, price: p.price, point: p.point }));
}

const RESULT_CODE: Record<string, string> = { Home: "H", Draw: "D", Away: "A" };
const TOTAL_CODE: Record<string, string> = { Over: "O", Under: "U" };

/** "Home/Over 1.5" -> { name: "HO", point: 1.5 }. */
function parseResultTotal(value: string): { name: string; point: number } | null {
  const m = value.match(/^(Home|Draw|Away)\/(Over|Under)\s+([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { name: `${RESULT_CODE[m[1]]}${TOTAL_CODE[m[2]]}`, point: Number(m[3]) };
}

/** "Result/Total Goals" — combo kết quả + tổng điểm, liệt kê đầy đủ mọi mốc. */
function compactResultTotal(bet: ApiFootballBet | undefined): CompactOutcome[] {
  if (!bet) return [];
  const outcomes: CompactOutcome[] = [];
  for (const v of bet.values) {
    const rt = parseResultTotal(v.value);
    if (rt) outcomes.push({ name: rt.name, price: Number(v.odd), point: rt.point });
  }
  return outcomes;
}

function pushIfNotEmpty(markets: CompactMarket[], key: string, outcomes: CompactOutcome[]): void {
  if (outcomes.length > 0) markets.push({ key, outcomes });
}

/** "Both Teams Score" — Yes/No -> GG (cả 2 đội ghi bàn) / NG (không cả 2 đội ghi bàn). */
function compactBtts(bet: ApiFootballBet | undefined): CompactOutcome[] {
  if (!bet) return [];
  const map: Record<string, string> = { Yes: "GG", No: "NG" };
  return bet.values
    .filter((v) => map[v.value] !== undefined)
    .map((v) => ({ name: map[v.value], price: Number(v.odd) }));
}

/**
 * Map các bet API-Football sang format compact — chỉ giữ market core cho phân tích S1
 * (H2H, Asian Handicap, Goals Over/Under, KQ+Tổng, Correct Score, Phạt góc, GG/NG). Bỏ H1/H2
 * (độ ưu tiên thấp, không dùng cho main bet S1).
 */
export function compactOdds(bets: ApiFootballBet[], updateIso: string | undefined, _match: MatchInfo): CompactOdds {
  const markets: CompactMarket[] = [];

  pushIfNotEmpty(markets, "h2h", compact3Way(findBet(bets, "Match Winner")));
  pushIfNotEmpty(markets, "asia_handicap", compactHandicap(findBet(bets, "Asian Handicap")));
  pushIfNotEmpty(markets, "asia_totals", compactTotals(findBet(bets, "Goals Over/Under")));
  pushIfNotEmpty(markets, "result_total_goals", compactResultTotal(findBet(bets, "Result/Total Goals")));
  pushIfNotEmpty(markets, "btts", compactBtts(findBet(bets, "Both Teams Score")));
  pushIfNotEmpty(markets, "team_goals_home", compactTotals(findBet(bets, "Total - Home")));
  pushIfNotEmpty(markets, "team_goals_away", compactTotals(findBet(bets, "Total - Away")));
  pushIfNotEmpty(markets, "corners_1x2", compact3Way(findBet(bets, "Corners 1x2")));
  pushIfNotEmpty(markets, "corners_handicap", compactHandicap(findBet(bets, "Corners Asian Handicap"), true));
  pushIfNotEmpty(markets, "corners_totals", compactTotals(findBet(bets, "Corners Over Under")));

  const updatedUnix = updateIso ? Math.floor(new Date(updateIso).getTime() / 1000) : Math.floor(Date.now() / 1000);

  return { updatedUnix, legend: NAME_LEGEND, markets };
}
