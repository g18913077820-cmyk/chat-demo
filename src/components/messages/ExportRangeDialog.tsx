import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { parseRoundRange } from '../../services/chat/exportRounds.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import styles from './TagDialog.module.css'

/** 导出自定义轮次范围：输入「3-5」或「7」。 */
export const ExportRangeDialog = ({
  total,
  defaultRange,
  onClose,
  onExport,
}: {
  total: number
  defaultRange: string
  onClose: () => void
  onExport: (start: number, end: number) => void
}) => {
  const t = useTranslate()
  const [text, setText] = useState(defaultRange)
  const parsed = parseRoundRange(text, total)

  return (
    <Modal
      title={t('exportRangeTitle')}
      className={styles.dialog}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            size="m"
            disabled={!parsed}
            onClick={() => {
              if (parsed) {
                onExport(parsed.start, parsed.end)
                onClose()
              }
            }}
          >
            {t('exportRangeConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <input
          className={styles.input}
          autoFocus
          value={text}
          placeholder={t('exportRangePlaceholder')}
          aria-label={t('exportRangeTitle')}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && parsed) {
              onExport(parsed.start, parsed.end)
              onClose()
            }
          }}
        />
        <div className={styles.hint}>{t('exportRangeHint', { total })}</div>
      </div>
    </Modal>
  )
}
