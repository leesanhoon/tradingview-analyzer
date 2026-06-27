import { fetchGameZip } from "./betting-api.js";
import type { MatchInfo, MatchOddsPayload, RawGameEntry } from "./betting-types.js";

const PLACEHOLDER_TEAM = /^(1st|2nd)\s+teams?$/i;

export function isPlaceholderTeam(name: string): boolean {
  return PLACEHOLDER_TEAM.test(name.trim());
}

export function extractMatches(raw: unknown): MatchInfo[] {
  const games = (raw as { Value?: { G?: RawGameEntry[] } }).Value?.G ?? [];
  return games
    .filter((g) => !isPlaceholderTeam(g.O1) && !isPlaceholderTeam(g.O2))
    .map((g) => ({
      gameId: g.CI,
      home: g.O1,
      away: g.O2,
      kickoffUnix: g.S,
    }));
}

export function filterUpcomingWithin(
  matches: MatchInfo[],
  hours: number,
  now: number = Date.now(),
): MatchInfo[] {
  const windowMs = hours * 60 * 60 * 1000;
  return matches.filter((m) => {
    const diff = m.kickoffUnix * 1000 - now;
    return diff > 0 && diff <= windowMs;
  });
}

export type OddsFailure = { match: MatchInfo; message: string };

export async function buildOddsPayload(
  matches: MatchInfo[],
): Promise<{ payload: MatchOddsPayload[]; failures: OddsFailure[] }> {
  const payload: MatchOddsPayload[] = [];
  const failures: OddsFailure[] = [];

  for (const match of matches) {
    try {
      const zip = await fetchGameZip(String(match.gameId));
      const odds = (zip as { Value?: { GE?: unknown } }).Value?.GE ?? [];
      payload.push({ ...match, odds });
      console.log(`  ✓ Lấy kèo: ${match.home} vs ${match.away} (id=${match.gameId})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠ Lỗi lấy kèo cho ${match.home} vs ${match.away} (id=${match.gameId}): ${message}`);
      failures.push({ match, message });
    }
  }

  return { payload, failures };
}
