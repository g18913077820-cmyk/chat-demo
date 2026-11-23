import { useTranslate } from '../../i18n/index.js'
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import clsx from 'clsx'
import Prism from 'prismjs'
import {
  getHighlightLang,
  isHighlightLoaded,
  loadHighlight,
} from '../../services/markdown/highlight.js'
import { IconCheckOutline16, IconCopyOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { copyText } from '../../utils/clipboard.js'
import { MermaidDiagram } from './MermaidDiagram.js'
import styles from './CodeBlock.module.css'

/** 超过这个行数的代码块默认折叠。 */
const COLLAPSED_LINES = 10

type Limit = {
  /** 一行的高度（含字号与行高） */
  lineHeight: number
  /** 代码块上下内边距之和 */
  padding: number
  /** 渲染后的总行数（含自动换行产生的行） */
  total: number
}

/** 代码块标题栏：左侧语言名，右侧展开/复制 */
const CodeInfoRow = ({
  code,
  infostring,
  showDiagram,
  onToggleDiagram,
  limit,
}: {
  code: string
  infostring: string
  showDiagram: boolean
  onToggleDiagram?: () => void
  limit?: { expanded: boolean; hidden: number; onToggle: () => void }
}) => {
  const t = useTranslate()
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.container}>
      {onToggleDiagram ? (
        <div className="md-code-block-switch" aria-label={t('mermaidSwitchLabel')}>
          <button
            type="button"
            className={styles.button}
            aria-pressed={showDiagram}
            onClick={() => !showDiagram && onToggleDiagram()}
          >
            {t('mermaidDiagram')}
          </button>
          <button
            type="button"
            className={styles.button}
            aria-pressed={!showDiagram}
            onClick={() => showDiagram && onToggleDiagram()}
          >
            {t('mermaidCode')}
          </button>
        </div>
      ) : (
        <span className={styles.name}>{infostring}</span>
      )}
      <div className={styles.tools}>
        {limit ? (
          <button
            type="button"
            className={styles.button}
            aria-expanded={limit.expanded}
            onClick={limit.onToggle}
          >
            {limit.expanded
              ? t('codeCollapse')
              : limit.hidden > 0
                ? t('codeExpandCount', { count: limit.hidden })
                : t('codeExpand')}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.button}
          onClick={async () => {
            if (!(await copyText(code))) {
              showToast({ key: 'copyFailed' })
              return
            }
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
          <span>{t(copied ? 'copied' : 'copy')}</span>
        </button>
      </div>
    </div>
  )
}

/**
 * 代码块：语言包按需加载，不支持或尚未加载的语言按纯文本显示。
 * 超过 10 行的代码块默认折叠，点标题栏按钮展开/收起；流式输出期间保持展开，避免内容跳动。
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  infostring,
  loading = false,
}: {
  code: string
  infostring: string
  loading?: boolean
}) {
  const isMermaid = infostring.toLowerCase() === 'mermaid'
  const [showDiagram, setShowDiagram] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [limit, setLimit] = useState<Limit | null>(null)
  const preRef = useRef<HTMLPreElement>(null)
  // 语言包注册在全局 Prism 上，每次渲染直接判断；加载完成后触发一次重渲染
  const rerender = useReducer((n: number) => n + 1, 0)[1]
  const lang = getHighlightLang(infostring)
  const loaded = lang !== null && isHighlightLoaded(lang)
  useEffect(() => {
    if (lang === null || loaded) {
      return
    }
    let unmounted = false
    loadHighlight(lang).then(() => {
      if (!unmounted) {
        rerender()
      }
    })
    return () => {
      unmounted = true
    }
  }, [lang, loaded, rerender])
  const renderedHtml = useMemo(() => {
    const name = lang !== null && loaded ? lang : 'plaintext'
    return Prism.highlight(code, Prism.languages[name], name)
  }, [code, lang, loaded])

  // 用实际渲染高度换算行数：代码会按宽度自动换行，只看 \n 数不准。
  useLayoutEffect(() => {
    const pre = preRef.current
    if (!pre || (isMermaid && showDiagram)) {
      setLimit(null)
      return
    }
    const style = getComputedStyle(pre)
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    const total = Math.max(0, Math.round((pre.scrollHeight - padding) / lineHeight))
    setLimit({ lineHeight, padding, total })
  }, [renderedHtml, loading, isMermaid, showDiagram])

  const collapsible = !loading && limit !== null && limit.total > COLLAPSED_LINES
  const collapsed = collapsible && !expanded
  const hidden = limit ? Math.max(0, limit.total - COLLAPSED_LINES) : 0

  return (
    <div className="md-code-block">
      <div className="md-code-block-banner">
        <CodeInfoRow
          code={code}
          infostring={infostring}
          showDiagram={showDiagram}
          onToggleDiagram={isMermaid ? () => setShowDiagram((show) => !show) : undefined}
          limit={
            collapsible
              ? { expanded, hidden, onToggle: () => setExpanded((value) => !value) }
              : undefined
          }
        />
      </div>
      {isMermaid && showDiagram ? (
        <MermaidDiagram code={code} loading={loading} />
      ) : (
        <div className={styles.body}>
          <pre
            ref={preRef}
            className={clsx(collapsed && styles.clipped)}
            style={
              // max-height 只约束内容盒，内边距会额外加上，所以这里不加上下 padding。
              collapsed && limit ? { maxHeight: `${limit.lineHeight * COLLAPSED_LINES}px` } : undefined
            }
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          ></pre>
          {collapsed ? <div className={styles.fade} aria-hidden /> : null}
        </div>
      )}
    </div>
  )
})
