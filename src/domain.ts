// 听力验配领域模型：记录结构、签发校验、修订与冲突合并、本地持久化。

export const FREQUENCIES = [250, 500, 1000, 2000, 4000, 8000] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type Ear = "left" | "right";
export const EARS: readonly Ear[] = ["left", "right"];
export const EAR_LABEL: Record<Ear, string> = { left: "左耳", right: "右耳" };

export const CATEGORIES = ["初配", "复调", "儿童", "老人"] as const;
export type Category = (typeof CATEGORIES)[number];

export type RecordStatus = "draft" | "issued";

/** 气骨导差超过该值（dB）时必须填写转诊建议才能签发 */
export const ABG_REFERRAL_THRESHOLD = 20;
export const MIN_DB = -10;
export const MAX_DB = 120;
export const MAX_GAIN = 80;

export interface EarThresholds {
  air: Record<Frequency, number | null>;
  bone: Record<Frequency, number | null>;
}

export interface FittingRecord {
  id: string;
  /** 同一份验配档案的所有修订共享 groupId */
  groupId: string;
  /** 0 = 首版，每次复调修订 +1 */
  revision: number;
  patientName: string;
  category: Category;
  thresholds: Record<Ear, EarThresholds>;
  /** 言语识别率 % */
  speech: Record<Ear, number | null>;
  /** 增益 dB */
  gain: Record<Ear, number | null>;
  /** 转诊建议 */
  referral: string;
  /** 用户反馈 / 备注 */
  notes: string;
  status: RecordStatus;
  createdAt: number;
  updatedAt: number;
  issuedAt: number | null;
  issuedBy: string | null;
}

export interface ValidationIssue {
  code: "missing" | "range" | "bone-over-air" | "referral";
  message: string;
}

function freqMap(value: number | null): Record<Frequency, number | null> {
  return { 250: value, 500: value, 1000: value, 2000: value, 4000: value, 8000: value };
}

export function emptyThresholds(): EarThresholds {
  return { air: freqMap(null), bone: freqMap(null) };
}

let uidSeq = 0;
function uid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createDraft(now = Date.now()): FittingRecord {
  const id = uid("HX");
  return {
    id,
    groupId: id,
    revision: 0,
    patientName: "",
    category: "初配",
    thresholds: { left: emptyThresholds(), right: emptyThresholds() },
    speech: { left: null, right: null },
    gain: { left: null, right: null },
    referral: "",
    notes: "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    issuedAt: null,
    issuedBy: null,
  };
}

/** 以 group 内最新版本为底稿生成下一次复调修订（旧版本保留不动） */
export function createRevision(source: FittingRecord, nextRevision: number, now = Date.now()): FittingRecord {
  return {
    ...structuredClone(source),
    id: uid("HX"),
    groupId: source.groupId,
    revision: nextRevision,
    category: "复调",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    issuedAt: null,
    issuedBy: null,
  };
}

export function revisionLabel(r: FittingRecord): string {
  return r.revision === 0 ? "首版" : `第${r.revision}次修订`;
}

export function airBoneGap(r: FittingRecord, ear: Ear, f: Frequency): number | null {
  const air = r.thresholds[ear].air[f];
  const bone = r.thresholds[ear].bone[f];
  if (air == null || bone == null) return null;
  return air - bone;
}

/** 纯音平均（500/1k/2k/4k Hz 气导均值） */
export function pta(r: FittingRecord, ear: Ear): number | null {
  const pts = ([500, 1000, 2000, 4000] as Frequency[]).map((f) => r.thresholds[ear].air[f]);
  if (pts.some((v) => v == null)) return null;
  return Math.round((pts as number[]).reduce((a, b) => a + b, 0) / pts.length);
}

export function withThreshold(
  r: FittingRecord,
  ear: Ear,
  kind: "air" | "bone",
  f: Frequency,
  value: number | null
): FittingRecord {
  return {
    ...r,
    thresholds: {
      ...r.thresholds,
      [ear]: { ...r.thresholds[ear], [kind]: { ...r.thresholds[ear][kind], [f]: value } },
    },
  };
}

