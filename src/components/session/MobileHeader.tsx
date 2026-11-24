import { IconMenuOutline20, IconNewChatOutline20 } from '../base/icons.js'
import { useAnswerView } from '../../services/chat/answerView.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import styles from './MobileHeader.module.css'

/** 移动端顶栏：左侧菜单打开侧边栏；会话页再显示标题与开启新对话 */
export const MobileHeader = ({ title }: { title?: string }) => {
  const t = useTranslate()
  const allExpanded = useAnswerView((state) => state.mode) === true
  return (
    <div className={styles.header}>
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconMenuOutline20 />}
        aria-label={t('expandSiderbarButton')}
        onClick={openMobileSider}
      />
      {title === undefined ? null : (
        <>
          <div className={styles.title}>{title}</div>
          <button
            type="button"
            className={styles.expandAll}
            aria-label={t(allExpanded ? 'collapseAll' : 'expandAll')}
            title={t(allExpanded ? 'collapseAll' : 'expandAll')}
            onClick={() => useAnswerView.getState().setMode(!allExpanded)}
          >
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              {allExpanded ? (
                <path
                  d="M4 2.4 8 6.2l4-3.8M4 13.6l4-3.8 4 3.8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M4 6.2 8 2.4l4 3.8M4 9.8l4 3.8 4-3.8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
          <IconButton
            size="xl"
            tone="primary"
            icon={<IconNewChatOutline20 />}
            aria-label={t('newChat')}
            onClick={newChat}
          />
        </>
      )}
    </div>
  )
}
