import fs from "fs";
import path from "path";
import type { MatchInfo } from "./betting-types.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MATCHES_CACHE_FILE = path.join(DATA_DIR, "matches-list.json");
const SENT_MATCHES_FILE = path.join(DATA_DIR, "sent-matches.json");

/** Coi như trận đã đá xong, có thể xóa khỏi danh sách "đã gửi". */
const SENT_MARKER_GRACE_SECONDS = 2 * 60 * 60;

/** Danh sách trận chỉ refetch tối đa 1 lần mỗi ngày. */
const MATCHES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type MatchesCache = { fetchedAtUnix: number; matches: MatchInfo[] };

export function loadDailyMatchesCache(): MatchesCache | null {
  try {
    const raw = fs.readFileSync(MATCHES_CACHE_FILE, "utf-8");
    return JSON.parse(raw) as MatchesCache;
  } catch {
    return null;
  }
}

export function saveDailyMatchesCache(matches: MatchInfo[], now: number = Date.now()): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const cache: MatchesCache = { fetchedAtUnix: Math.floor(now / 1000), matches };
  fs.writeFileSync(MATCHES_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

export function isDailyCacheValid(cache: MatchesCache | null, now: number = Date.now()): boolean {
  return cache !== null && now - cache.fetchedAtUnix * 1000 < MATCHES_CACHE_TTL_MS;
}

/**
 * Đánh dấu nhẹ — chỉ gameId + kickoffUnix + stage, không lưu odds — để biết 1 trận
 * đã gửi ở giai đoạn nào rồi: "periodic" (lấy sớm, mỗi 5h, trận trong 24h tới) và
 * "final" (lấy cuối, ngay trước kickoff) là 2 giai đoạn độc lập, mỗi trận gửi tối đa
 * 1 lần/giai đoạn — tổng cộng tối đa 2 lần gửi Telegram/trận.
 */
export type SentStage = "periodic" | "final";
type SentMatchRecord = { gameId: string; kickoffUnix: number; stage: SentStage };

function loadSentMatches(now: number = Date.now()): SentMatchRecord[] {
  let records: SentMatchRecord[];
  try {
    records = JSON.parse(fs.readFileSync(SENT_MATCHES_FILE, "utf-8")) as SentMatchRecord[];
  } catch {
    return [];
  }
  const nowSeconds = now / 1000;
  return records.filter((r) => r.kickoffUnix + SENT_MARKER_GRACE_SECONDS >= nowSeconds);
}

export function hasBeenSent(gameId: string, stage: SentStage): boolean {
  return loadSentMatches().some((r) => r.gameId === gameId && r.stage === stage);
}

export function markMatchesSent(matches: MatchInfo[], stage: SentStage, now: number = Date.now()): void {
  if (matches.length === 0) return;
  const existing = loadSentMatches(now);
  const newRecords = matches.map((m) => ({ gameId: m.gameId, kickoffUnix: m.kickoffUnix, stage }));
  const merged = [
    ...existing,
    ...newRecords.filter((n) => !existing.some((e) => e.gameId === n.gameId && e.stage === n.stage)),
  ];

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SENT_MATCHES_FILE, JSON.stringify(merged), "utf-8");
}
