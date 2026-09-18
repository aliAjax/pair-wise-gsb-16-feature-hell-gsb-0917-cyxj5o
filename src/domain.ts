import {
  AC_FREQUENCIES,
  BC_FREQUENCIES,
  CATEGORIES,
  EARS,
  EAR_LABEL,
  type BcFreq,
  type Ear,
  type FittingData,
  type FittingRecord,
  type GapPoint,
  type SignIssue,
} from "./types";

/** 听阈允许范围 dB HL */
export const THRESHOLD_MIN = -10;
export const THRESHOLD_MAX = 120;
export const SPEECH_MIN = 0;
export const SPEECH_MAX = 100;
export const GAIN_MIN = 0;
export const GAIN_MAX = 60;
/** 气骨导差阈值，超过即必须有转诊建议 */
export const AB_GAP_LIMIT = 20;

export function emptyEarAudiogram(): FittingData["ears"][Ear] {
  return {
    ac: Object.fromEntries(AC_FREQUENCIES.map((f) => [f, null])) as EarAudiogramShape,
    bc: Object.fromEntries(BC_FREQUENCIES.map((f) => [f, null])) as EarAudiogramShapeBc,
  };
}

type EarAudiogramShape = Record<(typeof AC_FREQUENCIES)[number], number | null>;
type EarAudiogramShapeBc = Record<(typeof BC_FREQUENCIES)[number], number | null>;

export function emptyFittingData(): FittingData {
  return {
    patientName: "",
    category: "",
    deviceModel: "",
    audiologist: "",
    ears: { L: emptyEarAudiogram(), R: emptyEarAudiogram() },
    speech: { L: null, R: null },
    gain: { L: null, R: null },
    referral: "",
    feedback: "",
  };
}

export function uid(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** 深拷贝签发快照数据（structuredClone 在目标浏览器可用） */
export function cloneData(data: FittingData): FittingData {
  return structuredClone(data);
}

function inRange(v: number | null, min: number, max: number): boolean {
  return v === null || (Number.isFinite(v) && v >= min && v <= max);
}

/** 找出所有同频气骨导差数据点 */
export function gapPoints(data: FittingData): GapPoint[] {
  const points: GapPoint[] = [];
  for (const ear of EARS) {
    for (const freq of BC_FREQUENCIES) {
      const ac = data.ears[ear].ac[freq];
      const bc = data.ears[ear].bc[freq];
      if (ac !== null && bc !== null) {
        points.push({ ear, freq: freq as BcFreq, ac, bc, gap: ac - bc });
      }
    }
  }
  return points;
}

export function maxAbGap(data: FittingData): number {
  const gaps = gapPoints(data).map((p) => p.gap);
  return gaps.length ? Math.max(...gaps) : 0;
}

/**
 * 签发阻断校验。返回空数组表示可以签发：
 * 1. 必填项不得缺失（基础信息、全频率气导/骨导、言语识别率、增益、签发人）
 * 2. 数值必须在合理范围
 * 3. 同频骨导不得高于气导（提示数据方向错误）
 * 4. 任一同频气骨导差 > 20dB 时，必须写转诊建议
 */
export function validateForSign(data: FittingData): SignIssue[] {
  const issues: SignIssue[] = [];

  const textFields: Array<[keyof FittingData, string]> = [
    ["patientName", "客户姓名"],
    ["deviceModel", "助听器型号"],
    ["audiologist", "听力师（签发人）"],
  ];
  for (const [key, label] of textFields) {
    if (!String(data[key] ?? "").trim()) {
      issues.push({ message: `缺少必填项：${label}` });
    }
  }
  if (!data.category) {
    issues.push({ message: "缺少必填项：验配分类" });
  } else if (!CATEGORIES.includes(data.category)) {
    issues.push({ message: "验配分类不合法" });
  }

  for (const ear of EARS) {
    for (const freq of AC_FREQUENCIES) {
      const v = data.ears[ear].ac[freq];
      if (v === null || !Number.isFinite(v)) {
        issues.push({ message: `${EAR_LABEL[ear]} ${freq}Hz 气导听阈未填` });
      } else if (!inRange(v, THRESHOLD_MIN, THRESHOLD_MAX)) {
        issues.push({ message: `${EAR_LABEL[ear]} ${freq}Hz 气导 ${v}dB 超出 ${THRESHOLD_MIN}~${THRESHOLD_MAX}dB 范围` });
      }
    }
    for (const freq of BC_FREQUENCIES) {
      const v = data.ears[ear].bc[freq];
      if (v === null || !Number.isFinite(v)) {
        issues.push({ message: `${EAR_LABEL[ear]} ${freq}Hz 骨导听阈未填` });
      } else if (!inRange(v, THRESHOLD_MIN, THRESHOLD_MAX)) {
        issues.push({ message: `${EAR_LABEL[ear]} ${freq}Hz 骨导 ${v}dB 超出范围` });
      }
    }
    for (const [field, label, min, max] of [
      [data.speech[ear], "言语识别率", SPEECH_MIN, SPEECH_MAX],
      [data.gain[ear], "增益", GAIN_MIN, GAIN_MAX],
    ] as Array<[number | null, string, number, number]>) {
      if (field === null || !Number.isFinite(field)) {
        issues.push({ message: `${EAR_LABEL[ear]}${label}未填` });
      } else if (!inRange(field, min, max)) {
        issues.push({ message: `${EAR_LABEL[ear]}${label} ${field} 超出 ${min}~${max}` });
      }
    }
  }

  // 听阈都合法后再做方向与气骨导差判断
  const points = gapPoints(data);
  const reversed = points.filter((p) => p.bc > p.ac);
  for (const p of reversed) {
    issues.push({
      message: `${EAR_LABEL[p.ear]} ${p.freq}Hz 骨导(${p.bc})高于气导(${p.ac})，请复核数据`,
    });
  }

  const overLimit = points.filter((p) => p.gap > AB_GAP_LIMIT && p.bc <= p.ac);
  if (overLimit.length > 0 && !data.referral.trim()) {
    const worst = overLimit.reduce((a, b) => (a.gap > b.gap ? a : b));
    issues.push({
      message: `${EAR_LABEL[worst.ear]} ${worst.freq}Hz 气骨导差 ${worst.gap}dB 超过 ${AB_GAP_LIMIT}dB，签发前必须填写转诊建议`,
    });
  }

  return issues;
}

/**
 * 三频 PTA（500/1000/2000Hz 气导均值）；听阈未填齐返回 null。
 */
export function pta(record: FittingRecord, ear: Ear): number | null {
  const freqs: BcFreq[] = [500, 1000, 2000];
  let sum = 0;
  for (const f of freqs) {
    const v = record.data.ears[ear].ac[f];
    if (v === null) return null;
    sum += v;
  }
  return Math.round(sum / freqs.length);
}

export function formatDateTime(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function revisionLabel(record: FittingRecord): string {
  return record.revision === 0 ? "初版" : `第 ${record.revision} 次复调修订`;
}

export function patientChainName(records: FittingRecord[]): string {
  const signed = records.find((r) => r.status === "signed") ?? records[0];
  return signed?.data.patientName || "未命名客户";
}
