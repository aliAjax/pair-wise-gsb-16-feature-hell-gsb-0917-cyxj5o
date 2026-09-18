/** 听力验配签发闭环的领域类型 */

export const AC_FREQUENCIES = [250, 500, 1000, 2000, 4000, 8000] as const;
/** 骨导常规测试频率（气导 250/8000Hz 不做骨导，同频校验只在这 4 个频率进行） */
export const BC_FREQUENCIES = [500, 1000, 2000, 4000] as const;

export type AcFreq = (typeof AC_FREQUENCIES)[number];
export type BcFreq = (typeof BC_FREQUENCIES)[number];

export const EARS = ["L", "R"] as const;
export type Ear = (typeof EARS)[number];
export const EAR_LABEL: Record<Ear, string> = { L: "左耳", R: "右耳" };

export const CATEGORIES = ["初配", "复调", "复诊", "儿童", "老人"] as const;
export type Category = (typeof CATEGORIES)[number];

export type RecordStatus = "draft" | "signed";

/** 单耳分频听阈：气导 6 个频率、骨导 4 个频率，单位 dB HL */
export interface EarAudiogram {
  ac: Record<AcFreq, number | null>;
  bc: Record<BcFreq, number | null>;
}

export interface FittingData {
  /** 客户姓名 */
  patientName: string;
  /** 验配分类 */
  category: Category | "";
  /** 助听器型号 */
  deviceModel: string;
  /** 听力师（签发人） */
  audiologist: string;
  ears: Record<Ear, EarAudiogram>;
  /** 言语识别率 0-100% */
  speech: Record<Ear, number | null>;
  /** 增益调整 0-60 dB */
  gain: Record<Ear, number | null>;
  /** 转诊建议（气骨导差 > 20dB 时必填才能签发） */
  referral: string;
  /** 用户反馈 */
  feedback: string;
}

/**
 * 一条验配记录。
 * chainId 贯穿同一客户档案的所有版本；revisionId 唯一标识某个版本；
 * revision 为修订次数：0 = 初版，1 = 第 1 次复调修订……
 */
export interface FittingRecord {
  chainId: string;
  revisionId: string;
  revision: number;
  status: RecordStatus;
  data: FittingData;
  createdAt: number;
  updatedAt: number;
  signedAt?: number;
  signedBy?: string;
}

export interface SignIssue {
  message: string;
}

export interface GapPoint {
  ear: Ear;
  freq: BcFreq;
  ac: number;
  bc: number;
  /** 气骨导差 = 气导 - 骨导 */
  gap: number;
}

export type StatusFilter = "all" | RecordStatus;

export interface FilterState {
  status: StatusFilter;
  categories: Category[];
  /** 仅看气骨导差 > 20dB 的记录 */
  needsReferral: boolean;
  query: string;
}
