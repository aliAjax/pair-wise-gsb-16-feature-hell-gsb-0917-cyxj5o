import { maxAbGap, pta } from "./domain";
import type { FittingRecord, FilterState } from "./types";

/** 单条记录是否命中筛选条件（链条内逐版本筛选） */
export function matchRecord(record: FittingRecord, filters: FilterState): boolean {
  if (filters.status !== "all" && record.status !== filters.status) return false;
  if (filters.categories.length > 0) {
    if (!record.data.category || !filters.categories.includes(record.data.category)) return false;
  }
  if (filters.needsReferral && maxAbGap(record.data) <= 20) return false;
  const q = filters.query.trim().toLowerCase();
  if (q) {
    const haystack = [
      record.data.patientName,
      record.data.deviceModel,
      record.data.audiologist,
      record.data.feedback,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export interface Stats {
  total: number;
  draftCount: number;
  signedCount: number;
  blockedCount: number;
  referralPending: number;
  referralClosed: number;
  avgPta: { L: number | null; R: number | null };
  avgSpeech: { L: number | null; R: number | null };
}

function avg(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

/** 统计直接从（已筛选的）记录集合派生，保证与列表、状态实时同步 */
export function computeStats(records: FittingRecord[], validate: (r: FittingRecord) => boolean): Stats {
  const signed = records.filter((r) => r.status === "signed");
  const drafts = records.filter((r) => r.status === "draft");
  const blocked = drafts.filter((r) => !validate(r));

  const needReferral = records.filter((r) => maxAbGap(r.data) > 20);

  return {
    total: records.length,
    draftCount: drafts.length,
    signedCount: signed.length,
    blockedCount: blocked.length,
    referralPending: needReferral.filter((r) => !r.data.referral.trim()).length,
    referralClosed: needReferral.filter((r) => r.data.referral.trim()).length,
    avgPta: {
      L: avg(signed.map((r) => pta(r, "L"))),
      R: avg(signed.map((r) => pta(r, "R"))),
    },
    avgSpeech: {
      L: avg(signed.map((r) => r.data.speech.L)),
      R: avg(signed.map((r) => r.data.speech.R)),
    },
  };
}
