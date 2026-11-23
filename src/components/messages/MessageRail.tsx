import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { IconStarFill16, IconTagOutline16 } from '../base/icons.js'
import { Menu } from '../base/Menu.js'
import styles from './MessageRail.module.css'

type Mark = {
  id: string
  /** 相对滚动内容顶部的偏移，用于点击跳转 */
  top: number
  /** 在整段内容中的比例，用于定位刻度 */
  ratio: number
}

/** 刻度条上的一轮：提问内容 + 该轮回答的收藏/标签标记。 */
export type RoundInfo = {
  id: string
  question: string
  starred?: boolean
  tags?: string[]
  note?: string
}

const preview = (round: RoundInfo): string => {
  const parts = [round.question]
  if (round.tags?.length) {
    parts.push(round.tags.join(' / '))
  }
  if (round.note) {
    parts.push(`备注：${round.note.length > 40 ? `${round.note.slice(0, 40)}…` : round.note}`)
  }
  return parts.join(' · ')
}

/** 刻度最多排到这里，给底部的「跳到最新」按钮留位置。 */
const MAX_RATIO = 0.96

/** 滚到会话最底部。 */
const scrollToEnd = (scroller: HTMLDivElement) => {
  scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
}

/** 点击滚到该轮提问；顶部留一点余量，避免贴着边缘。 */
const jumpTo = (scroller: HTMLDivElement, mark: Mark) => {
  scroller.scrollTo({ top: Math.max(0, mark.top - 12), behavior: 'smooth' })
}

/**
 * 右侧每轮对话的刻度条：按内容位置等比分布，当前阅读位置高亮。
 * 只在桌面端渲染，点击刻度跳到对应的一轮提问。
 */
