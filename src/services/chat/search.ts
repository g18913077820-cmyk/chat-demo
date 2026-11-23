import { getVisibleMessages } from './branches.js'
import * as db from './db.js'
import type { Message } from './types.js'

/** 一条搜索命中：标题命中时 messageId 为 null，否则定位到那条消息。 */
export type ChatSearchMatch = {
  sessionId: string
  title: string
  messageId: string | null
  /** 命中附近的文本片段，换行已替换为空格 */
  snippet: string
  /** 命中词在 snippet 中的区间，用于高亮 */
  start: number
  end: number
}

const BEFORE = 18
const AFTER = 56
const PER_SESSION = 3
const MAX_MATCHES = 60

/** 参与搜索的正文：用户提问原文，助手回答只取文本块，忽略思考与工具数据。 */
const messageText = (message: Message): string =>
  message.role === 'user'
    ? message.content
    : message.blocks
        .map((block) => (block.type === 'text' ? block.text : ''))
        .filter(Boolean)
        .join('\n')

/** 截取命中附近的一段；只把换行换成空格，保证下标与原文一一对应。 */
const snippetOf = (text: string, index: number, length: number) => {
  const from = Math.max(0, index - BEFORE)
  const to = Math.min(text.length, index + length + AFTER)
  const prefix = from > 0 ? '…' : ''
  const suffix = to < text.length ? '…' : ''
  const body = text.slice(from, to).replace(/\n/g, ' ')
  const start = prefix.length + (index - from)
  return { snippet: `${prefix}${body}${suffix}`, start, end: start + length }
}

/**
 * 按更新时间从新到旧扫描会话标题与消息正文，逐条产出命中，便于边搜边显示。
 * 每轮最多返回 MAX_MATCHES 条，signal 用于在输入变化时中断上一轮。
 */
export async function* searchChats(
  keyword: string,
  signal: AbortSignal
): AsyncGenerator<ChatSearchMatch> {
  const needle = keyword.trim().toLowerCase()
  if (!needle) {
    return
  }
  let matched = 0
  for (const summary of await db.loadSessionSummaries()) {
    if (signal.aborted || matched >= MAX_MATCHES) {
      return
    }
    const title = summary.title || ''
    const titleIndex = title.toLowerCase().indexOf(needle)
    if (titleIndex >= 0) {
      yield {
        sessionId: summary.id,
        title,
        messageId: null,
        snippet: title,
        start: titleIndex,
        end: titleIndex + needle.length,
      }
      matched += 1
    }
    const session = await db.loadSession(summary.id)
    if (!session || signal.aborted) {
      continue
    }
    let hits = 0
    for (const message of getVisibleMessages(session)) {
      if (matched >= MAX_MATCHES || hits >= PER_SESSION) {
        break
      }
      const text = messageText(message)
      const index = text ? text.toLowerCase().indexOf(needle) : -1
      if (index < 0) {
        continue
      }
      yield {
        sessionId: session.id,
        title,
        messageId: message.id,
        ...snippetOf(text, index, needle.length),
      }
      matched += 1
      hits += 1
    }
  }
}
