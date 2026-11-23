import { useSyncExternalStore } from 'react'
import { useSettings, type ThemePreference } from '../services/settings.js'

export type Theme = 'light' | 'dark'

/** 自定义色系：每个主题固定自己的深浅色底子，色板由 CSS 里同名 data-theme 提供 */
export type ThemePalette =
  | 'default'
  | 'xuanzhi'
  | 'qingzhu'
  | 'yueshan'
  | 'chayan'
  | 'sakura'
  | 'shenlin'

const CUSTOM_THEMES: Record<
  Exclude<ThemePreference, 'light' | 'dark' | 'system'>,
  { mode: Theme; palette: ThemePalette }
> = {
  xuanzhi: { mode: 'light', palette: 'xuanzhi' },
  qingzhu: { mode: 'light', palette: 'qingzhu' },
  yueshan: { mode: 'dark', palette: 'yueshan' },
  chayan: { mode: 'light', palette: 'chayan' },
  sakura: { mode: 'light', palette: 'sakura' },
  shenlin: { mode: 'dark', palette: 'shenlin' },
}

const isCustomTheme = (preference: ThemePreference): preference is keyof typeof CUSTOM_THEMES =>
  preference in CUSTOM_THEMES

const query = window.matchMedia('(prefers-color-scheme: dark)')

const subscribeOsTheme = (listener: () => void) => {
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

const getOsTheme = (): Theme => (query.matches ? 'dark' : 'light')

/** 把偏好解析成「深浅色模式 + 色板」：自定义主题的深浅色是固定的。 */
export const resolveTheme = (
  preference: ThemePreference,
  osTheme: Theme
): { mode: Theme; palette: ThemePalette } => {
  if (isCustomTheme(preference)) {
    return CUSTOM_THEMES[preference]
  }
  return { mode: preference === 'system' ? osTheme : preference, palette: 'default' }
}

/** 当前实际生效的深浅色：手动选择优先，「跟随系统」时取系统设置 */
export const useTheme = (): Theme => {
  const preference = useSettings((state) => state.themePreference)
  const osTheme = useSyncExternalStore(subscribeOsTheme, getOsTheme)
  return resolveTheme(preference, osTheme).mode
}

const syncPageBackground = () => {
  const backgroundColor = getComputedStyle(document.body).backgroundColor
  document.documentElement.style.backgroundColor = backgroundColor
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', backgroundColor)
}

/** 同步页面主题、根画布背景和支持 theme-color 的浏览器栏。 */
const applyTheme = (mode: Theme, palette: ThemePalette) => {
  const body = document.body
  // 主题切换帧禁用过渡，使页面颜色同步更新
  body.classList.add('change-theme')
  body.classList.toggle('dark', mode === 'dark')
  body.classList.toggle('light', mode === 'light')
  if (mode === 'dark') {
    body.setAttribute('data-ds-dark-theme', 'dark')
  } else {
    body.removeAttribute('data-ds-dark-theme')
  }
  if (palette === 'default') {
    body.removeAttribute('data-theme')
  } else {
    body.setAttribute('data-theme', palette)
  }
  document.documentElement.style.colorScheme = mode
  // 首次背景色同步在样式表加载完成后执行，适配 WebKit 的 defer 脚本执行顺序。
  if (document.readyState === 'complete') {
    syncPageBackground()
  }
  setTimeout(() => {
    body.classList.remove('change-theme')
  }, 0)
}

let applied: string | null = null
let appliedFont: string | null = null

/** 正文字体：霞鹜文楷通过 body[data-font] 切换字族，字族本身已自托管。 */
const syncFont = () => {
  const font = useSettings.getState().fontFamily
  if (font === appliedFont) {
    return
  }
  appliedFont = font
  if (font === 'system') {
    document.body.removeAttribute('data-font')
  } else {
    document.body.setAttribute('data-font', font)
  }
}

const syncTheme = () => {
  const { mode, palette } = resolveTheme(useSettings.getState().themePreference, getOsTheme())
  const key = `${mode}:${palette}`
  if (key !== applied) {
    applied = key
    applyTheme(mode, palette)
  }
}

/** 首屏渲染前同步应用一次，之后随主题设置与系统深浅色变化更新 */
export const setupTheme = () => {
  syncTheme()
  syncFont()
  if (document.readyState !== 'complete') {
    window.addEventListener('load', syncPageBackground, { once: true })
  }
  query.addEventListener('change', syncTheme)
  useSettings.subscribe(() => {
    syncTheme()
    syncFont()
  })
}
