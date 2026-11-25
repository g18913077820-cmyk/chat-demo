import { create } from 'zustand'

export type PreviewItem = {
  title: string
  code: string
  lang: string
}

type HtmlPreviewState = {
  items: PreviewItem[]
  index: number
  open: (items: PreviewItem[], index?: number) => void
  select: (index: number) => void
  close: () => void
}

/** 全局 HTML 预览：代码块和提问行共用同一个弹层 */
export const useHtmlPreview = create<HtmlPreviewState>((set) => ({
  items: [],
  index: 0,
  open: (items, index = 0) => {
    if (items.length > 0) {
      set({ items, index: Math.min(Math.max(index, 0), items.length - 1) })
    }
  },
  select: (index) => set({ index }),
  close: () => set({ items: [], index: 0 }),
}))