export const MessageRail = ({
  scrollRef,
  contentRef,
  rounds,
  mobile = false,
  filtered = false,
  filterControls,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  rounds: RoundInfo[]
  mobile?: boolean
  /** 筛选状态：只剩一轮时也要显示刻度 */
  filtered?: boolean
  /** 移动端：刻度面板展开时显示的筛选控件 */
  filterControls?: {
    onlyStarred: boolean
    tagFilter: string
    tags: string[]
    onToggleStar: () => void
    onSelectTag: (tag: string) => void
  }
}) => {
  const t = useTranslate()
  const railRef = useRef<HTMLDivElement>(null)
  const [railHeight, setRailHeight] = useState(0)
  const [marks, setMarks] = useState<Mark[]>([])
  const [active, setActive] = useState(0)
  /** 移动端竖屏：刻度默认收进悬浮按钮，点开才展开 */
  const [opened, setOpened] = useState(false)
  const roundsRef = useRef(rounds)
  roundsRef.current = rounds
  const ids = rounds.map((round) => round.id).join('|')

  // 刻度尺高度用于把比例换算成像素，判断左侧文字是否挨得太近
  useLayoutEffect(() => {
    const element = railRef.current
    if (!element) {
      return
    }
    const update = () => setRailHeight(element.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mobile, ids])

  /** 左侧提纲：显示有标签或备注的轮次，相邻太近时缩小字号，挤不下就省略。 */
  const labels = useMemo(() => {
    if (!railHeight) {
      return []
    }
    const items = rounds
      .map((round, index) => ({ round, index, ratio: marks[index]?.ratio ?? 0 }))
      .filter((item) => item.round.note || item.round.tags?.length)
      .sort((a, b) => a.ratio - b.ratio)
    const list: { key: string; text: string; top: number; compact: boolean }[] = []
    let lastTop = Number.NEGATIVE_INFINITY
    for (const item of items) {
      const top = Math.min(item.ratio, MAX_RATIO) * railHeight
      const gap = top - lastTop
      // 挤不下就省略，稍微靠近就换小字号，避免文字上下粘连
      if (gap < 12) {
        continue
      }
      list.push({
        key: `${item.round.id}-label`,
        text: [item.round.tags?.join(' · '), item.round.note].filter(Boolean).join(' · '),
        top,
        compact: gap < 24,
      })
      lastTop = top
    }
    return list
  }, [rounds, marks, railHeight])

  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) {
      return
    }
    let current: Mark[] = []
    let frame = 0

    const computeActive = () => {
      const edge = scroller.scrollTop + scroller.clientHeight * 0.35
      let index = 0
      for (const [position, mark] of current.entries()) {
        if (mark.top <= edge) {
          index = position
        }
      }
      return index
    }

    const measure = () => {
      const total = scroller.scrollHeight || 1
      // 内容坐标 = 视口坐标差 + 当前滚动量
      const base = scroller.getBoundingClientRect().top - scroller.scrollTop
      current = roundsRef.current.map((round) => {
        const element = content.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(round.id)}"]`
        )
        const top = element ? element.getBoundingClientRect().top - base : 0
        return { id: round.id, top, ratio: Math.min(1, Math.max(0, top / total)) }
      })
      setMarks(current)
      setActive(computeActive())
    }

    const onScroll = () => {
      if (frame) {
        return
      }
      frame = requestAnimationFrame(() => {
        frame = 0
        setActive(computeActive())
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(scroller)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      if (frame) {
        cancelAnimationFrame(frame)
      }
    }
  }, [ids, scrollRef, contentRef])

  if (rounds.length < (filtered ? 1 : 2)) {
    return null
  }

  const scrollToRound = (index: number) => {
    const scroller = scrollRef.current
    const mark = marks[index]
    if (scroller && mark) {
      jumpTo(scroller, mark)
    }
  }

  const jump = (index: number) => {
    scrollToRound(index)
    setOpened(false)
  }

  if (mobile) {
    return (
      <>
        <button
          type="button"
          className={clsx(styles.fab, opened && styles.fabActive)}
          aria-expanded={opened}
          aria-label={t('roundsButton')}
          onClick={() => setOpened((value) => !value)}
        >
          <span className={styles.fabIcon} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.fabCount}>{rounds.length}</span>
        </button>
        {opened && filterControls ? (
          <div className={styles.mobileTools}>
            <button
              type="button"
              className={clsx(
                styles.mobileTool,
                filterControls.onlyStarred && styles.mobileToolActive
              )}
              aria-pressed={filterControls.onlyStarred}
              aria-label={t('roundFavoritesOnly')}
              onClick={filterControls.onToggleStar}
            >
              <IconStarFill16 />
              {t('favorite')}
            </button>
            {filterControls.tags.length > 0 ? (
              <Menu
                options={[
                  {
                    key: '__all',
                    label: t('allTags'),
                    icon: null,
                    onSelect: () => filterControls.onSelectTag(''),
                  },
                  ...filterControls.tags.map((tag) => ({
                    key: tag,
                    label: tag,
                    icon: null,
                    onSelect: () => filterControls.onSelectTag(tag),
                  })),
                ]}
              >
                {({ toggle }) => (
                  <button
                    type="button"
                    className={clsx(
                      styles.mobileTool,
                      filterControls.tagFilter && styles.mobileToolActive
                    )}
                    onClick={toggle}
                  >
                    <IconTagOutline16 />
                    {filterControls.tagFilter || t('editTags')}
                  </button>
                )}
              </Menu>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className={clsx(styles.navButton, styles.navUp)}
          aria-label={t('previousRound')}
          disabled={active <= 0}
          onClick={() => scrollToRound(active - 1)}
        >
          <span className={styles.navChevron} />
        </button>
        <button
          type="button"
          className={clsx(styles.navButton, styles.navDown)}
          aria-label={t('nextRound')}
          disabled={active >= rounds.length - 1}
          onClick={() => scrollToRound(active + 1)}
        >
          <span className={clsx(styles.navChevron, styles.navChevronDown)} />
        </button>
        <button
          type="button"
          className={clsx(styles.backdrop, opened && styles.backdropOpen)}
          tabIndex={opened ? 0 : -1}
          aria-hidden={!opened}
          aria-label={t('close')}
          onClick={() => setOpened(false)}
        />
        <div
          ref={railRef}
          className={clsx(styles.mobileRail, opened && styles.mobileRailOpen)}
        >
          {labels.map((label) => (
            <span
              key={label.key}
              className={clsx(styles.railLabel, label.compact && styles.railLabelCompact)}
              style={{ top: `${label.top}px` }}
            >
              {label.text}
            </span>
          ))}
          {rounds.map((round, index) => (
            <button
              key={round.id}
              type="button"
              className={clsx(styles.mobileTick, index === active && styles.mobileTickActive)}
              style={{
                // 两端各留 6px，避免刻度压在圆角上被裁掉
                top: `calc(${Math.min(marks[index]?.ratio ?? 0, MAX_RATIO) * 100}% + ${
                  6 * (1 - 2 * Math.min(marks[index]?.ratio ?? 0, MAX_RATIO))
                }px)`,
              }}
              onClick={() => jump(index)}
            >
              {round.starred ? (
                <span className={styles.mobileStar}>
                  <IconStarFill16 />
                </span>
              ) : index % 3 === 2 ? (
                <span className={styles.mobileNumber}>{index + 1}</span>
              ) : null}
              <span className={styles.mobileBar} />
              {round.tags?.length ? <span className={styles.mobileTag} /> : null}
              {round.note ? <span className={styles.mobileNote} /> : null}
            </button>
          ))}
          <button
            type="button"
            className={clsx(styles.railBottom, styles.mobileBottom)}
            aria-label={t('scrollToEnd')}
            title={t('scrollToEnd')}
            onClick={() => {
              const scroller = scrollRef.current
              if (scroller) {
                scrollToEnd(scroller)
              }
            }}
          >
            <span className={styles.bottomChevron} />
          </button>
        </div>
      </>
    )
  }

  return (
    <div className={styles.rail} aria-hidden={false} ref={railRef}>
      {labels.map((label) => (
        <span
          key={label.key}
          className={clsx(styles.railLabel, label.compact && styles.railLabelCompact)}
          style={{ top: `${label.top}px` }}
        >
          {label.text}
        </span>
      ))}
      {rounds.map((round, index) => {
        const mark = marks[index]
        return (
          <button
            key={round.id}
            type="button"
            className={clsx(styles.tick, index === active && styles.tickActive)}
            style={{ top: `${Math.min(mark?.ratio ?? 0, MAX_RATIO) * 100}%` }}
            title={preview(round)}
            aria-label={preview(round)}
            onClick={() => {
              const scroller = scrollRef.current
              if (scroller && mark) {
                jumpTo(scroller, mark)
              }
            }}
          >
            {round.starred ? (
              <span className={styles.tickStar}>
                <IconStarFill16 />
              </span>
            ) : index % 3 === 2 ? (
              <span className={styles.tickNumber}>{index + 1}</span>
            ) : null}
            <span className={styles.bar} />
            {round.tags?.length ? <span className={styles.tickTag} /> : null}
            {round.note ? <span className={styles.tickNote} /> : null}
          </button>
        )
      })}
      <button
        type="button"
        className={styles.railBottom}
        aria-label={t('scrollToEnd')}
        title={t('scrollToEnd')}
        onClick={() => {
          const scroller = scrollRef.current
          if (scroller) {
            scrollToEnd(scroller)
          }
        }}
      >
        <span className={styles.bottomChevron} />
      </button>
    </div>
  )
}
