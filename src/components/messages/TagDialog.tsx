import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import styles from './TagDialog.module.css'

/** 逗号、顿号、空格都能分隔标签，具体长度与数量限制由调用方标准化。 */
const parseTags = (text: string): string[] =>
  text
    .split(/[,，、;；\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)

/** 标签编辑弹窗：会话与单条回答共用。 */
export const TagDialog = ({
  title,
  value,
  onClose,
  onSave,
}: {
  title: string
  value: string[]
  onClose: () => void
  onSave: (tags: string[]) => void
}) => {
  const t = useTranslate()
  const [text, setText] = useState(value.join(', '))

  const submit = () => {
    onSave(parseTags(text))
    onClose()
  }

  return (
    <Modal
      title={title}
      className={styles.dialog}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="m" onClick={submit}>
            {t('confirm')}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <input
          className={styles.input}
          autoFocus
          value={text}
          placeholder={t('tagsPlaceholder')}
          aria-label={t('tagsPlaceholder')}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              submit()
            }
          }}
        />
        <div className={styles.hint}>{t('tagsHint')}</div>
      </div>
    </Modal>
  )
}
