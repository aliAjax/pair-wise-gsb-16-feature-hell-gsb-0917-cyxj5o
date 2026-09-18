import { cloneData, emptyFittingData, uid, validateForSign } from "./domain";
import type {
  AcFreq,
  BcFreq,
  Category,
  Ear,
  FittingData,
  FittingRecord,
  FilterState,
} from "./types";

const STORE_KEY = "hxwl-01.fitting-store.v1";
const UI_KEY = "hxwl-01.fitting-ui.v1";
const DAY = 24 * 60 * 60 * 1000;

export interface StoreShape {
  /** 所有版本的记录（含已冻结的历史版本） */
  records: FittingRecord[];
  /** 已删除草稿的墓碑，防止旧标签页 storage 事件把草稿“复活” */
  tombstones: string[];
}

export interface UIShape {
  filters: FilterState;
  selectedRevisionId: string | null;
}

export const DEFAULT_FILTERS: FilterState = {
  status: "all",
  categories: [],
  needsReferral: false,
  query: "",
};

/* ----------------------------- 种子数据 ----------------------------- */

function seededData(
  name: string,
  category: Category,
  model: string,
  audiologist: string,
  pairs: Array<{ ear: Ear; ac: number[]; bc: number[]; speech: number; gain: number }>,
  extra: Partial<Pick<FittingData, "referral" | "feedback">> = {},
): FittingData {
  const data = emptyFittingData();
  data.patientName = name;
  data.category = category;
  data.deviceModel = model;
  data.audiologist = audiologist;
  const acFreqs: AcFreq[] = [250, 500, 1000, 2000, 4000, 8000];
  const bcFreqs: BcFreq[] = [500, 1000, 2000, 4000];
  for (const p of pairs) {
    acFreqs.forEach((f, i) => {
      data.ears[p.ear].ac[f] = p.ac[i];
    });
    bcFreqs.forEach((f, i) => {
      data.ears[p.ear].bc[f] = p.bc[i];
    });
    data.speech[p.ear] = p.speech;
    data.gain[p.ear] = p.gain;
  }
  data.referral = extra.referral ?? "";
  data.feedback = extra.feedback ?? "";
  return data;
}

function seedRecords(): FittingRecord[] {
  const now = Date.now();

  // 链条一：初版已签发
  const liuInit: FittingRecord = {
    chainId: "seed-chain-1",
    revisionId: "seed-r1-v0",
    revision: 0,
    status: "signed",
    createdAt: now - 42 * DAY,
    updatedAt: now - 42 * DAY,
    signedAt: now - 42 * DAY,
    signedBy: "王听力",
    data: seededData(
      "Liu-024",
      "初配",
      "RIC-460",
      "王听力",
      [
        { ear: "L", ac: [25, 30, 40, 50, 55, 60], bc: [25, 35, 45, 50], speech: 72, gain: 22 },
        { ear: "R", ac: [20, 30, 35, 45, 55, 60], bc: [25, 30, 40, 50], speech: 76, gain: 24 },
      ],
      { feedback: "RIC 机型，2kHz 后增益提高 4dB" },
    ),
  };

  // 链条一：第 1 次复调修订，已签发
  const liuRev1: FittingRecord = {
    chainId: "seed-chain-1",
    revisionId: "seed-r1-v1",
    revision: 1,
    status: "signed",
    createdAt: now - 20 * DAY,
    updatedAt: now - 20 * DAY,
    signedAt: now - 20 * DAY,
    signedBy: "王听力",
    data: seededData(
      "Liu-024",
      "复调",
      "RIC-460",
      "王听力",
      [
        { ear: "L", ac: [25, 30, 40, 48, 54, 60], bc: [26, 36, 44, 48], speech: 80, gain: 24 },
        { ear: "R", ac: [20, 30, 36, 44, 54, 60], bc: [26, 32, 40, 48], speech: 82, gain: 26 },
      ],
      { feedback: "微调后安静环境言语识别率提升明显" },
    ),
  };

  // 链条二：传导性损失，初版已签发，带转诊建议
  const chenInit: FittingRecord = {
    chainId: "seed-chain-2",
    revisionId: "seed-r2-v0",
    revision: 0,
    status: "signed",
    createdAt: now - 30 * DAY,
    updatedAt: now - 30 * DAY,
    signedAt: now - 30 * DAY,
    signedBy: "李听力",
    data: seededData(
      "Chen-118",
      "初配",
      "BTE-675",
      "李听力",
      [
        { ear: "L", ac: [45, 50, 55, 50, 45, 40], bc: [15, 15, 20, 20], speech: 58, gain: 30 },
        { ear: "R", ac: [15, 15, 20, 20, 25, 25], bc: [10, 15, 15, 20], speech: 92, gain: 18 },
      ],
      {
        referral: "左耳气骨导差 35dB，疑似传导性听力损失，建议转耳鼻喉科行声导抗及耳科检查。",
        feedback: "低频压缩略降，反馈啸叫已消失",
      },
    ),
  };

  // 链条二：复调草稿——气骨导差仍 > 20dB 且转诊建议为空，演示“不得签发”
  const chenDraft: FittingRecord = {
    chainId: "seed-chain-2",
    revisionId: "seed-r2-v1",
    revision: 1,
    status: "draft",
    createdAt: now - 2 * DAY,
    updatedAt: now - 2 * DAY,
    data: seededData(
      "Chen-118",
      "复调",
      "BTE-675",
      "李听力",
      [
        { ear: "L", ac: [40, 45, 50, 45, 40, 38], bc: [15, 15, 20, 20], speech: 64, gain: 32 },
        { ear: "R", ac: [15, 15, 20, 20, 25, 25], bc: [10, 15, 15, 20], speech: 93, gain: 18 },
      ],
      { feedback: "助听听阈改善，等待耳科复查结果" },
    ),
  };

  // 链条三：老人语频区下降，初版已签发
  const zhao: FittingRecord = {
    chainId: "seed-chain-3",
    revisionId: "seed-r3-v0",
    revision: 0,
    status: "signed",
    createdAt: now - 12 * DAY,
    updatedAt: now - 12 * DAY,
    signedAt: now - 12 * DAY,
    signedBy: "王听力",
    data: seededData(
      "Zhao-077",
      "老人",
      "ITE-312",
      "王听力",
      [
        { ear: "L", ac: [20, 25, 40, 45, 45, 50], bc: [20, 25, 38, 42], speech: 76, gain: 26 },
        { ear: "R", ac: [25, 30, 42, 48, 48, 52], bc: [25, 30, 40, 45], speech: 74, gain: 26 },
      ],
      { feedback: "言语识别率从 64% 提升到 76%" },
    ),
  };

  return [liuInit, liuRev1, chenInit, chenDraft, zhao];
}

