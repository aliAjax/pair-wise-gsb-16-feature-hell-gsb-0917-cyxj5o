import { useMemo } from "react";
import {
  AB_GAP_LIMIT,
  GAIN_MAX,
  GAIN_MIN,
  SPEECH_MAX,
  SPEECH_MIN,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  formatDateTime,
  gapPoints,
  maxAbGap,
  revisionLabel,
  validateForSign,
} from "../domain";
import { createRevision, deleteDraft, saveDraft, signRecord } from "../storage";
import {
  AC_FREQUENCIES,
  BC_FREQUENCIES,
  CATEGORIES,
  EARS,
  EAR_LABEL,
  type BcFreq,
  type Category,
  type Ear,
  type FittingData,
  type FittingRecord,
} from "../types";
import { AudiogramChart } from "./AudiogramChart";

interface Props {
  record: FittingRecord;
  chain: FittingRecord[];
  onSelectRevision: (revisionId: string) => void;
  onRecordDeleted: (revisionId: string) => void;
}

export function RecordEditor({ record, chain, onSelectRevision, onRecordDeleted }: Props) {
  const isDraft = record.status === "draft";
  const { data } = record;

  const issues = useMemo(() => validateForSign(data), [data]);
  const gapMap = useMemo(() => {
    const m = new Map<string, { gap: number; reversed: boolean }>();
    for (const p of gapPoints(data)) {
      m.set(`${p.ear}-${p.freq}`, { gap: p.gap, reversed: p.bc > p.ac });
    }
    return m;
  }, [data]);
  const worstGap = maxAbGap(data);
  const needsReferral = worstGap > AB_GAP_LIMIT;
  const overLimitCount = Array.from(gapMap.values()).filter(
    (g) => g.gap > AB_GAP_LIMIT && !g.reversed,
  ).length;

  function update(mut: (d: FittingData) => void) {
    if (record.status !== "draft") return;
    saveDraft(record.revisionId, mut);
  }

  function setText(key: "patientName" | "deviceModel" | "audiologist", value: string) {
    update((d) => {
      d[key] = value;
    });
  }

  function setThreshold(ear: Ear, kind: "ac" | "bc", freq: number, raw: string) {
    update((d) => {
      const value = raw.trim() === "" ? null : Number(raw);
      if (kind === "ac") d.ears[ear].ac[freq as keyof typeof d.ears[Ear]["ac"]] = value;
      else d.ears[ear].bc[freq as BcFreq] = value;
    });
  }

  function setSmall(kind: "speech" | "gain", ear: Ear, raw: string) {
    update((d) => {
      d[kind][ear] = raw.trim() === "" ? null : Number(raw);
    });
  }

  function handleSign() {
    const result = signRecord(record.revisionId);
    if (result.ok) onSelectRevision(result.record.revisionId);
  }

  function handleRevision() {
    const draft = createRevision(record.revisionId);
    if (draft) onSelectRevision(draft.revisionId);
  }

  function handleDelete() {
    if (!window.confirm("删除该草稿？已签发的历史版本不受影响。")) return;
    deleteDraft(record.revisionId);
    onRecordDeleted(record.revisionId);
  }

  const inputProps = { disabled: !isDraft };

  return (
    <section className="panel editor">
      <div className="editor-head">
        <div>
          <p className="eyebrow">
            {isDraft ? "草稿 · 编辑自动落盘" : "已签发 · 数值冻结"}
          </p>
          <h2>{data.patientName.trim() || "未命名客户"}</h2>
          <span className="revision-tag">{revisionLabel(record)}</span>
        </div>
        <span className={`status-badge ${isDraft ? "badge-draft" : "badge-signed"}`}>
          {isDraft ? "草稿" : "已签发"}
        </span>
      </div>

      {!isDraft && (
        <div className="frozen-banner">
          <strong>签发冻结</strong>
          <span>
            {record.signedBy} 于 {formatDateTime(record.signedAt)} 签发 · 修改请新建修订，本版本永久保留
          </span>
        </div>
      )}

      <div className="form-grid">
        <label>
          <span>客户姓名 *</span>
          <input
            {...inputProps}
            value={data.patientName}
            placeholder="如 Liu-024"
            onChange={(e) => setText("patientName", e.target.value)}
          />
        </label>
        <label>
          <span>验配分类 *</span>
          <select
            disabled={!isDraft}
            value={data.category}
            onChange={(e) =>
              update((d) => {
                d.category = e.target.value as Category | "";
              })
            }
          >
            <option value="">请选择分类</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>助听器型号 *</span>
          <input
            {...inputProps}
            value={data.deviceModel}
            placeholder="如 RIC-460"
            onChange={(e) => setText("deviceModel", e.target.value)}
          />
        </label>
        <label>
          <span>听力师 / 签发人 *</span>
          <input
            {...inputProps}
            value={data.audiologist}
            placeholder="签发人姓名"
            onChange={(e) => setText("audiologist", e.target.value)}
          />
        </label>
      </div>

      <div className="audiometry-grid">
        <div>
          <h3 className="block-title">
            分频听阈（dB HL）
            <em>同频骨导高于气导或气骨导差 &gt; {AB_GAP_LIMIT}dB 会被标红</em>
          </h3>
          <table className="threshold-table">
            <thead>
              <tr>
                <th>频率 Hz</th>
                <th colSpan={2}>左耳</th>
                <th colSpan={2}>右耳</th>
                <th>气骨导差校验</th>
              </tr>
              <tr>
                <th></th>
                <th>气导</th>
                <th>骨导</th>
                <th>气导</th>
                <th>骨导</th>
                <th>左 / 右</th>
              </tr>
            </thead>
            <tbody>
              {AC_FREQUENCIES.map((freq) => {
                const hasBc = (BC_FREQUENCIES as readonly number[]).includes(freq);
                return (
                  <tr key={freq}>
                    <th>{freq}</th>
                    {(EARS).flatMap((ear: Ear) => [
                      <td key={`${ear}-ac`}>
                        <input
                          type="number"
                          disabled={!isDraft}
                          min={THRESHOLD_MIN}
                          max={THRESHOLD_MAX}
                          value={valueOrEmpty(data.ears[ear].ac[freq])}
                          onChange={(e) => setThreshold(ear, "ac", freq, e.target.value)}
                          aria-label={`${EAR_LABEL[ear]} ${freq}Hz 气导`}
                        />
                      </td>,
                      <td key={`${ear}-bc`} className={!hasBc ? "no-bc" : ""}>
                        {hasBc ? (
                          <input
                            type="number"
                            disabled={!isDraft}
                            min={THRESHOLD_MIN}
                            max={THRESHOLD_MAX}
                            value={valueOrEmpty(data.ears[ear].bc[freq as BcFreq])}
                            onChange={(e) => setThreshold(ear, "bc", freq, e.target.value)}
                            aria-label={`${EAR_LABEL[ear]} ${freq}Hz 骨导`}
                          />
                        ) : (
                          <span className="dash">—</span>
                        )}
                      </td>,
                    ])}
                    <td className="gap-cell">
                      {(["L", "R"] as Ear[]).map((ear) => {
                        const g = hasBc ? gapMap.get(`${ear}-${freq}`) : undefined;
                        if (!g) return <i key={ear} className="gap-none">·</i>;
                        const cls = g.reversed
                          ? "gap-reversed"
                          : g.gap > AB_GAP_LIMIT
                            ? "gap-over"
                            : "gap-ok";
                        return (
                          <i key={ear} className={cls}>
                            {g.reversed ? "骨>气!" : `${g.gap}`}
                          </i>
                        );
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="field-hint">
            允许范围 {THRESHOLD_MIN}~{THRESHOLD_MAX} dB HL；250 / 8000Hz 常规不做骨导
          </p>
        </div>

        <AudiogramChart data={data} />
      </div>

      <h3 className="block-title">言语识别率与增益</h3>
      <div className="small-grid">
        {(["L", "R"] as Ear[]).map((ear) => (
          <div key={ear} className="small-ear-group">
            <h4>{EAR_LABEL[ear]}</h4>
            <label>
              <span>言语识别率 %（{SPEECH_MIN}-{SPEECH_MAX}）*</span>
              <input
                type="number"
                {...inputProps}
                min={SPEECH_MIN}
                max={SPEECH_MAX}
                value={valueOrEmpty(data.speech[ear])}
                onChange={(e) => setSmall("speech", ear, e.target.value)}
              />
            </label>
            <label>
              <span>增益 dB（{GAIN_MIN}-{GAIN_MAX}）*</span>
              <input
                type="number"
                {...inputProps}
                min={GAIN_MIN}
                max={GAIN_MAX}
                value={valueOrEmpty(data.gain[ear])}
                onChange={(e) => setSmall("gain", ear, e.target.value)}
              />
            </label>
          </div>
        ))}
      </div>

      {needsReferral && (
        <div className={`referral-banner ${data.referral.trim() ? "resolved" : "open"}`}>
          {data.referral.trim()
            ? `已有 ${overLimitCount} 个频率点气骨导差超 ${AB_GAP_LIMIT}dB，转诊建议已填写。`
            : `检出 ${overLimitCount} 个频率点气骨导差超 ${AB_GAP_LIMIT}dB（最大 ${worstGap}dB），签发前必须填写转诊建议。`}
        </div>
      )}

      <label className="textarea-label">
        <span>
          转诊建议
          {needsReferral && <b className="required-mark">（本记录必填）</b>}
        </span>
        <textarea
          {...inputProps}
          rows={2}
          value={data.referral}
          placeholder="气骨导差超 20dB 时，写明转诊方向与检查建议"
          onChange={(e) =>
            update((d) => {
              d.referral = e.target.value;
            })
          }
        />
      </label>

      <label className="textarea-label">
        <span>用户反馈 / 调试备注</span>
        <textarea
          {...inputProps}
          rows={2}
          value={data.feedback}
          placeholder="助听效果、啸叫、下次随访计划等"
          onChange={(e) =>
            update((d) => {
              d.feedback = e.target.value;
            })
          }
        />
      </label>

      {isDraft && issues.length > 0 && (
        <div className="issues-panel">
          <h4>签发前需处理（{issues.length}）</h4>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {isDraft && (
        <div className="editor-actions">
          <button className="primary-action" onClick={handleSign} disabled={issues.length > 0}>
            签发并冻结
          </button>
          <button onClick={handleDelete} className="danger-action">
            删除草稿
          </button>
          <span className="save-hint">
            已自动保存 {formatDateTime(record.updatedAt)} · 校验{issues.length === 0 ? "通过" : `未过（${issues.length} 项）`}
          </span>
        </div>
      )}

      {!isDraft && (
        <div className="editor-actions">
          <button className="primary-action" onClick={handleRevision}>
            新建复调修订（第 {record.revision + 1} 次）
          </button>
          <span className="save-hint">
            创建时间 {formatDateTime(record.createdAt)} · 数据已冻结，复调将以此版本为蓝本另起草稿
          </span>
        </div>
      )}

      {chain.length > 1 && (
        <div className="history-strip">
          <h4>版本链（{chain.length} 个版本，旧版只读保留）</h4>
          {chain.map((r) => (
            <button
              key={r.revisionId}
              className={`history-chip ${r.revisionId === record.revisionId ? "active" : ""}`}
              onClick={() => onSelectRevision(r.revisionId)}
            >
              <b>{revisionLabel(r)}</b>
              <em className={r.status === "signed" ? "chip-signed" : "chip-draft"}>
                {r.status === "signed" ? `已签发 ${formatDateTime(r.signedAt)}` : "草稿"}
              </em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function valueOrEmpty(v: number | null): string {
  return v === null ? "" : String(v);
}
