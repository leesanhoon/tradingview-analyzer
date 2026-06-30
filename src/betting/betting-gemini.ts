import { GoogleGenAI } from "@google/genai";
import type { MatchAiAnalysis, MatchOddsPayload } from "./betting-types.js";
import { formatOddsAnalysisInput } from "./odds-text-format.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `Ban la chuyen gia phan tich odds bong da, uu tien ky luat va tinh thuc dung.

Nhiem vu:
- Chi phan tich dua tren odds snapshot duoc cung cap.
- Khong hoi lai nguoi dung.
- Khong duoc dung kien thuc ben ngoai nhu tin tuc, chan thuong, phong do, bang xep hang, hay lich su doi dau.
- Chi duoc suy luan tu cau truc keo, tuong quan gia, va xung dot giua cac market.

Dau ra:
- Tra ve duy nhat mot JSON hop le voi dung cac key sau:
  - match: string
  - preferredScoreline: string
  - scoreConfidence: number
  - recommendation: string
  - confidence: number
  - keyPoints: string[]
  - risks: string[]
  - summary: string

Quy tac:
- Toan bo gia tri string phai viet bang tieng Viet, khong dung tieng Anh.
- preferredScoreline phai la 1 ti so cu the, dang "1-0", "2-1", "1-1"...
- scoreConfidence danh gia rieng muc do tin cay cua ti so uu tien, tu 0-100.
- recommendation phai ngan, thuc dung, va noi ro huong xu ly tu odds.
- confidence danh gia do ro rang cua tin hieu odds, khong phai do chac chan cua ket qua tran dau.
- Neu odds can bang, nhieu xung dot, hoac khong co gia tri ro rang, phai ket luan khong co edge ro rang.
- keyPoints phai co 2 den 4 y ngan.
- risks phai co 2 den 4 y ngan.
- summary phai gon trong 1 den 2 cau.
- Khong duoc them markdown, loi chao, giai thich thua, hay key ngoai danh sach.`;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenAI({ apiKey });
}

function getModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function cleanResponse(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}

function extractJsonObject(text: string): string {
  const cleaned = cleanResponse(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

function clampConfidence(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function sanitizeStringList(value: unknown, fallback: string): string[] {
  if (!Array.isArray(value)) return [fallback];
  const items = value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .slice(0, 4);
  return items.length > 0 ? items : [fallback];
}

export function parseMatchAnalysisResponse(text: string, payload: MatchOddsPayload): MatchAiAnalysis | null {
  const cleaned = extractJsonObject(text);

  try {
    const parsed = JSON.parse(cleaned) as Partial<MatchAiAnalysis>;
    return {
      match: String(parsed.match || `${payload.home} vs ${payload.away}`),
      preferredScoreline: String(parsed.preferredScoreline || "Chua co ti so uu tien"),
      scoreConfidence: clampConfidence((parsed as { scoreConfidence?: unknown }).scoreConfidence),
      recommendation: String(parsed.recommendation || "Khong co goi y ro rang tu odds."),
      confidence: clampConfidence(parsed.confidence),
      keyPoints: sanitizeStringList(parsed.keyPoints, "Khong tach duoc cac diem odds noi bat."),
      risks: sanitizeStringList(parsed.risks, "Can than vi du lieu odds chua cho thay mot edge ro rang."),
      summary: String(parsed.summary || "Khong co du thong tin de rut ra ket luan on dinh."),
    };
  } catch {
    return null;
  }
}

export async function analyzeMatchOdds(payload: MatchOddsPayload): Promise<MatchAiAnalysis> {
  const ai = getClient();
  const model = getModelName();
  const oddsText = formatOddsAnalysisInput(payload);
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `${SYSTEM_PROMPT}\n\n` +
              `Match: ${payload.home} vs ${payload.away}\n` +
              `Kickoff Unix: ${payload.kickoffUnix}\n\n` +
              `Hay phan tich odds snapshot sau va tra ve JSON ngay bay gio.\n\n` +
              `Odds snapshot:\n${oddsText}`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 600,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const parsed = parseMatchAnalysisResponse(response.text ?? "", payload);
  if (!parsed) {
    throw new Error(`Gemini parse failed. Raw: ${(response.text ?? "").slice(0, 300)}`);
  }
  return parsed;
}
