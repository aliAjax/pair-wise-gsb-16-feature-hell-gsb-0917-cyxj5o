import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import {
  ABG_REFERRAL_THRESHOLD,
  CATEGORIES,
  EARS,
  EAR_LABEL,
  FREQUENCIES,
  MAX_GAIN,
  RECORDS_STORAGE_KEY,
  airBoneGap,
  createDraft,
  createRevision,
  loadRecords,
  mergeRecords,
  pta,
  revisionLabel,
  saveRecords,
  seedRecords,
  validateRecord,
  withEarField,
  withThreshold,
  type Category,
  type Ear,
  type FittingRecord,
  type Frequency,
  type ValidationIssue,
} from "./domain";

const UI_STORAGE_KEY = "hxwl-01:ui:v1";
const STATUS_FILTERS = [
  ["all", "全部"],
  ["draft", "草稿"],
  ["issued", "已签发"],
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number][0];
type CategoryFilter = "all" | Category;

interface UiState {
  statusFilter: StatusFilter;
  categoryFilter: CategoryFilter;
  query: string;
}

function loadUiState(): UiState {
  const fallback: UiState = { statusFilter: "all", categoryFilter: "all", query: "" };
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UiState>;
    return {
      statusFilter: STATUS_FILTERS.some(([v]) => v === parsed.statusFilter)
        ? (parsed.statusFilter as StatusFilter)
        : "all",
      categoryFilter:
        parsed.categoryFilter === "all" || (CATEGORIES as readonly string[]).includes(parsed.categoryFilter ?? "")
          ? (parsed.categoryFilter as CategoryFilter)
          : "all",
      query: typeof parsed.query === "string" ? parsed.query : "",
    };
  } catch {
    return fallback;
  }
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, sub, index }: { label: string; value: string; sub: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <em className="metric-sub">{sub}</em>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function NumberCell({
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  value: number | null;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder="—"
      onChange={(e) => {
        const raw = e.target.value;
        const n = Number(raw);
        onChange(raw === "" || Number.isNaN(n) ? null : n);
      }}
    />
  );
}

function EarTable({
  record,
  ear,
  disabled,
  onThreshold,
}: {
  record: FittingRecord;
  ear: Ear;
  disabled: boolean;
  onThreshold: (kind: "air" | "bone", f: Frequency, value: number | null) => void;
}) {
  const t = record.thresholds[ear];
  const ptaValue = pta(record, ear);
  return (
    <div className="ear-block">
      <h3>{EAR_LABEL[ear]}（dB HL）</h3>
      <table className="audio-table">
        <thead>
          <tr>
            <th>频率 Hz</th>
            {FREQUENCIES.map((f) => (
              <th key={f}>{f >= 1000 ? `${f / 1000}k` : f}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>气导</th>
            {FREQUENCIES.map((f) => (
              <td key={f}>
                <NumberCell value={t.air[f]} min={-10} max={120} step={5} disabled={disabled} onChange={(v) => onThreshold("air", f, v)} />
              </td>
            ))}
          </tr>
          <tr>
            <th>骨导</th>
            {FREQUENCIES.map((f) => (
              <td key={f}>
                <NumberCell value={t.bone[f]} min={-10} max={120} step={5} disabled={disabled} onChange={(v) => onThreshold("bone", f, v)} />
              </td>
            ))}
          </tr>
          <tr className="gap-row">
            <th>气骨导差</th>
            {FREQUENCIES.map((f) => {
              const gap = airBoneGap(record, ear, f);
              const cls = gap == null ? "" : gap < 0 ? "gap-invalid" : gap > ABG_REFERRAL_THRESHOLD ? "gap-warn" : "";
              const title = gap == null ? "" : gap < 0 ? "骨导高于同频气导，不可签发" : gap > ABG_REFERRAL_THRESHOLD ? "气骨导差>20dB，须写转诊建议" : "";
              return (
                <td key={f} className={cls} title={title}>
                  {gap == null ? "—" : gap}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <p className="meta">PTA（0.5/1/2/4kHz 气导均值）：{ptaValue == null ? "—" : `${ptaValue} dB`}</p>
    </div>
  );
}

function RecordForm({
  record,
  issues,
  onPatch,
  onAdd,
  onIssue,
  onDelete,
  onRevise,
}: {
  record: FittingRecord;
  issues: ValidationIssue[];
  onPatch: (recipe: (r: FittingRecord) => FittingRecord) => void;
  onAdd: () => void;
  onIssue: () => void;
  onDelete: () => void;
  onRevise: () => void;
}) {
  const frozen = record.status === "issued";
  return (
    <section className="panel form-panel">
      <div className="section-heading">
        <div>
          <p>
            听力验配 · {revisionLabel(record)}
          </p>
          <h2>
            记录表单 <span className={`badge ${record.status}`}>{record.status === "issued" ? "已签发" : "草稿"}</span>
          </h2>
        </div>
        <div className="actions">
          <button onClick={onAdd}>新增记录</button>
          {frozen ? (
            <button className="primary-action" onClick={onRevise}>
              新建复调修订
            </button>
          ) : (
            <>
              <button
                className="primary-action"
                disabled={issues.length > 0}
                title={issues.length ? issues[0].message : "校验通过，点击签发"}
                onClick={onIssue}
              >
                {issues.length ? `签发（${issues.length} 项待处理）` : "签发记录"}
              </button>
              <button className="danger-action" onClick={onDelete}>
                删除草稿
              </button>
            </>
          )}
        </div>
      </div>

      {frozen ? (
        <div className="frozen-banner">
          <span>
            已于 {record.issuedAt ? fmtTime(record.issuedAt) : "—"} 由 {record.issuedBy ?? "听力师"} 签发，数值已冻结。
            如需调整请新建复调修订，旧版本将完整保留。
          </span>
        </div>
      ) : issues.length ? (
        <div className="issue-box">
          <strong>暂不可签发，需先处理 {issues.length} 项：</strong>
          <ul>
            {issues.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="issue-box ok">
          校验通过：必填项齐全、骨导未高于同频气导、气骨导差均在 {ABG_REFERRAL_THRESHOLD}dB 内或已填写转诊建议，可以签发。
        </div>
      )}

      <div className="info-grid">
        <label>
          <span>患者姓名 *</span>
          <input
            value={record.patientName}
            disabled={frozen}
            placeholder="填写患者姓名"
            onChange={(e) => onPatch((r) => ({ ...r, patientName: e.target.value }))}
          />
        </label>
        <label>
          <span>分类</span>
          <select
            value={record.category}
            disabled={frozen}
            onChange={(e) => onPatch((r) => ({ ...r, category: e.target.value as Category }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ear-grid">
        {EARS.map((ear) => (
          <EarTable
            key={ear}
            record={record}
            ear={ear}
            disabled={frozen}
            onThreshold={(kind, f, v) => onPatch((r) => withThreshold(r, ear, kind, f, v))}
          />
        ))}
      </div>

      <div className="quad-grid">
        {EARS.map((ear) => (
          <label key={`speech-${ear}`}>
            <span>{EAR_LABEL[ear]}言语识别率（%）*</span>
            <NumberCell
              value={record.speech[ear]}
              min={0}
              max={100}
              step={1}
              disabled={frozen}
              onChange={(v) => onPatch((r) => withEarField(r, "speech", ear, v))}
            />
          </label>
        ))}
        {EARS.map((ear) => (
          <label key={`gain-${ear}`}>
            <span>{EAR_LABEL[ear]}增益（dB）*</span>
            <NumberCell
              value={record.gain[ear]}
              min={0}
              max={MAX_GAIN}
              step={1}
              disabled={frozen}
              onChange={(v) => onPatch((r) => withEarField(r, "gain", ear, v))}
            />
          </label>
        ))}
      </div>

      <div className="form-section">
        <label>
          <span>转诊建议（任一频率气骨导差超过 {ABG_REFERRAL_THRESHOLD}dB 时必填）</span>
          <textarea
            value={record.referral}
            disabled={frozen}
            placeholder="如：建议转诊耳鼻喉科排查中耳病变，完善声导抗检查……"
            onChange={(e) => onPatch((r) => ({ ...r, referral: e.target.value }))}
          />
        </label>
      </div>
      <div className="form-section">
        <label>
          <span>用户反馈 / 备注</span>
          <textarea
            value={record.notes}
            disabled={frozen}
            placeholder="佩戴情况、啸叫、舒适度等"
            onChange={(e) => onPatch((r) => ({ ...r, notes: e.target.value }))}
          />
        </label>
      </div>

      <p className="meta">
        编号 {record.id} · 档案 {record.groupId} · 创建于 {fmtTime(record.createdAt)} · 更新于 {fmtTime(record.updatedAt)}
        {record.issuedAt ? ` · 签发于 ${fmtTime(record.issuedAt)}` : ""}
      </p>
    </section>
  );
}

function GroupCard({
  group,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onRevise,
}: {
  group: FittingRecord[];
  selectedId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onRevise: (r: FittingRecord) => void;
}) {
  const head = group[0];
  const history = group.slice(1);
  const leftPta = pta(head, "left");
  const rightPta = pta(head, "right");
  const hasWideGap = EARS.some((ear) =>
    FREQUENCIES.some((f) => {
      const gap = airBoneGap(head, ear, f);
      return gap != null && gap > ABG_REFERRAL_THRESHOLD;
    })
  );
  const headIssues = head.status === "draft" ? validateRecord(head).length : 0;
  const speechText = EARS.map((e) => `${EAR_LABEL[e]}${head.speech[e] == null ? "—" : `${head.speech[e]}%`}`).join(" / ");
  const gainText = EARS.map((e) => `${EAR_LABEL[e]}${head.gain[e] == null ? "—" : `${head.gain[e]}dB`}`).join(" / ");

  return (
    <article className={`record-card ${head.id === selectedId ? "selected" : ""}`}>
      <div className="record-index">{head.patientName ? head.patientName.slice(0, 1) : "？"}</div>
      <div className="record-main">
        <div className="record-title">
          <h3>{head.patientName || "未命名患者"}</h3>
          <span className={`badge ${head.status}`}>{head.status === "issued" ? "已签发" : "草稿"}</span>
          <span className="badge category">{head.category}</span>
          <span className="badge revision">{revisionLabel(head)}</span>
          {hasWideGap && <span className="badge warn">气骨导差&gt;{ABG_REFERRAL_THRESHOLD}dB</span>}
          {head.referral.trim() && <span className="badge referral">已写转诊建议</span>}
          {headIssues > 0 && <span className="badge warn">{headIssues} 项待处理</span>}
        </div>
        <p>
          编号 {head.id} · 左PTA {leftPta ?? "—"}dB · 右PTA {rightPta ?? "—"}dB · 言语 {speechText} · 增益 {gainText} ·
          更新 {fmtTime(head.updatedAt)}
          {head.issuedAt ? ` · 签发 ${fmtTime(head.issuedAt)}` : ""}
        </p>
        <div className="record-actions">
          <button onClick={() => onSelect(head.id)}>
            {head.id === selectedId ? "编辑中" : head.status === "issued" ? "查看" : "继续编辑"}
          </button>
          {head.status === "issued" && <button onClick={() => onRevise(head)}>新建复调修订</button>}
          {history.length > 0 && (
            <button onClick={onToggle}>{expanded ? "收起历史" : `历史版本（${history.length}）`}</button>
          )}
        </div>
        {expanded && history.length > 0 && (
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id}>
                <span className={`badge ${h.status}`}>{h.status === "issued" ? "已签发" : "草稿"}</span>
                <span>{revisionLabel(h)}</span>
                <span className="meta">{h.id}</span>
                <span className="meta">{h.issuedAt ? `签发 ${fmtTime(h.issuedAt)}` : `更新 ${fmtTime(h.updatedAt)}`}</span>
                <button onClick={() => onSelect(h.id)}>查看</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function App() {
  const [initialRecords] = useState(loadRecords);
  const [records, setRecords] = useState<FittingRecord[]>(initialRecords);
  const [ui, setUi] = useState<UiState>(loadUiState);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const latest = [...initialRecords].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return latest ? latest.id : null;
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const lastSavedJson = useRef("");

  // 落盘：任何记录变化都写入 localStorage，刷新不丢
  useEffect(() => {
    const json = JSON.stringify(records);
    if (json === lastSavedJson.current) return;
    lastSavedJson.current = json;
    saveRecords(records);
  }, [records]);

  // 筛选条件同样落盘
  useEffect(() => {
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui));
    } catch {
      /* 存储不可用时忽略 */
    }
  }, [ui]);

  // 多标签页同步：冲突时已签发历史优先
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== RECORDS_STORAGE_KEY || e.newValue == null || e.newValue === lastSavedJson.current) return;
      try {
        const incoming = JSON.parse(e.newValue);
        if (Array.isArray(incoming)) {
          setRecords((prev) => mergeRecords(prev, incoming as FittingRecord[]));
        }
      } catch {
        /* 忽略无法解析的写入 */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 列表：按档案分组，组内按修订次数排序，最新版本作为卡片主体
  const groups = useMemo(() => {
    const map = new Map<string, FittingRecord[]>();
    for (const r of records) {
      const list = map.get(r.groupId);
      if (list) list.push(r);
      else map.set(r.groupId, [r]);
    }
    return [...map.values()]
      .map((list) => [...list].sort((a, b) => b.revision - a.revision || b.updatedAt - a.updatedAt))
      .sort((g1, g2) => g2[0].updatedAt - g1[0].updatedAt);
  }, [records]);

  const filteredGroups = useMemo(
    () =>
      groups.filter((g) => {
        const head = g[0];
        if (ui.statusFilter !== "all" && head.status !== ui.statusFilter) return false;
        if (ui.categoryFilter !== "all" && head.category !== ui.categoryFilter) return false;
        const q = ui.query.trim().toLowerCase();
        if (q && !`${head.patientName} ${head.id} ${head.groupId}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [groups, ui]
  );

  // 统计：全部由 records 派生，随状态同步
  const stats = useMemo(() => {
    const issued = records.filter((r) => r.status === "issued").length;
    const heads = groups.map((g) => g[0]);
    const speechValues = heads.flatMap((h) => EARS.map((e) => h.speech[e])).filter((v): v is number => v != null);
    return {
      files: groups.length,
      versions: records.length,
      issued,
      drafts: records.length - issued,
      avgSpeech: speechValues.length ? Math.round(speechValues.reduce((a, b) => a + b, 0) / speechValues.length) : null,
      referrals: heads.filter((h) => h.referral.trim()).length,
    };
  }, [records, groups]);

  const headCounts = useMemo(() => {
    const heads = groups.map((g) => g[0]);
    return {
      all: heads.length,
      draft: heads.filter((h) => h.status === "draft").length,
      issued: heads.filter((h) => h.status === "issued").length,
    };
  }, [groups]);

  const selected = records.find((r) => r.id === selectedId) ?? null;
  const selectedIssues = useMemo(
    () => (selected && selected.status === "draft" ? validateRecord(selected) : []),
    [selected]
  );

  // 签发后冻结：patch 仅对草稿生效
  const patchSelected = (recipe: (r: FittingRecord) => FittingRecord) => {
    if (!selected) return;
    setRecords((prev) =>
      prev.map((r) => (r.id === selected.id && r.status === "draft" ? { ...recipe(r), updatedAt: Date.now() } : r))
    );
  };

  const addRecord = () => {
    const draft = createDraft();
    setRecords((prev) => [draft, ...prev]);
    setSelectedId(draft.id);
  };

  const issueSelected = () => {
    if (!selected || selected.status !== "draft" || validateRecord(selected).length) return;
    if (
      !window.confirm(
        `签发后「${selected.patientName || "未命名患者"}」该版本的数值将冻结，之后只能通过新建复调修订调整。确认签发？`
      )
    ) {
      return;
    }
    const now = Date.now();
    setRecords((prev) =>
      prev.map((r) => (r.id === selected.id ? { ...r, status: "issued", issuedAt: now, issuedBy: "听力师", updatedAt: now } : r))
    );
  };

  const deleteSelectedDraft = () => {
    if (!selected || selected.status !== "draft") return;
    if (!window.confirm("删除该草稿？同档案的已签发版本不受影响。")) return;
    setRecords((prev) => prev.filter((r) => r.id !== selected.id));
    setSelectedId(null);
  };

  // 复调：以档案内最新版本为底稿新建带次数的修订，旧版本保留
  const reviseFrom = (source: FittingRecord) => {
    const group = records.filter((r) => r.groupId === source.groupId);
    const latest = [...group].sort((a, b) => b.revision - a.revision || b.updatedAt - a.updatedAt)[0];
    if (!latest) return;
    if (latest.status === "draft") {
      // 已有进行中的复调草稿，直接跳转，避免重复修订
      setSelectedId(latest.id);
      return;
    }
    const draft = createRevision(latest, latest.revision + 1);
    setRecords((prev) => [draft, ...prev]);
    setSelectedId(draft.id);
  };

  const resetSeeds = () => {
    if (!window.confirm("清空本地全部记录并恢复示例数据？")) return;
    const seeded = seedRecords();
    setRecords(seeded);
    const latest = [...seeded].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    setSelectedId(latest ? latest.id : null);
  };

  const exportSummary = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      stats,
      records: [...records].sort((a, b) => a.groupId.localeCompare(b.groupId) || a.revision - b.revision),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hxwl-01-验配记录-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metrics = [
    { label: "验配档案", value: String(stats.files), sub: `共 ${stats.versions} 个版本（含历史修订）` },
    { label: "已签发", value: String(stats.issued), sub: "数值已冻结，仅可新建修订" },
    { label: "待签发草稿", value: String(stats.drafts), sub: "通过校验后方可签发" },
    { label: "平均言语识别率", value: stats.avgSpeech == null ? "—" : `${stats.avgSpeech}%`, sub: "按各档案最新版本计算" },
    { label: "转诊跟进", value: String(stats.referrals), sub: `气骨导差>${ABG_REFERRAL_THRESHOLD}dB 须写转诊建议` },
  ];

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-01 · port 5101</p>
          <h1>听力验配记录</h1>
          <p className="subtitle">
            门店听力师的验配档案与听力曲线工作台：左右耳分频气骨导、言语识别率与增益一体化录入，校验通过后签发冻结，复调以带次数的修订留痕。
          </p>
        </div>
        <div className="stack-card">
          <span>签发闭环</span>
          <strong>本地落盘 · 签发冻结 · 修订留痕</strong>
          <p className="hint">记录与筛选条件保存在浏览器本地，刷新不丢失；多标签页冲突时以已签发历史为准。</p>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m, index) => (
          <MetricCard key={m.label} label={m.label} value={m.value} sub={m.sub} index={index} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {["听力师", "门店主管", "复诊助理"].map((user) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>状态筛选</h2>
          <div className="chips">
            {STATUS_FILTERS.map(([value, label]) => (
              <button
                key={value}
                className={ui.statusFilter === value ? "active" : ""}
                onClick={() => setUi((s) => ({ ...s, statusFilter: value }))}
              >
                {label}（{headCounts[value]}）
              </button>
            ))}
          </div>
          <h2>分类筛选</h2>
          <div className="chips">
            <button
              className={ui.categoryFilter === "all" ? "active" : ""}
              onClick={() => setUi((s) => ({ ...s, categoryFilter: "all" }))}
            >
              全部
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={ui.categoryFilter === c ? "active" : ""}
                onClick={() => setUi((s) => ({ ...s, categoryFilter: c }))}
              >
                {c}
              </button>
            ))}
          </div>
          <h2>搜索</h2>
          <input
            placeholder="姓名 / 编号"
            value={ui.query}
            onChange={(e) => setUi((s) => ({ ...s, query: e.target.value }))}
          />
          <p className="hint">筛选条件与记录均保存在本地，刷新不丢失。</p>
          <button className="link-btn" onClick={resetSeeds}>
            恢复示例数据
          </button>
        </aside>

        {selected ? (
          <RecordForm
            record={selected}
            issues={selectedIssues}
            onPatch={patchSelected}
            onAdd={addRecord}
            onIssue={issueSelected}
            onDelete={deleteSelectedDraft}
            onRevise={() => reviseFrom(selected)}
          />
        ) : (
          <section className="panel form-panel">
            <div className="section-heading">
              <div>
                <p>听力验配</p>
                <h2>记录表单</h2>
              </div>
              <div className="actions">
                <button className="primary-action" onClick={addRecord}>
                  新增记录
                </button>
              </div>
            </div>
            <p className="empty">从下方列表选择一份记录，或点击「新增记录」开始建档。</p>
          </section>
        )}
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>验配档案</p>
            <h2>
              记录列表（{filteredGroups.length} / {groups.length}）
            </h2>
          </div>
          <button onClick={exportSummary}>导出摘要</button>
        </div>
        <div className="record-list">
          {filteredGroups.map((group) => (
            <GroupCard
              key={group[0].groupId}
              group={group}
              selectedId={selectedId}
              expanded={Boolean(expandedGroups[group[0].groupId])}
              onToggle={() =>
                setExpandedGroups((prev) => ({ ...prev, [group[0].groupId]: !prev[group[0].groupId] }))
              }
              onSelect={setSelectedId}
              onRevise={reviseFrom}
            />
          ))}
          {filteredGroups.length === 0 && <p className="empty">没有匹配的记录，调整筛选或新增记录。</p>}
        </div>
      </section>
    </main>
  );
}

export default App;
