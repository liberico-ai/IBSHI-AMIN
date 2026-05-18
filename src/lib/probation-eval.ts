// Bộ tiêu chí + rule auto-suggest tier HĐ chính thức
// Dựa trên file mẫu IBSHI: BM12.QT15.01_Phiếu đánh giá thử việc

export const PROBATION_CRITERIA: { key: string; label: string }[] = [
  { key: "C1", label: "Khối lượng công việc" },
  { key: "C2", label: "Chất lượng công việc" },
  { key: "C3", label: "Kiến thức về công việc" },
  { key: "C4", label: "Mối quan hệ với giám sát trực tiếp / quản lý" },
  { key: "C5", label: "Hợp tác với mọi người" },
  { key: "C6", label: "Sự chuyên cần và độ tin cậy" },
  { key: "C7", label: "Sáng kiến và sáng tạo" },
  { key: "C8", label: "Năng lực phát triển" },
];

export const PROBATION_RATINGS = {
  SATISFACTORY: { label: "Tốt", points: 3, color: "#22c55e" },
  NEEDS_IMPROVEMENT: { label: "Cần cải thiện", points: 2, color: "#f59e0b" },
  UNACCEPTABLE: { label: "Kém", points: 1, color: "#ef4444" },
  NA: { label: "Không đáp ứng / Không áp dụng", points: 0, color: "#6b7280" },
} as const;

export type RatingKey = keyof typeof PROBATION_RATINGS;

export type EvaluationScores = {
  ratings: Record<string, RatingKey>; // criteria key → rating
  q9PerformsWell: boolean; // "Đã thực hiện tốt nhiệm vụ chưa?"
  q10SignContract: boolean; // "Confirm ký HĐ?"
};

export type ScoreResult = {
  score10: number; // điểm thang 10
  rawTotal: number; // tổng điểm thô
  rawMax: number; // tối đa thô (sau khi bỏ NA)
  countedCriteria: number; // số tiêu chí được đánh giá (loại NA)
  unacceptableCount: number; // số tiêu chí Unacceptable
  recommendedTier: "INDEFINITE" | "DEFINITE_24M" | "DEFINITE_12M" | "FAIL";
};

export function calcScore(scores: EvaluationScores): ScoreResult {
  let rawTotal = 0;
  let countedCriteria = 0;
  let unacceptableCount = 0;

  for (const cr of PROBATION_CRITERIA) {
    const rating = scores.ratings[cr.key];
    if (!rating || rating === "NA") continue;
    rawTotal += PROBATION_RATINGS[rating].points;
    countedCriteria++;
    if (rating === "UNACCEPTABLE") unacceptableCount++;
  }

  const rawMax = countedCriteria * 3;
  const score10 = countedCriteria > 0 ? +((rawTotal / rawMax) * 10).toFixed(1) : 0;

  let recommendedTier: ScoreResult["recommendedTier"];
  if (!scores.q10SignContract || !scores.q9PerformsWell || score10 < 6.0 || unacceptableCount >= 2) {
    recommendedTier = "FAIL";
  } else if (score10 >= 9.0) {
    recommendedTier = "INDEFINITE";
  } else if (score10 >= 7.5) {
    recommendedTier = "DEFINITE_24M";
  } else {
    recommendedTier = "DEFINITE_12M"; // 6.0 ≤ score < 7.5
  }

  return { score10, rawTotal, rawMax, countedCriteria, unacceptableCount, recommendedTier };
}

export const TIER_LABELS: Record<string, string> = {
  INDEFINITE: "HĐ không thời hạn",
  DEFINITE_24M: "HĐ xác định 24 tháng",
  DEFINITE_12M: "HĐ xác định 12 tháng",
  FAIL: "Không qua thử việc",
};

export function tierToContractType(tier: string): "INDEFINITE" | "DEFINITE_12M" | "DEFINITE_24M" | null {
  if (tier === "INDEFINITE") return "INDEFINITE";
  if (tier === "DEFINITE_24M") return "DEFINITE_24M";
  if (tier === "DEFINITE_12M") return "DEFINITE_12M";
  return null;
}

export function calcContractEndDate(tier: string, startDate: Date): Date | null {
  const d = new Date(startDate);
  if (tier === "INDEFINITE") return null;
  if (tier === "DEFINITE_12M") { d.setMonth(d.getMonth() + 12); return d; }
  if (tier === "DEFINITE_24M") { d.setMonth(d.getMonth() + 24); return d; }
  return null;
}
