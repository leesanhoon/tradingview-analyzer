import { describe, expect, test } from "vitest";
import { predictTopNumbers } from "../../src/lottery/lottery-predict.js";

describe("lottery/predictTopNumbers", () => {
  test("returns empty list for empty input", () => {
    expect(predictTopNumbers([], "mien-bac")).toEqual([]);
  });

  test("scores numbers from historical frequency and recent gaps", () => {
    const records = [
      {
        date: "2026-06-28",
        weekday: 0,
        region: "mien-bac" as const,
        province: "Hà Nội",
        prizes: {
          db: "00123",
          g1: "00456",
          g2: [],
          g3: [],
          g4: [],
          g5: [],
          g6: [],
          g7: [],
          g8: [],
        },
      },
      {
        date: "2026-06-29",
        weekday: 1,
        region: "mien-bac" as const,
        province: "Hải Phòng",
        prizes: {
          db: "00999",
          g1: "00123",
          g2: [],
          g3: [],
          g4: [],
          g5: [],
          g6: [],
          g7: [],
          g8: [],
        },
      },
      {
        date: "2026-06-30",
        weekday: 2,
        region: "mien-bac" as const,
        province: "Nam Định",
        prizes: {
          db: "00777",
          g1: "00123",
          g2: [],
          g3: [],
          g4: [],
          g5: [],
          g6: [],
          g7: [],
          g8: [],
        },
      },
    ];

    const result = predictTopNumbers(records, "mien-bac", 3, {
      decay: 1,
      overdueBonus: 0,
      stationSpreadWeight: 0,
    });

    expect(result[0]).toMatchObject({
      number: "123",
      freq: 1,
      weightedFreq: 1,
      gap: 0,
      overdueRatio: 0,
      score: 1,
    });
    expect(result).toHaveLength(3);
    expect(result.map((entry) => entry.number)).toContain("456");
    expect(result.map((entry) => entry.number)).toContain("999");
  });
});