export function withEarField(
  r: FittingRecord,
  field: "speech" | "gain",
  ear: Ear,
  value: number | null
): FittingRecord {
  return { ...r, [field]: { ...r[field], [ear]: value } };
}

/**
 * 签发前校验。存在以下任一情况即不得签发：
 * 1. 缺必填项（姓名、分频气骨导、言语识别率、增益）或数值超范围；
 * 2. 同频骨导高于气导（生理上不可能成立，属录入错误）；
 * 3. 任一频率气骨导差超过 20dB 且未填写转诊建议。
 */
export function validateRecord(r: FittingRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!r.patientName.trim()) {
    issues.push({ code: "missing", message: "缺少必填项：患者姓名" });
  }
  const missing: string[] = [];
  const outOfRange: string[] = [];
  for (const ear of EARS) {
    const label = EAR_LABEL[ear];
    for (const f of FREQUENCIES) {
      const air = r.thresholds[ear].air[f];
      const bone = r.thresholds[ear].bone[f];
      if (air == null) missing.push(`${label}${f}Hz气导`);
      else if (air < MIN_DB || air > MAX_DB) outOfRange.push(`${label}${f}Hz气导(${air}dB)`);
      if (bone == null) missing.push(`${label}${f}Hz骨导`);
      else if (bone < MIN_DB || bone > MAX_DB) outOfRange.push(`${label}${f}Hz骨导(${bone}dB)`);
      if (air != null && bone != null && bone > air) {
        issues.push({
          code: "bone-over-air",
          message: `${label} ${f}Hz：骨导 ${bone}dB 高于同频气导 ${air}dB，数据不可能成立，请核对录入`,
        });
      }
    }
    const speech = r.speech[ear];
    if (speech == null) missing.push(`${label}言语识别率`);
    else if (speech < 0 || speech > 100) outOfRange.push(`${label}言语识别率(${speech}%)`);
    const gain = r.gain[ear];
    if (gain == null) missing.push(`${label}增益`);
    else if (gain < 0 || gain > MAX_GAIN) outOfRange.push(`${label}增益(${gain}dB)`);
  }
  if (missing.length) {
    issues.push({ code: "missing", message: `缺少必填项：${missing.join("、")}` });
  }
  if (outOfRange.length) {
    issues.push({
      code: "range",
      message: `数值超出合理范围：${outOfRange.join("、")}（阈值 ${MIN_DB}~${MAX_DB}dB，识别率 0~100%，增益 0~${MAX_GAIN}dB）`,
    });
  }
  const gapSpots: string[] = [];
  for (const ear of EARS) {
    for (const f of FREQUENCIES) {
      const gap = airBoneGap(r, ear, f);
      if (gap != null && gap > ABG_REFERRAL_THRESHOLD) {
        gapSpots.push(`${EAR_LABEL[ear]}${f}Hz(${gap}dB)`);
      }
    }
  }
  if (gapSpots.length && !r.referral.trim()) {
    issues.push({
      code: "referral",
      message: `气骨导差超过${ABG_REFERRAL_THRESHOLD}dB：${gapSpots.join("、")}，须填写转诊建议后方可签发`,
    });
  }
  return issues;
}

/** 冲突裁决：已签发历史优先；同为已签发取签发时间更早的历史版本；同为草稿取最近修改 */
export function resolveConflict(a: FittingRecord, b: FittingRecord): FittingRecord {
  if (a.status !== b.status) return a.status === "issued" ? a : b;
  if (a.status === "issued") {
    const at = a.issuedAt ?? Number.MAX_SAFE_INTEGER;
    const bt = b.issuedAt ?? Number.MAX_SAFE_INTEGER;
    return at <= bt ? a : b;
  }
  return a.updatedAt >= b.updatedAt ? a : b;
}

/** 按 id 合并两批记录，同 id 冲突时走 resolveConflict（已签发历史优先） */
export function mergeRecords(base: FittingRecord[], incoming: FittingRecord[]): FittingRecord[] {
  const map = new Map<string, FittingRecord>();
  for (const r of base) map.set(r.id, r);
  for (const r of incoming) {
    const prev = map.get(r.id);
    map.set(r.id, prev ? resolveConflict(prev, r) : r);
  }
  return [...map.values()];
}

