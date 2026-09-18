import { useEffect, useMemo } from "react";
import "./styles.css";
import { FilterPanel } from "./components/FilterPanel";
import { RecordEditor } from "./components/RecordEditor";
import { RecordList } from "./components/RecordList";
import { StatsBar } from "./components/StatsBar";
import { validateForSign } from "./domain";
import { computeStats, matchRecord } from "./filterStats";
import { createDraft, saveUI } from "./storage";
import type { FilterState } from "./types";
import { useFittingStore, useUI } from "./useStore";

const project = {
  id: "hxwl-01",
  port: 5101,
  title: "听力验配记录",
  subtitle:
    "门店听力师的验配档案与听力曲线工作台：录入 → 规则校验 → 签发冻结 → 复调修订，全流程本地落盘。",
  stack: "React + Vite + TypeScript + localStorage",
};

function App() {
  const store = useFittingStore();
  const ui = useUI();
  const filters = ui.filters;

  const filteredRecords = useMemo(
    () => store.records.filter((r) => matchRecord(r, filters)),
    [store.records, filters],
  );

  const filteredChains = useMemo(() => {
    const map = new Map<string, typeof filteredRecords>();
    for (const r of filteredRecords) {
      if (!map.has(r.chainId)) map.set(r.chainId, []);
      map.get(r.chainId)!.push(r);
    }
    return Array.from(map.values())
      .map((chain) =>
        chain.slice().sort((a, b) => b.revision - a.revision || b.updatedAt - a.updatedAt),
      )
      .sort((a, b) => b[0].updatedAt - a[0].updatedAt);
  }, [filteredRecords]);

  const stats = useMemo(
    () => computeStats(filteredRecords, (r) => validateForSign(r.data).length === 0),
    [filteredRecords],
  );

  const selected = store.records.find((r) => r.revisionId === ui.selectedRevisionId) ?? null;
  const selectedChain = selected
    ? store.records
        .filter((r) => r.chainId === selected.chainId)
        .sort((a, b) => b.revision - a.revision || b.updatedAt - a.updatedAt)
    : [];

  // 当前选中版本失效（被删除 / 跨标签合并）时自动回落到首条筛选结果
  useEffect(() => {
    if (selected) return;
    const fallback = filteredChains[0]?.[0]?.revisionId ?? null;
    if (fallback !== ui.selectedRevisionId) {
      saveUI({ ...ui, selectedRevisionId: fallback });
    }
  }, [selected, filteredChains, ui]);

  function updateFilters(next: FilterState) {
    saveUI({ ...ui, filters: next });
  }

  function selectRevision(revisionId: string) {
    saveUI({ ...ui, selectedRevisionId: revisionId });
  }

  function handleCreate() {
    const draft = createDraft();
    saveUI({ ...ui, selectedRevisionId: draft.revisionId });
  }

  function handleDeleted() {
    const remainingChains = filteredChains.filter(
      (c) => !c.every((r) => r.revisionId === ui.selectedRevisionId),
    );
    const fallback = remainingChains[0]?.[0]?.revisionId ?? null;
    saveUI({ ...ui, selectedRevisionId: fallback });
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈 / 持久化</span>
          <strong>{project.stack}</strong>
          <span className="hero-note">刷新不丢数据 · 多标签冲突时已签发历史优先</span>
        </div>
      </section>

      <StatsBar stats={stats} />

      <section className="workspace">
        <FilterPanel filters={filters} onChange={updateFilters} />
        <div className="main-column">
          {selected ? (
            <RecordEditor
              key={selected.revisionId}
              record={selected}
              chain={selectedChain}
              onSelectRevision={selectRevision}
              onRecordDeleted={handleDeleted}
            />
          ) : (
            <section className="panel editor empty-editor">
              <h2>暂无记录</h2>
              <p>新增一份验配记录，或调整左侧筛选条件。</p>
              <button className="primary-action" onClick={handleCreate}>
                + 新增记录
              </button>
            </section>
          )}
          <RecordList
            chains={filteredChains}
            selectedRevisionId={ui.selectedRevisionId}
            onSelect={selectRevision}
            onCreate={handleCreate}
          />
        </div>
      </section>
    </main>
  );
}

export default App;
