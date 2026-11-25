import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { useHtmlPreview, type PreviewItem } from './htmlPreviewState.js'
import styles from './HtmlPreviewSheet.module.css'

/** 隔离渲染：沙箱 iframe + CSP 禁止外部请求，只允许内联样式与脚本 */
const CSP =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; font-src data:"

const toDocument = (item: PreviewItem) => {
  const isSvg = item.lang === 'svg' && !/<html[\s>]/i.test(item.code)
  const body = isSvg
    ? `<body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff">${item.code}</body>`
    : item.code
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html,body{margin:0}</style></head>${body}</html>`
}

const CLOSE_DISTANCE = 110

export const HtmlPreviewSheet = () => {
  const t = useTranslate()
  const { items, index, select, close } = useHtmlPreview()
  const [offset, setOffset] = useState(0)
  const drag = useRef<{ startY: number; pointerId: number } | null>(null)
  const open = items.length > 0
  const item = items[index]
  const srcDoc = useMemo(() => (item ? toDocument(item) : ''), [item])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  useEffect(() => {
    setOffset(0)
  }, [items])

  if (!open || !item) {
    return null
  }

  const endDrag = () => {
    if (!drag.current) {
      return
    }
    drag.current = null
    if (offset > CLOSE_DISTANCE) {
      close()
      return
    }
    setOffset(0)
  }

  return (
    <div className={styles.backdrop} onClick={close}>
      <div
        className={styles.sheet}
        style={{ transform: offset ? `translateY(${offset}px)` : undefined }}
        role="dialog"
        aria-label={t('preview')}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={styles.handle}
          onPointerDown={(event) => {
            drag.current = { startY: event.clientY, pointerId: event.pointerId }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!drag.current) {
              return
            }
            setOffset(Math.max(0, event.clientY - drag.current.startY))
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className={styles.bar} />
          <span className={styles.title}>{item.title}</span>
          <button type="button" className={styles.close} aria-label={t('close')} onClick={close}>
            <IconCloseOutline16 />
          </button>
        </div>
        {items.length > 1 ? (
          <div className={styles.tabs}>
            {items.map((entry, position) => (
              <button
                key={`${entry.title}-${position}`}
                type="button"
                className={position === index ? styles.tabActive : styles.tab}
                onClick={() => select(position)}
              >
                {entry.title}
              </button>
            ))}
          </div>
        ) : null}
        <iframe
          className={styles.frame}
          title={item.title}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          srcDoc={srcDoc}
        />
      </div>
    </div>
  )
}
