import { useSyncExternalStore } from "react";
import { getStore, subscribe, getUI, subscribeUI } from "./storage";

/** 所有组件通过此快照订阅记录仓库，命令执行后自动重渲染 */
export function useFittingStore() {
  return useSyncExternalStore(subscribe, getStore, getStore);
}

/** 筛选条件与当前选中版本，同样落盘、跨标签同步 */
export function useUI() {
  return useSyncExternalStore(subscribeUI, getUI, getUI);
}