/* --------------------------- 读取 / 迁移 --------------------------- */

function isRecord(x: unknown): x is FittingRecord {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.chainId === "string" &&
    typeof r.revisionId === "string" &&
    typeof r.revision === "number" &&
    (r.status === "draft" || r.status === "signed") &&
    typeof r.data === "object" &&
    typeof r.createdAt === "number" &&
    typeof r.updatedAt === "number"
  );
}

function safeLoad(): StoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreShape;
      if (parsed && Array.isArray(parsed.records) && Array.isArray(parsed.tombstones)) {
        const records = parsed.records.filter(isRecord);
        return { records, tombstones: parsed.tombstones.filter((t) => typeof t === "string") };
      }
    }
  } catch {
    /* 损坏数据回落为初始状态 */
  }
  return { records: seedRecords(), tombstones: [] };
}

let store: StoreShape = safeLoad();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* 配额满或隐私模式：本次会话仍可用，刷新后无法保留 */
  }
  listeners.forEach((fn) => fn());
}

/**
 * 冲突合并：已签发历史永远优先（冻结值不可被任何来源覆盖）；
 * 草稿按 updatedAt 取较新；墓碑排除已删除草稿（已签发 ID 不会进墓碑）。
 */
function mergeStores(local: StoreShape, remote: StoreShape): StoreShape {
  const byId = new Map<string, FittingRecord>();
  const put = (r: FittingRecord) => {
    const existing = byId.get(r.revisionId);
    if (!existing) {
      byId.set(r.revisionId, r);
      return;
    }
    if (existing.status === "signed") return; // 已签发历史优先
    if (r.status === "signed" || r.updatedAt > existing.updatedAt) {
      byId.set(r.revisionId, r);
    }
  };
  local.records.forEach(put);
  remote.records.forEach(put);

  const tombstones = Array.from(new Set([...local.tombstones, ...remote.tombstones]));
  const records = Array.from(byId.values()).filter(
    (r) => r.status === "signed" || !tombstones.includes(r.revisionId),
  );
  return { records, tombstones };
}

