/** Mã `lotteryId` của xoso.com.vn cho từng tỉnh/đài (lấy từ dropdown #ddLotteries trang thong-ke-lo-*.html). */
const PROVINCE_LOTTERY_ID_RAW: Record<string, number> = {
  "Miền Bắc": 0,
  "An Giang": 20,
  "Bạc Liêu": 17,
  "Bến Tre": 16,
  "Bình Định": 38,
  "Bình Dương": 24,
  "Bình Phước": 27,
  "Bình Thuận": 22,
  "Cà Mau": 15,
  "Cần Thơ": 11,
  "Đà Lạt": 31,
  "Đà Nẵng": 37,
  "Đắk Lắk": 34,
  "Đắc Lắc": 34,
  "Đắk Nông": 44,
  "Đồng Nai": 19,
  "Đồng Tháp": 13,
  "Gia Lai": 42,
  "Hậu Giang": 28,
  "Huế": 32,
  "Thừa Thiên Huế": 32,
  "Khánh Hòa": 36,
  "Kiên Giang": 29,
  "Kon Tum": 45,
  "Long An": 26,
  "Ninh Thuận": 41,
  "Phú Yên": 33,
  "Quảng Bình": 39,
  "Quảng Nam": 35,
  "Quảng Ngãi": 43,
  "Quảng Trị": 40,
  "Sóc Trăng": 18,
  "Tây Ninh": 21,
  "Tiền Giang": 30,
  "TP.HCM": 14,
  "TPHCM": 14,
  "Trà Vinh": 25,
  "Vĩnh Long": 23,
  "Vũng Tàu": 10,
};

const DIACRITICS_MAP: [RegExp, string][] = [
  [/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a"],
  [/[èéẹẻẽêềếệểễ]/g, "e"],
  [/[ìíịỉĩ]/g, "i"],
  [/[òóọỏõôồốộổỗơờớợởỡ]/g, "o"],
  [/[ùúụủũưừứựửữ]/g, "u"],
  [/[ỳýỵỷỹ]/g, "y"],
  [/đ/g, "d"],
];

function normalizeKey(value: string): string {
  let result = value.toLowerCase();
  for (const [pattern, replacement] of DIACRITICS_MAP) result = result.replace(pattern, replacement);
  return result.replace(/[^a-z0-9]/g, "");
}

const PROVINCE_LOTTERY_ID: Record<string, number> = {};
for (const [name, id] of Object.entries(PROVINCE_LOTTERY_ID_RAW)) {
  PROVINCE_LOTTERY_ID[normalizeKey(name)] = id;
}

/** Tra `lotteryId` xoso.com.vn đúng tỉnh/đài — trả `undefined` nếu không tìm thấy (tỉnh mới/tên lạ). */
export function lotteryIdForProvince(province: string): number | undefined {
  return PROVINCE_LOTTERY_ID[normalizeKey(province)];
}

function toDmy(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export type DoSoResult = { hit: boolean; prize?: string };

/** Gọi API "dò vé số" của xoso.com.vn — hỏi xem `number` đã xuất hiện đúng ngày `dateStr` ở đài `lotteryId` chưa. */
export async function checkNumberAppeared(lotteryId: number, lotteryName: string, number: string, dateStr: string): Promise<DoSoResult> {
  const dmy = toDmy(dateStr);
  const url =
    `https://xoso.com.vn/ThongKeAjax/DoSo?lotteryId=${lotteryId}&lotteryName=${encodeURIComponent(lotteryName)}` +
    `&lotos=${number}&dayfr=${encodeURIComponent(dmy)}&dayto=${encodeURIComponent(dmy)}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest" },
  });
  if (!response.ok) {
    throw new Error(`xoso.com.vn DoSo trả về lỗi (${response.status}) cho ${lotteryName}`);
  }
  const html = await response.text();

  const countMatch = html.match(new RegExp(`${number}\\s+xuat\\s+hien\\s+(\\d+)`, "i"));
  const count = countMatch ? Number(countMatch[1]) : 0;
  if (count === 0) return { hit: false };

  const prizeMatch = html.match(/<td>([^<]*?giải[^<]*)</i);
  return { hit: true, prize: prizeMatch?.[1] };
}
