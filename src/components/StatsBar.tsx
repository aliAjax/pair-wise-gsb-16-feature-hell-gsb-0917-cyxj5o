import type { Stats } from "../filterStats";

export function StatsBar({ stats }: { stats: Stats }) {
  const fmt = (v: number | null, unit = "") => (v === null ? "—" : `${v}${unit}`);
  return (
    <section className="metrics-grid">
      <article className="metric-card">
        <span>筛选结果（已签发 / 草稿）</span>
        <strong>
          {stats.signedCount}
          <small> / {stats.draftCount}</small>
        </strong>
        <i className="status-ok" />
      </article>
      <article className="metric-card">
        <span>已签发平均 PTA（左 / 右）</span>
        <strong>
          {fmt(stats.avgPta.L)}
          <small> / {fmt(stats.avgPta.R)} dB</small>
        </strong>
        <i className="status-watch" />
      </article>
      <article className="metric-card">
        <span>已签发平均言语识别率（左 / 右）</span>
        <strong>
          {fmt(stats.avgSpeech.L, "%")}
          <small> / {fmt(stats.avgSpeech.R, "%")}</small>
        </strong>
        <i className="status-ok" />
      </article>
      <article className="metric-card">
        <span>待处理（校验阻断 / 待转诊）</span>
        <strong>
          {stats.blockedCount}
          <small> / {stats.referralPending}</small>
        </strong>
        <i className={stats.blockedCount + stats.referralPending > 0 ? "status-danger" : "status-ok"} />
      </article>
    </section>
  );
}
