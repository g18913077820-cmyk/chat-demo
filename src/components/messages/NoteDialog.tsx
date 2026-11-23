import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import styles from './NoteDialog.module.css'

/** 备注弹窗：单条回答的自用笔记，留空即清除。 */
export const NoteDialog = ({
  value,
  onClose,
  onSave,
}: {
  value: string
  onClose: () => void
  onSave: (note: string) => void
}) => {
  const t = useTranslate()
  const [text, setText] = useState(value)

  return (
    <Modal
      title={t('noteTitle')}
      className={styles.dialog}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            size="m"
            onClick={() => {
              onSave(text)
              onClose()
            }}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <textarea
          className={styles.textarea}
          autoFocus
          rows={4}
          maxLength={500}
          value={text}
          placeholder={t('notePlaceholder')}
          aria-label={t('noteTitle')}
          onChange={(event) => setText(event.target.value)}
        />
        <div className={styles.hint}>{t('noteHint')}</div>
      </div>
    </Modal>
  )
}
