import { maxAbGap, patientChainName, pta, revisionLabel } from "../domain";
import type { FittingRecord } from "../types";

interface Props {
  chains: FittingRecord[][];
  selectedRevisionId: string | null;
  onSelect: (revisionId: string) => void;
  onCreate: () => void;
}

export function RecordList({ chains, selectedRevisionId, onSelect, onCreate }: Props) {
  return (
    <section className="panel records-panel">
      <div className="section-heading">
        <div>
          <p>验配档案</p>
          <h2>近期记录</h2>
        </div>
        <button className="primary-action" onClick={onCreate}>
          + 新增记录
        </button>
      </div>

      <div className="record-list">
        {chains.length === 0 && (
          <div className="empty-state">没有符合筛选条件的记录。点击「新增记录」开始验配。</div>
        )}
        {chains.map((chain) => {
          const name = patientChainName(chain);
          const latest = chain[0];
          const drafts = chain.filter((r) => r.status === "draft");
          const signed = chain.filter((r) => r.status === "signed");
          const gap = Math.max(...chain.map((r) => maxAbGap(r.data)));
          return (
            <article key={latest.chainId} className="record-chain">
              <div className="chain-summary">
                <div className="chain-title">
                  <h3>{name}</h3>
                  <span className="chain-meta">
                    {latest.data.category || "未分类"} · {latest.data.deviceModel || "未填型号"} ·{" "}
                    PTA 左 {pta(latest, "L") ?? "—"} / 右 {pta(latest, "R") ?? "—"} dB
                  </span>
                </div>
                <div className="chain-badges">
                  <span className="mini-badge">共 {chain.length} 版</span>
                  {signed.length > 0 && <span className="mini-badge signed">已签 {signed.length}</span>}
                  {drafts.length > 0 && <span className="mini-badge draft">草稿 {drafts.length}</span>}
                  {gap > 20 && <span className="mini-badge referral">气骨导差 {gap}dB</span>}
                </div>
              </div>
              <div className="version-row">
                {chain.map((r) => (
                  <button
                    key={r.revisionId}
                    className={`version-chip ${r.revisionId === selectedRevisionId ? "active" : ""}`}
                    onClick={() => onSelect(r.revisionId)}
                  >
                    <b>{revisionLabel(r)}</b>
                    <em className={r.status === "signed" ? "chip-signed" : "chip-draft"}>
                      {r.status === "signed" ? "已冻结" : "草稿"}
                    </em>
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
