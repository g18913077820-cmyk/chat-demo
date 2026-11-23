import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  setSyncEnabled,
  setSyncToken,
  setSyncUrl,
  useSettings,
} from '../../services/settings.js'
import { syncNow, useSyncStore } from '../../services/sync/engine.js'
import { Button } from '../base/Button.js'
import styles from './Settings.module.css'

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString()

/** 数据管理里的「多设备同步」：填写局域网同步服务地址与可选令牌。 */
export const SyncSettings = () => {
  const t = useTranslate()
  const savedUrl = useSettings((state) => state.syncUrl)
  const savedToken = useSettings((state) => state.syncToken)
  const enabled = useSettings((state) => state.syncEnabled)
  const { phase, lastSyncAt, error, pending } = useSyncStore()
  const [url, setUrl] = useState(savedUrl)
  const [token, setToken] = useState(savedToken)

  const dirty = url.trim() !== savedUrl || token.trim() !== savedToken

  const save = () => {
    setSyncUrl(url)
    setSyncToken(token)
    setUrl(url.trim())
    setToken(token.trim())
    void syncNow()
  }

  const status = (() => {
    if (phase === 'error') {
      return <span className={styles.error}>{t('syncStatusError', { message: error ?? '' })}</span>
    }
    if (!enabled || !savedUrl) {
      return <span className={styles.description}>{t('syncStatusOff')}</span>
    }
    if (phase === 'syncing') {
      return <span className={styles.description}>{t('syncStatusSyncing')}</span>
    }
    if (lastSyncAt === null) {
      return <span className={styles.description}>{t('syncStatusNever')}</span>
    }
    return (
      <span className={styles.description}>
        {t('syncStatusOk', { time: formatTime(lastSyncAt) })}
        {pending > 0 ? ` · ${t('syncStatusPending', { count: pending })}` : ''}
      </span>
    )
  })()

  return (
    <div className={styles.cell}>
      <div className={styles.text}>
        <div className={styles.label}>{t('syncTitle')}</div>
        <div className={styles.description}>{t('syncDescription')}</div>
        <div className={styles.syncFields}>
          <div className={styles.apiKeyInput}>
            <input
              type="url"
              inputMode="url"
              spellCheck={false}
              aria-label={t('syncUrlLabel')}
              placeholder={t('syncUrlPlaceholder')}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  save()
                }
              }}
            />
          </div>
          <div className={styles.apiKeyInput}>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label={t('syncTokenLabel')}
              placeholder={t('syncTokenPlaceholder')}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  save()
                }
              }}
            />
          </div>
          <div className={styles.syncActions}>
            <Button variant="primary" size="s" disabled={!dirty && !savedUrl} onClick={save}>
              {t('syncSave')}
            </Button>
            <Button
              variant="outlined"
              size="s"
              disabled={!enabled || !savedUrl || phase === 'syncing'}
              onClick={() => void syncNow()}
            >
              {t('syncNow')}
            </Button>
            <label className={styles.syncEnable}>
              <input
                type="checkbox"
                checked={enabled}
                disabled={!savedUrl}
                onChange={(event) => {
                  setSyncEnabled(event.target.checked)
                  if (event.target.checked) {
                    void syncNow()
                  }
                }}
              />
              {t('syncEnable')}
            </label>
            {status}
          </div>
        </div>
      </div>
    </div>
  )
}