function handleStorage(e: StorageEvent) {
  if (e.key !== STORE_KEY || !e.newValue) return;
  try {
    const remote = JSON.parse(e.newValue) as StoreShape;
    if (!remote || !Array.isArray(remote.records)) return;
    const next = mergeStores(store, {
      records: remote.records.filter(isRecord),
      tombstones: remote.tombstones ?? [],
    });
    const changed =
      next.records.length !== store.records.length ||
      next.records.some((r) => {
        const old = store.records.find((o) => o.revisionId === r.revisionId);
        return !old || old.updatedAt !== r.updatedAt || old.status !== r.status;
      });
    if (changed) {
      store = next;
      listeners.forEach((fn) => fn());
    }
  } catch {
    /* 忽略无法解析的外部写入 */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", handleStorage);
}

/* ------------------------------ 查询 ------------------------------ */

export function getStore(): StoreShape {
  return store;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getRecord(revisionId: string): FittingRecord | undefined {
  return store.records.find((r) => r.revisionId === revisionId);
}

export function getChain(chainId: string): FittingRecord[] {
  return store.records
    .filter((r) => r.chainId === chainId)
    .sort((a, b) => b.revision - a.revision || b.updatedAt - a.updatedAt);
}

export function getChains(): FittingRecord[][] {
  const map = new Map<string, FittingRecord[]>();
  for (const r of store.records) {
    if (!map.has(r.chainId)) map.set(r.chainId, []);
    map.get(r.chainId)!.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    const latestA = Math.max(...a.map((r) => r.updatedAt));
    const latestB = Math.max(...b.map((r) => r.updatedAt));
    return latestB - latestA;
  });
}

/* ------------------------------ 命令 ------------------------------ */

function assertDraft(record: FittingRecord | undefined): record is FittingRecord {
  return !!record && record.status === "draft";
}

export function createDraft(): FittingRecord {
  const now = Date.now();
  const record: FittingRecord = {
    chainId: uid("chain"),
    revisionId: uid("rev"),
    revision: 0,
    status: "draft",
    data: emptyFittingData(),
    createdAt: now,
    updatedAt: now,
  };
  store = { ...store, records: [...store.records, record] };
  persist();
  return record;
}

/**
 * 保存草稿编辑。已签发记录是冻结快照，任何写入都被拒绝。
 */
export function saveDraft(revisionId: string, updater: (data: FittingData) => void): FittingRecord | null {
  const record = getRecord(revisionId);
  if (!assertDraft(record)) return null;
  const next: FittingRecord = {
    ...record,
    data: cloneData(record.data),
    updatedAt: Date.now(),
  };
  updater(next.data);
  store = {
    ...store,
    records: store.records.map((r) => (r.revisionId === revisionId ? next : r)),
  };
  persist();
  return next;
}

export function deleteDraft(revisionId: string): void {
  const record = getRecord(revisionId);
  if (!record || record.status === "signed") return; // 已签发历史不允许删除
  store = {
    records: store.records.filter((r) => r.revisionId !== revisionId),
    tombstones: Array.from(new Set([...store.tombstones, revisionId])),
  };
  persist();
}

/**
 * 签发：先跑阻断校验，通过后数据冻结（深拷贝当前值），记录状态与时间戳落盘。
 */
export function signRecord(revisionId: string): { ok: true; record: FittingRecord } | { ok: false; issues: ReturnType<typeof validateForSign> } {
  const record = getRecord(revisionId);
  if (!assertDraft(record)) {
    return { ok: false, issues: [{ message: "只有草稿可以签发，已签发记录已冻结" }] };
  }
  const issues = validateForSign(record.data);
  if (issues.length > 0) return { ok: false, issues };

  const now = Date.now();
  const signed: FittingRecord = {
    ...record,
    data: cloneData(record.data),
    status: "signed",
    signedAt: now,
    signedBy: record.data.audiologist.trim(),
    updatedAt: now,
  };
  store = {
    ...store,
    records: store.records.map((r) => (r.revisionId === revisionId ? signed : r)),
  };
  persist();
  return { ok: true, record: signed };
}

/**
 * 复调：已签发记录不能原地修改——以某个已签发版本为蓝本，
 * 深拷贝数据新建下一修订次数的草稿，旧版完整保留在链上。
 */
export function createRevision(baseRevisionId: string): FittingRecord | null {
  const base = getRecord(baseRevisionId);
  if (!base || base.status !== "signed") return null;
  const chain = getChain(base.chainId);
  const nextRevision = Math.max(...chain.map((r) => r.revision)) + 1;
  const now = Date.now();
  const draft: FittingRecord = {
    chainId: base.chainId,
    revisionId: uid("rev"),
    revision: nextRevision,
    status: "draft",
    data: cloneData(base.data),
    createdAt: now,
    updatedAt: now,
  };
  // 新修订默认沿用基础信息，但需重新走签发流程：清空签发痕迹、把分类置为复调
  draft.data.category = "复调";
  store = { ...store, records: [...store.records, draft] };
  persist();
  return draft;
}

/* --------------------------- UI 偏好（筛选/选中） --------------------------- */

export function loadUI(): UIShape {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UIShape>;
      return {
        filters: { ...DEFAULT_FILTERS, ...(parsed.filters ?? {}) },
        selectedRevisionId: parsed.selectedRevisionId ?? null,
      };
    }
  } catch {
    /* ignore */
  }
  return { filters: DEFAULT_FILTERS, selectedRevisionId: null };
}

let ui: UIShape = loadUI();
const uiListeners = new Set<() => void>();

function notifyUI() {
  uiListeners.forEach((fn) => fn());
}

export function getUI(): UIShape {
  return ui;
}

export function subscribeUI(fn: () => void): () => void {
  uiListeners.add(fn);
  return () => uiListeners.delete(fn);
}

export function saveUI(next: UIShape): void {
  ui = next;
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  notifyUI();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== UI_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as Partial<UIShape>;
      ui = {
        filters: { ...DEFAULT_FILTERS, ...(parsed.filters ?? {}) },
        selectedRevisionId: parsed.selectedRevisionId ?? null,
      };
      notifyUI();
    } catch {
      /* ignore */
    }
  });
}
