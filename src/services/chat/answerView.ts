import { create } from 'zustand'

type AnswerViewState = {
  /** null 表示默认策略：最后一轮展开、其余折叠 */
  mode: boolean | null
  /** 逐条手动覆盖，key 为回答消息 id */
  overrides: Record<string, boolean>
  toggle: (id: string, next: boolean) => void
  expand: (id: string) => void
  setMode: (mode: boolean | null) => void
  reset: () => void
}

/** 回答折叠状态：默认折叠历史回答，保留最后一轮与流式输出可见。 */
export const useAnswerView = create<AnswerViewState>((set) => ({
  mode: null,
  overrides: {},
  toggle: (id, next) =>
    set((state) => ({ overrides: { ...state.overrides, [id]: next } })),
  expand: (id) => set((state) => ({ overrides: { ...state.overrides, [id]: true } })),
  setMode: (mode) => set({ mode, overrides: {} }),
  reset: () => set({ mode: null, overrides: {} }),
}))