export const RECORDS_STORAGE_KEY = "hxwl-01:records:v1";

export function loadRecords(): FittingRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return seedRecords();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedRecords();
    // 落盘数据若存在同 id 冲突，以已签发历史为准
    return mergeRecords([], parsed as FittingRecord[]);
  } catch {
    return seedRecords();
  }
}

export function saveRecords(records: FittingRecord[]): void {
  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 存储不可用（隐私模式等）时静默降级为内存态
  }
}

function makeThresholds(air: (number | null)[], bone: (number | null)[]): EarThresholds {
  const zip = (vals: (number | null)[]) =>
    Object.fromEntries(FREQUENCIES.map((f, i) => [f, vals[i] ?? null])) as Record<Frequency, number | null>;
  return { air: zip(air), bone: zip(bone) };
}

/** 首次启动的示例数据：一份已签发、一份已签发+复调草稿、一份缺项草稿 */
export function seedRecords(): FittingRecord[] {
  const now = Date.now();
  const day = 24 * 3600 * 1000;

  const liu: FittingRecord = {
    ...createDraft(now - 9 * day),
    id: "HX-2026-0001",
    groupId: "HX-2026-0001",
    patientName: "刘慧敏",
    category: "初配",
    thresholds: {
      left: makeThresholds([15, 20, 30, 45, 60, 65], [10, 15, 25, 40, 55, 60]),
      right: makeThresholds([20, 25, 35, 50, 65, 70], [15, 20, 30, 45, 60, 65]),
    },
    speech: { left: 88, right: 84 },
    gain: { left: 35, right: 38 },
    referral: "",
    notes: "双耳高频下降，RIC机型，2kHz后增益提高4dB。",
    status: "issued",
    updatedAt: now - 8 * day,
    issuedAt: now - 8 * day,
    issuedBy: "听力师",
  };

  const chenV0: FittingRecord = {
    ...createDraft(now - 6 * day),
    id: "HX-2026-0002",
    groupId: "HX-2026-0002",
    patientName: "陈国强",
    category: "老人",
    thresholds: {
      left: makeThresholds([15, 20, 20, 25, 30, 35], [10, 15, 15, 20, 25, 30]),
      right: makeThresholds([45, 50, 55, 60, 65, 70], [20, 20, 25, 30, 35, 40]),
    },
    speech: { left: 92, right: 68 },
    gain: { left: 20, right: 45 },
    referral: "右耳各频气骨导差>20dB，建议转诊耳鼻喉科排查中耳病变，完善声导抗检查。",
    notes: "单侧传导性损失，右耳明显。",
    status: "issued",
    updatedAt: now - 5 * day,
    issuedAt: now - 5 * day,
    issuedBy: "听力师",
  };

  const chenV1: FittingRecord = {
    ...structuredClone(chenV0),
    id: "HX-2026-0002-R1",
    revision: 1,
    category: "复调",
    status: "draft",
    gain: { left: 20, right: 42 },
    notes: "低频压缩略降，反馈啸叫已消失。",
    createdAt: now - day,
    updatedAt: now - day,
    issuedAt: null,
    issuedBy: null,
  };

  const zhao: FittingRecord = {
    ...createDraft(now - 2 * day),
    id: "HX-2026-0003",
    groupId: "HX-2026-0003",
    patientName: "赵秀兰",
    category: "老人",
    thresholds: {
      left: makeThresholds([30, 35, 45, 50, 55, 60], [25, 30, 40, 45, 50, 55]),
      right: makeThresholds([35, 40, 50, 55, 60, 65], [30, 35, 45, 50, 55, null]),
    },
    speech: { left: 76, right: 72 },
    gain: { left: 30, right: 32 },
    referral: "",
    notes: "老人语频区下降，言语识别率从64%提升到76%。",
    updatedAt: now - 3600 * 1000,
  };

  return [chenV1, zhao, liu, chenV0];
}
