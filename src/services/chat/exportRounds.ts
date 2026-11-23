import { getVisibleMessages } from './branches.js'
import type { AssistantMessage, Message, Session, UserMessage } from './types.js'
import { formatFullTime, formatRoundTime } from '../../utils/format.js'

export type RoundSlice = {
  /** 从 1 开始 */
  index: number
  user: UserMessage
  assistant?: AssistantMessage
}

/** 按可见分支把消息切成一轮一轮（提问 + 紧随的回答）。 */
export const toRounds = (session: Session): RoundSlice[] => {
  const rounds: RoundSlice[] = []
  for (const message of getVisibleMessages(session)) {
    if (message.role === 'user') {
      rounds.push({ index: rounds.length + 1, user: message })
    } else if (rounds.length > 0) {
      rounds[rounds.length - 1].assistant = message
    }
  }
  return rounds
}

/** 解析「3-5」「7」这类范围；返回闭区间，越界会被夹到 1..total。 */
export const parseRoundRange = (
  text: string,
  total: number
): { start: number; end: number } | null => {
  const match = /^\s*(\d+)\s*(?:[-~到至]\s*(\d+))?\s*$/.exec(text)
  if (!match) {
    return null
  }
  const a = Number(match[1])
  const b = match[2] ? Number(match[2]) : a
  const start = Math.max(1, Math.min(a, b))
  const end = Math.min(total, Math.max(a, b))
  return start <= end ? { start, end } : null
}

const escapeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) || '会话'

const thinkingOf = (message: AssistantMessage): string =>
  message.blocks
    .filter((block) => block.type === 'thinking')
    .map((block) => (block as { thinking: string }).thinking)
    .join('\n\n')
    .trim()

const answerOf = (message: AssistantMessage): string =>
  message.blocks
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('\n\n')
    .trim()

/** 生成 Markdown：头部元信息 + 每轮提问、思考（折叠）、回答。 */
export const roundsToMarkdown = (
  session: Session,
  rounds: RoundSlice[],
  notes: { starred?: boolean; tags?: string[]; note?: string }
): string => {
  const exportedAt = new Date()
  const from = rounds[0].index
  const to = rounds[rounds.length - 1].index
  const header = [
    '---',
    `会话：${session.title || '未命名会话'}`,
    `轮次：${from === to ? `第 ${from} 轮` : `第 ${from}-${to} 轮`}`,
    `导出时间：${formatFullTime(exportedAt)}`,
    ...(notes.tags?.length ? [`标签：${notes.tags.join('、')}`] : []),
    ...(notes.note ? [`备注：${notes.note}`] : []),
    ...(notes.starred ? ['标记：已收藏'] : []),
    '---',
    '',
  ]

  const body: string[] = []
  for (const round of rounds) {
    const time = formatRoundTime(round.user.createdAt) ?? ''
    body.push(`## 第 ${round.index} 轮${time ? ` · ${time}` : ''}`, '')
    body.push('**我**：', '', round.user.content.trim() || '（无文字内容）', '')
    const thinking = round.assistant ? thinkingOf(round.assistant) : ''
    if (thinking) {
      body.push('<details>', '<summary>思考过程</summary>', '', thinking, '', '</details>', '')
    }
    const answer = round.assistant ? answerOf(round.assistant) : ''
    if (answer) {
      body.push('**DeepSeek**：', '', answer, '')
    } else if (round.assistant) {
      body.push('**DeepSeek**：', '', '（这一轮没有文本回答）', '')
    }
    const assistant = round.assistant
    if (assistant?.tags?.length || assistant?.note) {
      body.push(
        `> ${[assistant?.tags?.map((tag) => `#${tag}`).join(' '), assistant?.note]
          .filter(Boolean)
          .join(' · ')}`,
        ''
      )
    }
    body.push('---', '')
  }
  return [...header, ...body].join('\n')
}

/** 触发浏览器下载，返回文件名。 */
export const downloadMarkdown = (title: string, markdown: string, range: string): string => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const name = `${escapeFileName(title)}-第${range}轮-${stamp}.md`
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return name
}

export const messageOfRound = (round: RoundSlice): Message[] =>
  round.assistant ? [round.user, round.assistant] : [round.user]
