import type { PreviewItem } from '../../components/markdown/htmlPreviewState.js'

/** 可以在弹层里直接渲染的语言 */
const PREVIEW_LANGS = new Set(['html', 'htm', 'svg'])

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/

/** 回答里是否可能出现可预览的代码块，用于跳过昂贵的全文扫描 */
export const mayContainPreview = (markdown: string) =>
  /(```|~~~)\s*(html|htm|svg)\s*$/im.test(markdown)

/** 扫描 Markdown 里的围栏代码块，取出 html/htm/svg 片段 */
export const collectPreviewBlocks = (markdown: string): PreviewItem[] => {
  if (!markdown || !mayContainPreview(markdown)) {
    return []
  }
  const items: PreviewItem[] = []
  const lines = markdown.split('\n')
  let fence: { char: string; size: number; lang: string; body: string[] } | null = null
  for (const line of lines) {
    const match = FENCE.exec(line)
    if (fence === null) {
      if (match) {
        fence = { char: match[1][0], size: match[1].length, lang: match[2].toLowerCase(), body: [] }
      }
      continue
    }
    // 结束围栏：同字符、长度不短于开始、且没有语言标记
    if (match && match[1][0] === fence.char && match[1].length >= fence.size && !match[2]) {
      if (PREVIEW_LANGS.has(fence.lang)) {
        const count = items.filter((item) => item.lang === fence?.lang).length + 1
        items.push({
          title: `${fence.lang.toUpperCase()} ${count}`,
          code: fence.body.join('\n'),
          lang: fence.lang,
        })
      }
      fence = null
      continue
    }
    fence.body.push(line)
  }
  return items
}
