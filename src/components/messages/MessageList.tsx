import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import {
  buildMessageVersions,
  getVisibleMessages,
  type MessageVersions,
} from '../../services/chat/branches.js'
import { selectMessageVersion } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { closeSearchPanel } from '../search/searchPanelState.js'
import { AssistantMessage } from './AssistantMessage.js'
import { MessageRail, type RoundInfo } from './MessageRail.js'
import { useAnswerView } from '../../services/chat/answerView.js'
import { collectPreviewBlocks } from '../../services/chat/previewBlocks.js'
import type { PreviewItem } from '../markdown/htmlPreviewState.js'
import { IconStarFill16, IconTagOutline16 } from '../base/icons.js'
import { Menu } from '../base/Menu.js'
import { useTranslate } from '../../i18n/index.js'
import { ScrollToBottomContext } from './scrollContext.js'
import { UserMessage } from './UserMessage.js'
import type { Message } from '../../services/chat/types.js'

/**
 * 会话共用可重试的附件上传失败入口，覆盖当前提问与历史消息中的附件。
 * 点击后按失败的回答重新补传附件并请求。
 */
const getUploadRetryId = (messages: Message[], streaming: boolean) => {
  const last = messages.at(-1)
  return !streaming &&
    last?.role === 'assistant' &&
    last.status === 'error' &&
    last.error?.kind === 'upload' &&
    last.error.retryable
    ? last.id
    : null
}
import styles from './MessageList.module.css'

/** 距底部小于该值时视为在底部，流式内容增长时跟随 */
const STICKY_THRESHOLD = 40
const EMPTY_VERSIONS: MessageVersions = { ids: [], index: -1 }

