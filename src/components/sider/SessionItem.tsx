import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconEditOutline16,
  IconEllipsisOutline16,
  IconPinOutline16,
  IconStarFill16,
  IconStarOutline16,
  IconTagOutline16,
  IconTrashOutline16,
} from '../base/icons.js'
import {
  renameSession,
  selectSession,
  setSessionTags,
  toggleSessionPin,
  toggleSessionStar,
} from '../../services/chat/store.js'
import { TagDialog } from '../messages/TagDialog.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './SessionItem.module.css'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  onDelete,
}: {
  session: SessionSummary
  active: boolean
  onDelete: () => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const displayTitle = session.title || t('untitledChat')

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <>
    <div
      className={clsx(styles.item, active && styles.active)}
      onClick={() => {
        selectSession(session.id)
        closeMobileSider()
      }}
    >
      <div className={styles.body}>
        <div className={styles.titleRow}>
          {session.pinned ? (
            <span className={styles.pin} aria-label={t('pin')}>
              <IconPinOutline16 />
            </span>
          ) : null}
          {session.starred ? (
            <span className={styles.star} aria-label={t('favorite')}>
              <IconStarFill16 />
            </span>
          ) : null}
          <div className={styles.title}>{displayTitle}</div>
        </div>
        {session.tags?.length ? (
          <div className={styles.tags}>
            {session.tags.slice(0, 3).map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
            {session.tags.length > 3 ? (
              <span className={styles.tag}>+{session.tags.length - 3}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className={styles.action} onClick={(event) => event.stopPropagation()}>
        <Menu
          options={[
            {
              key: 'pin',
              label: t(session.pinned ? 'unpin' : 'pin'),
              icon: <IconPinOutline16 />,
              onSelect: () => toggleSessionPin(session.id),
            },
            {
              key: 'star',
              label: t(session.starred ? 'unfavorite' : 'favorite'),
              icon: session.starred ? <IconStarFill16 /> : <IconStarOutline16 />,
              onSelect: () => toggleSessionStar(session.id),
            },
            {
              key: 'tags',
              label: t('editTags'),
              icon: <IconTagOutline16 />,
              onSelect: () => setTagOpen(true),
            },
            {
              key: 'rename',
              label: t('sessionItemMenuRenameOption'),
              icon: <IconEditOutline16 />,
              onSelect: () => setEditing(true),
            },
            {
              key: 'delete',
              label: t('delete'),
              icon: <IconTrashOutline16 />,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        >
          {({ toggle }) => (
            <IconButton icon={<IconEllipsisOutline16 />} aria-label={t('more')} onClick={toggle} />
          )}
        </Menu>
      </div>
    </div>
    {tagOpen ? (
      <TagDialog
        title={t('sessionTagsTitle')}
        value={session.tags ?? []}
        onClose={() => setTagOpen(false)}
        onSave={(tags) => setSessionTags(session.id, tags)}
      />
    ) : null}
    </>
  )
})
