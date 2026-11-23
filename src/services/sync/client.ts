import type { Session } from '../chat/types.js'

/** 远端会话记录：`deleted` 为墓碑，客户端据此删除本地副本。 */
export type RemoteSession = {
  id: string
  seq: number
  deleted?: true
  session?: Session
}

/** 远端附件元数据；实际字节走 /api/file/:id。 */
export type RemoteFile = {
  id: string
  seq: number
  mime: string
  size: number
}

export type PullResult = {
  /** 本轮拉取后的游标，下次以 since= 传入。 */
  cursor: number
  sessions: RemoteSession[]
  files: RemoteFile[]
}

const REQUEST_TIMEOUT = 20_000
const TRANSFER_TIMEOUT = 120_000

const baseOf = (url: string) => url.trim().replace(/\/+$/, '')

const headers = (token: string, extra: Record<string, string> = {}) => ({
  ...(token ? { 'X-Sync-Token': token } : {}),
  ...extra,
})

const request = async (
  url: string,
  init: RequestInit,
  timeout: number
): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      // 服务端错误是 {"error": "..."}，取出来直接展示，避免把 JSON 塞给用户看。
      let message = detail.trim()
      try {
        const parsed = JSON.parse(message) as { error?: unknown }
        if (typeof parsed.error === 'string') {
          message = parsed.error
        }
      } catch {
        // 非 JSON 错误体按原样展示
      }
      throw new Error(message || `HTTP ${response.status}`)
    }
    return response
  } finally {
    clearTimeout(timer)
  }
}

/** 按游标拉取新增记录；since=0 表示全量。 */
export const pull = async (base: string, token: string, since: number): Promise<PullResult> => {
  const response = await request(
    `${baseOf(base)}/api/sync?since=${since}`,
    { headers: headers(token), cache: 'no-store' },
    REQUEST_TIMEOUT
  )
  return (await response.json()) as PullResult
}

export const putSession = async (base: string, token: string, session: Session): Promise<void> => {
  await request(
    `${baseOf(base)}/api/session/${encodeURIComponent(session.id)}`,
    {
      method: 'PUT',
      headers: headers(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(session),
    },
    TRANSFER_TIMEOUT
  )
}

export const deleteSession = async (base: string, token: string, id: string): Promise<void> => {
  await request(
    `${baseOf(base)}/api/session/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: headers(token) },
    REQUEST_TIMEOUT
  )
}

export const putFile = async (base: string, token: string, id: string, blob: Blob): Promise<void> => {
  await request(
    `${baseOf(base)}/api/file/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: headers(token, { 'Content-Type': 'application/octet-stream', 'X-File-Mime': blob.type || 'application/octet-stream' }),
      body: blob,
    },
    TRANSFER_TIMEOUT
  )
}

export const getFile = async (base: string, token: string, id: string, mime: string): Promise<Blob> => {
  const response = await request(
    `${baseOf(base)}/api/file/${encodeURIComponent(id)}`,
    { headers: headers(token), cache: 'no-store' },
    TRANSFER_TIMEOUT
  )
  return new Blob([await response.arrayBuffer()], { type: mime || 'application/octet-stream' })
}

export type Health = { ok: boolean; seq: number; sessions: number; files: number }

export const health = async (base: string, token: string): Promise<Health> => {
  const response = await request(
    `${baseOf(base)}/health`,
    { headers: headers(token), cache: 'no-store' },
    REQUEST_TIMEOUT
  )
  return (await response.json()) as Health
}