export const MessageList = ({
  session,
  streaming,
  footer,
}: {
  session: Session
  streaming: boolean
  footer: React.ReactNode
}) => {
  const isMobile = useIsMobile()
  const t = useTranslate()
  /** 单一会话内的轮次筛选：只看收藏 / 按标签 */
  const [onlyStarred, setOnlyStarred] = useState(false)
  const [tagFilter, setTagFilter] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef(true)
  const scrollTopRef = useRef(0)
  const restoreScrollRef = useRef<{ messageId: string; top: number } | null>(null)
  const messages = getVisibleMessages(session)
  // 每条消息所属的轮次与该轮提问时间，用于回答底部展示
  const roundMeta = useMemo(() => {
    let round = 0
    let askedAt = 0
    return messages.map((message) => {
      if (message.role === 'user') {
        round += 1
        askedAt = message.createdAt
      }
      return { round, askedAt }
    })
  }, [messages])
  // 提问行上的预览入口：只在该轮回答里确实有 html/htm/svg 时才出现
  const lastMessageIndex = messages.length - 1
  const previewsByUser = useMemo(() => {
    const map = new Map<string, PreviewItem[]>()
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index]
      if (message.role !== 'user') {
        continue
      }
      const reply = messages[index + 1]
      if (reply?.role !== 'assistant' || (streaming && index + 1 === lastMessageIndex)) {
        continue
      }
      const text = reply.blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n')
      const items = collectPreviewBlocks(text)
      if (items.length > 0) {
        map.set(message.id, items)
      }
    }
    return map
  }, [messages, streaming, lastMessageIndex])

  // 每一轮 = 一条提问 + 它后面的回答；收藏/标签取自回答，用于刻度条标记
  const rounds = useMemo<RoundInfo[]>(
    () =>
      messages.flatMap((message, index) => {
        if (message.role !== 'user') {
          return []
        }
        const reply = messages.slice(index + 1).find((item) => item.role === 'assistant')
        const text = message.content.replace(/\s+/g, ' ').trim()
        const question =
          text.length > 80
            ? `${text.slice(0, 80)}…`
            : text || message.files.map((file) => file.name).join('、')
        return [
          {
            id: message.id,
            question,
            starred: reply?.role === 'assistant' ? reply.starred : undefined,
            tags: reply?.role === 'assistant' ? reply.tags : undefined,
            note: reply?.role === 'assistant' ? reply.note : undefined,
            viewed: reply?.role === 'assistant' ? reply.viewed : undefined,
            preview: previewsByUser.has(message.id),
          },
        ]
      }),
    [messages, previewsByUser]
  )
  const [previousVersions, setPreviousVersions] = useState(() =>
    buildMessageVersions(session, new Map())
  )
  const versions = useMemo(
    () => buildMessageVersions(session, previousVersions),
    [session, previousVersions]
  )
  if (versions !== previousVersions) {
    setPreviousVersions(versions)
  }
  const lastMessageId = messages.at(-1)?.id
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el && stickyRef.current) {
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
    }
  }, [])

  // 内容、键盘和输入框高度变化时，继续遵循当前跟随状态。
  useLayoutEffect(() => {
    const content = contentRef.current
    const scroll = scrollRef.current
    if (!content || !scroll) {
      return
    }
    const observer = new ResizeObserver(scrollToBottom)
    observer.observe(content)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [isMobile, scrollToBottom])

  // 切换版本后将选择器留在原位置，避免回答长短变化导致操作区跳出视口。
  useLayoutEffect(() => {
    const anchor = restoreScrollRef.current
    const scroll = scrollRef.current
    if (anchor && scroll) {
      const switcher = scroll.querySelector<HTMLElement>(
        `[data-message-version="${CSS.escape(anchor.messageId)}"]`
      )
      if (switcher) {
        scroll.scrollTop += switcher.getBoundingClientRect().top - anchor.top
      }
      restoreScrollRef.current = null
      return
    }
    stickyRef.current = true
    scrollToBottom()
  }, [session.id, lastMessageId, scrollToBottom])

  useEffect(closeSearchPanel, [session.id, lastMessageId])

  // 切换会话时回到默认折叠策略
  useEffect(() => {
    useAnswerView.getState().reset()
  }, [session.id])

  const selectVersion = useCallback(
    (messageId: string, anchorTop: number) => {
      if (streaming) {
        return
      }
      restoreScrollRef.current = { messageId, top: anchorTop }
      stickyRef.current = false
      closeSearchPanel()
      selectMessageVersion(session.id, messageId)
    },
    [session.id, streaming]
  )

  // 跨移动端断点时切换滚动层，并保持输入框及当前阅读位置。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    if (stickyRef.current) {
      scrollToBottom()
    } else {
      el.scrollTop = scrollTopRef.current
    }
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD
      // 仅在用户向上滚动时停止跟随底部，布局或内容增高时保持跟随状态。
      if (nearBottom) {
        stickyRef.current = true
      } else if (el.scrollTop < scrollTopRef.current) {
        stickyRef.current = false
      }
      scrollTopRef.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile, scrollToBottom])

  const lastIndex = messages.length - 1
  const uploadRetryId = getUploadRetryId(messages, streaming)
  const filtered = onlyStarred || tagFilter !== ''
  const conversationTags = useMemo(() => {
    const tags = new Set<string>()
    for (const round of rounds) {
      round.tags?.forEach((tag) => tags.add(tag))
    }
    return [...tags].sort((a, b) => a.localeCompare(b))
  }, [rounds])
  const visibleRounds = useMemo(
    () =>
      rounds.filter(
        (round) =>
          (!onlyStarred || round.starred) && (!tagFilter || round.tags?.includes(tagFilter))
      ),
    [rounds, onlyStarred, tagFilter]
  )

  return (
    <ScrollToBottomContext.Provider value={scrollToBottom}>
      <div className={styles.wrap}>
        <div ref={isMobile ? undefined : scrollRef} className={styles.container}>
          <div ref={isMobile ? scrollRef : undefined} className={styles.scroll}>
            <div ref={contentRef} className={styles.column}>
              {messages.map((message, index) =>
                message.role === 'user' ? (
                  <UserMessage
                    key={message.id}
                    sessionId={session.id}
                    message={message}
                    round={roundMeta[index]?.round}
                    askedAt={roundMeta[index]?.askedAt}
                    answerPreviews={previewsByUser.get(message.id)}
                    retryUploadId={uploadRetryId}
                    isFirst={index === 0}
                    isLast={index === lastIndex || index === lastIndex - 1}
                    busy={streaming}
                    versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                    onSelectVersion={selectVersion}
                  />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    sessionId={session.id}
                    message={message}
                    isLast={index === lastIndex}
                    streaming={streaming && index === lastIndex}
                    busy={streaming}
                    versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                    onSelectVersion={selectVersion}
                  />
                )
              )}
            </div>
          </div>
          {footer}
        </div>
        <MessageRail
          scrollRef={scrollRef}
          contentRef={contentRef}
          rounds={visibleRounds}
          mobile={isMobile}
          filtered={filtered}
          filterControls={
            isMobile
              ? {
                  onlyStarred,
                  tagFilter,
                  tags: conversationTags,
                  onToggleStar: () => setOnlyStarred((value) => !value),
                  onSelectTag: setTagFilter,
                }
              : undefined
          }
        />
        {isMobile ? null : (
          <div className={styles.railTools}>
            <button
              type="button"
              className={clsx(styles.railTool, onlyStarred && styles.railToolActive)}
              aria-label={t('roundFavoritesOnly')}
              aria-pressed={onlyStarred}
              title={t('roundFavoritesOnly')}
              onClick={() => setOnlyStarred((value) => !value)}
            >
              <IconStarFill16 />
            </button>
            {conversationTags.length > 0 ? (
              <Menu
                options={[
                  {
                    key: '__all',
                    label: t('allTags'),
                    icon: null,
                    onSelect: () => setTagFilter(''),
                  },
                  ...conversationTags.map((tag) => ({
                    key: tag,
                    label: tag,
                    icon: null,
                    onSelect: () => setTagFilter(tag),
                  })),
                ]}
              >
                {({ toggle }) => (
                  <button
                    type="button"
                    className={clsx(styles.railTool, tagFilter && styles.railToolActive)}
                    aria-label={
                      tagFilter ? `${t('roundFilterByTag')}: ${tagFilter}` : t('roundFilterByTag')
                    }
                    title={tagFilter ? `${t('roundFilterByTag')}: ${tagFilter}` : t('roundFilterByTag')}
                    onClick={toggle}
                  >
                    <IconTagOutline16 />
                  </button>
                )}
              </Menu>
            ) : null}
          </div>
        )}
      </div>
    </ScrollToBottomContext.Provider>
  )
}
