import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统。自定义主题各自固定深浅色。 */
export type ThemePreference =
  | 'light'
  | 'dark'
  | 'system'
  | 'xuanzhi'
  | 'qingzhu'
  | 'yueshan'
  | 'chayan'
  | 'sakura'
  | 'shenlin'

/** 可选主题集合，用于校验 localStorage 里保存的值 */
const THEME_PREFERENCES: readonly ThemePreference[] = [
  'light',
  'dark',
  'system',
  'xuanzhi',
  'qingzhu',
  'yueshan',
  'chayan',
  'sakura',
  'shenlin',
]

/** 正文字体：system 跟随系统，wenkai 霞鹜文楷，zhuokai 寒蝉拙楷（均内置） */
export type FontFamily = 'system' | 'wenkai' | 'zhuokai'

/** 本机设置，存 localStorage：API Key、语言、主题、字体、位置、朗读音色、深度思考与智能搜索开关、侧边栏收起状态 */
type Settings = {
  apiKey: string | null
  locale: Locale
  themePreference: ThemePreference
  fontFamily: FontFamily
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
  /** 多设备同步服务地址，对应 server/sync-server.mjs；为空表示不启用 */
  syncUrl: string
  /** 同步服务访问令牌，服务端设置了 SYNC_TOKEN 时必填 */
  syncToken: string
  syncEnabled: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  fontFamily: 'chat-demo:font-family',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
  syncUrl: 'chat-demo:sync-url',
  syncToken: 'chat-demo:sync-token',
  syncEnabled: 'chat-demo:sync-enabled',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return THEME_PREFERENCES.find((value) => value === saved) ?? 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  fontFamily:
    read(KEYS.fontFamily) === 'wenkai'
      ? 'wenkai'
      : read(KEYS.fontFamily) === 'zhuokai'
        ? 'zhuokai'
        : 'system',
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  syncUrl: read(KEYS.syncUrl) ?? '',
  syncToken: read(KEYS.syncToken) ?? '',
  syncEnabled: read(KEYS.syncEnabled) === 'true',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setFontFamily = (fontFamily: FontFamily) => {
  write(KEYS.fontFamily, fontFamily)
  useSettings.setState({ fontFamily })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = (apiKey: string | null) => {
  write(KEYS.apiKey, apiKey)
  useSettings.setState({ apiKey })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}

/** 保存同步地址；填入地址即视为启用，清空地址时一并关闭。 */
export const setSyncUrl = (syncUrl: string) => {
  const value = syncUrl.trim()
  write(KEYS.syncUrl, value)
  if (!value) {
    write(KEYS.syncEnabled, 'false')
    useSettings.setState({ syncUrl: value, syncEnabled: false })
    return
  }
  write(KEYS.syncEnabled, 'true')
  useSettings.setState({ syncUrl: value, syncEnabled: true })
}

export const setSyncToken = (syncToken: string) => {
  const value = syncToken.trim()
  write(KEYS.syncToken, value)
  useSettings.setState({ syncToken: value })
}

export const setSyncEnabled = (syncEnabled: boolean) => {
  write(KEYS.syncEnabled, String(syncEnabled))
  useSettings.setState({ syncEnabled })
}
