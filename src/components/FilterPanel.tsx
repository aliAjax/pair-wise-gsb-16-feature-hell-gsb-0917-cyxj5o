import { CATEGORIES } from "../types";
import type { Category, FilterState, StatusFilter } from "../types";

interface Props {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "signed", label: "已签发" },
];

export function FilterPanel({ filters, onChange }: Props) {
  const toggleCategory = (c: Category) => {
    const categories = filters.categories.includes(c)
      ? filters.categories.filter((x) => x !== c)
      : [...filters.categories, c];
    onChange({ ...filters, categories });
  };

  return (
    <aside className="panel narrow">
      <h2>状态</h2>
      <div className="chips">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            className={filters.status === o.value ? "chip-on" : ""}
            onClick={() => onChange({ ...filters, status: o.value })}
          >
            {o.label}
          </button>
        ))}
      </div>

      <h2>分类筛选</h2>
      <div className="chips muted">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={filters.categories.includes(c) ? "chip-on" : ""}
            onClick={() => toggleCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <h2>转诊</h2>
      <div className="chips">
        <button
          className={filters.needsReferral ? "chip-on" : ""}
          onClick={() => onChange({ ...filters, needsReferral: !filters.needsReferral })}
        >
          仅看气骨导差 &gt; 20dB
        </button>
      </div>

      <label className="search-label">
        <span>搜索</span>
        <input
          value={filters.query}
          placeholder="姓名 / 型号 / 听力师 / 备注"
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />
      </label>

      {(filters.status !== "all" ||
        filters.categories.length > 0 ||
        filters.needsReferral ||
        filters.query.trim() !== "") && (
        <button
          className="reset-filters"
          onClick={() =>
            onChange({ status: "all", categories: [], needsReferral: false, query: "" })
          }
        >
          清空筛选
        </button>
      )}
    </aside>
  );
}
