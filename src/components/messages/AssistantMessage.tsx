import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useState } from 'react'
import {
  IconAnswerOutline16,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconNoteOutline16,
  IconRefreshOutline16,
  IconStarFill16,
  IconStarOutline16,
  IconTagOutline16,
  IconWarningOutline16,
} from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { formatFullTime, formatRoundTime } from '../../utils/format.js'
import { canContinueReply } from '../../services/chat/reply.js'
import {
  continueReply,
  regenerateReply,
  setMessageNote,
  setMessageTags,
  toggleMessageStar,
} from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { TagDialog } from './TagDialog.js'
import { NoteDialog } from './NoteDialog.js'
import { ExportRangeDialog } from './ExportRangeDialog.js'
import { downloadMarkdown, roundsToMarkdown, toRounds } from '../../services/chat/exportRounds.js'
import { markMessageViewed, useChatStore } from '../../services/chat/store.js'
import { useAnswerView } from '../../services/chat/answerView.js'
import { showToast } from '../base/toastState.js'
import { Menu } from '../base/Menu.js'
import { IconEllipsisOutline16 } from '../base/icons.js'
import { ReplyArea } from './ReplyArea.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const [tagOpen, setTagOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false)
  const override = useAnswerView((state) => state.overrides[message.id])
  const mode = useAnswerView((state) => state.mode)
  // 流式输出强制展开；否则按手动覆盖 → 全局模式 → 默认（最后一轮展开）
  const expanded = streaming || override === true || (override !== false && (mode ?? isLast))
  const answerSeconds = message.endedAt
    ? Math.max(1, Math.round((message.endedAt - message.createdAt) / 1000))
    : null
  const session = useChatStore((state) => state.sessionCache[sessionId])
  const rounds = session ? toRounds(session) : []
  const currentRound = rounds.find((item) => item.assistant?.id === message.id)?.index ?? 0
  const exportRange = (start: number, end: number) => {
    if (!session) {
      return
    }
    const slice = rounds.filter((item) => item.index >= start && item.index <= end)
    if (slice.length === 0) {
      return
    }
    const markdown = roundsToMarkdown(session, slice, {
      starred: message.starred,
      tags: message.tags,
      note: message.note,
    })
    downloadMarkdown(session.title, markdown, start === end ? `${start}` : `${start}-${end}`)
    showToast({ key: 'exported' })
  }
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`
  return (
    <div className={styles.message} data-message-id={message.id}>
      {refused ? null : (
        <ReplyArea
          message={message}
          view={view}
          streaming={streaming}
          hasResponse={!!responseText}
          onExpand={() => markMessageViewed(sessionId, message.id)}
        />
      )}
      {answer ? (
        <>
          <div
            className={styles.answerTitle}
            onClick={() => {
              if (!expanded) {
                markMessageViewed(sessionId, message.id)
              }
              useAnswerView.getState().toggle(message.id, !expanded)
            }}
          >
            <span className={styles.answerIcon}>
              <IconAnswerOutline16 />
            </span>
            <span className={clsx(styles.answerText, streaming && styles.shimmer)}>
              {streaming
                ? t('answering')
                : `${answerSeconds ? t('answeredIn', { count: answerSeconds }) : t('answered')} · ${t('charCount', { count: answer.markdown.length })}`}
            </span>
            {expanded ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
          </div>
          {expanded ? (
            <Markdown
              className="ds-assistant-message-main-content"
              content={answer.markdown}
              loading={streaming}
              cacheKey={message.id}
              disableLink={false}
              sources={view.sources}
            />
          ) : null}
        </>
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('data')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <a
                  className={styles.noticeAction}
                  href={TOP_UP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('topUp')}
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {expanded ? (
              <>
                {copyText ? <CopyButton text={copyText} /> : null}
                {responseText && !refused ? (
                  <ReadAloudButton messageId={message.id} text={responseText} />
                ) : null}
                <IconButton
                  icon={<IconRefreshOutline16 />}
                  tooltip={t('regenerate')}
                  tooltipPlacement="bottom"
                  disabled={busy || refused}
                  onClick={() => {
                    stopReadAloud()
                    regenerateReply(sessionId, message.id)
                  }}
                />
              </>
            ) : null}
            <IconButton
              icon={message.starred ? <IconStarFill16 /> : <IconStarOutline16 />}
              tooltip={t(message.starred ? 'unfavorite' : 'favorite')}
              tooltipPlacement="bottom"
              className={clsx(message.starred && styles.starredIcon)}
              disabled={busy}
              onClick={() => toggleMessageStar(sessionId, message.id)}
            />
            <IconButton
              icon={<IconTagOutline16 />}
              tooltip={t('editTags')}
              tooltipPlacement="bottom"
              className={clsx((message.tags?.length ?? 0) > 0 && styles.taggedIcon)}
              disabled={busy}
              onClick={() => setTagOpen(true)}
            />
            <IconButton
              icon={<IconNoteOutline16 />}
              tooltip={t('note')}
              tooltipPlacement="bottom"
              className={clsx(message.note && styles.notedIcon)}
              disabled={busy}
              onClick={() => setNoteOpen(true)}
            />
            <Menu
              options={[
                {
                  key: 'round',
                  label: t('exportRound'),
                  icon: <IconNoteOutline16 />,
                  onSelect: () => exportRange(currentRound, currentRound || 1),
                },
                {
                  key: 'recent',
                  label: t('exportRecent'),
                  icon: <IconNoteOutline16 />,
                  onSelect: () => exportRange(Math.max(1, currentRound - 4), currentRound || 1),
                },
                {
                  key: 'custom',
                  label: t('exportRange'),
                  icon: <IconNoteOutline16 />,
                  onSelect: () => setRangeOpen(true),
                },
              ]}
            >
              {({ toggle }) => (
                <IconButton
                  icon={<IconEllipsisOutline16 />}
                  tooltip={t('more')}
                  tooltipPlacement="bottom"
                  disabled={busy}
                  onClick={toggle}
                />
              )}
            </Menu>
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
      {expanded ? (
        <div className={styles.meta} title={formatFullTime(message.createdAt) ?? undefined}>
          {t('answeredAt', { time: formatRoundTime(message.createdAt) ?? '' })}
        </div>
      ) : null}
      {message.note || (message.tags?.length ?? 0) > 0 ? (
        <div className={styles.marks}>
          {message.note ? <span className={styles.noteLine}>{t('note')}：{message.note}</span> : null}
          {message.tags?.map((tag) => (
            <span key={tag} className={styles.tagLine}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
      {rangeOpen ? (
        <ExportRangeDialog
          total={rounds.length}
          defaultRange={currentRound > 0 ? String(currentRound) : '1'}
          onClose={() => setRangeOpen(false)}
          onExport={exportRange}
        />
      ) : null}
      {noteOpen ? (
        <NoteDialog
          value={message.note ?? ''}
          onClose={() => setNoteOpen(false)}
          onSave={(note) => setMessageNote(sessionId, message.id, note)}
        />
      ) : null}
      {tagOpen ? (
        <TagDialog
          title={t('messageTagsTitle')}
          value={message.tags ?? []}
          onClose={() => setTagOpen(false)}
          onSave={(tags) => setMessageTags(sessionId, message.id, tags)}
        />
      ) : null}
    </div>
  )
})
