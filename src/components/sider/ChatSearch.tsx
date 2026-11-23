import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { searchChats, type ChatSearchMatch } from '../../services/chat/search.js'
import { selectSession } from '../../services/chat/store.js'
import { useAnswerView } from '../../services/chat/answerView.js'
import { IconCloseOutline16, IconSearchOutline16 } from '../base/icons.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './Sider.module.css'

const DEBOUNCE = 200

/** 侧边栏搜索状态：输入防抖后扫描本地会话，边搜边显示前若干条命中。 */
export const useChatSearch = () => {
  const [value, setValue] = useState('')
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<ChatSearchMatch[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(value.trim()), DEBOUNCE)
    return () => clearTimeout(timer)
  }, [value])

  useEffect(() => {
    if (!keyword) {
      setResults([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    let live = true
    setSearching(true)
    void (async () => {
      const found: ChatSearchMatch[] = []
      for await (const match of searchChats(keyword, controller.signal)) {
        if (!live) {
          return
        }
        found.push(match)
        // 分批刷新，避免每个命中都触发一次列表重绘
        if (found.length % 3 === 0) {
          setResults([...found])
        }
      }
      if (live) {
        setResults(found)
        setSearching(false)
      }
    })()
    return () => {
      live = false
      controller.abort()
    }
  }, [keyword])

  const clear = () => {
    setValue('')
    setKeyword('')
  }

  return { value, setValue, keyword, results, searching, clear }
}

/** 会话打开后消息是异步渲染的，轮询等待目标消息出现再滚动过去。 */
const scrollToMessage = (messageId: string) => {
  let attempts = 0
  const tick = () => {
    const target = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`
    )
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    if (attempts++ < 25) {
      setTimeout(tick, 80)
    }
  }
  requestAnimationFrame(tick)
}

const openMatch = (search: ReturnType<typeof useChatSearch>, match: ChatSearchMatch) => {
  selectSession(match.sessionId)
  // 命中的回答默认是折叠的，跳转前先展开
  if (match.messageId) {
    useAnswerView.getState().expand(match.messageId)
  }
  closeMobileSider()
  search.clear()
  if (match.messageId) {
    scrollToMessage(match.messageId)
  }
}

/** 搜索输入框；回车打开第一条命中，Esc 清空。 */
export const ChatSearchBox = ({ search }: { search: ReturnType<typeof useChatSearch> }) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className={styles.searchBox}>
      <span className={styles.searchIcon}>
        <IconSearchOutline16 />
      </span>
      <input
        ref={inputRef}
        type="search"
        className={styles.searchInput}
        value={search.value}
        placeholder={t('searchChatsPlaceholder')}
        aria-label={t('searchChatsPlaceholder')}
        spellCheck={false}
        onChange={(event) => search.setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            search.clear()
            inputRef.current?.blur()
          } else if (event.key === 'Enter' && search.results.length > 0) {
            openMatch(search, search.results[0])
          }
        }}
      />
      {search.value ? (
        <button
          type="button"
          className={styles.searchClear}
          aria-label={t('close')}
          onClick={() => {
            search.clear()
            inputRef.current?.focus()
          }}
        >
          <IconCloseOutline16 />
        </button>
      ) : null}
    </div>
  )
}

/** 命中列表：标题 + 上下文片段，命中词高亮。 */
export const ChatSearchResults = ({ search }: { search: ReturnType<typeof useChatSearch> }) => {
  const t = useTranslate()
  if (search.results.length === 0) {
    return (
      <div className={styles.searchHint}>
        {search.searching ? t('searchChatsSearching') : t('searchChatsEmpty')}
      </div>
    )
  }
  return (
    <div className={styles.searchResults}>
      {search.results.map((match, index) => (
        <button
          type="button"
          key={`${match.sessionId}:${match.messageId ?? 'title'}:${index}`}
          className={styles.searchItem}
          onClick={() => openMatch(search, match)}
        >
          <span className={styles.searchItemTitle}>
            {match.messageId === null && match.title ? (
              <>
                {match.title.slice(0, match.start)}
                <mark className={styles.searchHighlight}>
                  {match.title.slice(match.start, match.end)}
                </mark>
                {match.title.slice(match.end)}
              </>
            ) : (
              match.title || t('untitledChat')
            )}
          </span>
          {match.messageId === null ? null : (
            <span className={styles.searchItemSnippet}>
              {match.snippet.slice(0, match.start)}
              <mark className={styles.searchHighlight}>
                {match.snippet.slice(match.start, match.end)}
              </mark>
              {match.snippet.slice(match.end)}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
