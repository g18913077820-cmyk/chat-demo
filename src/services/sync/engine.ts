import { create } from 'zustand'
import * as db from '../chat/db.js'
import { applyRemoteSessions, useChatStore } from '../chat/store.js'
import type { Session } from '../chat/types.js'
import { useSettings } from '../settings.js'
import * as client from './client.js'

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'ok' | 'error'

type SyncState = {
  phase: SyncPhase
  lastSyncAt: number | null
  error: string | null
  /** 尚未推送的会话/删除/附件数量 */
  pending: number
}

export const useSyncStore = create<SyncState>(() => ({
  phase: 'off',
  lastSyncAt: null,
  error: null,
  pending: 0,
}))

/** 一次本地改动后等待多久再推送，避免流式回复期间逐字上传。 */
const PUSH_DELAY = 1_200
/** 连续改动时最多等这么久就强制推送一次。 */
const PUSH_MAX_DELAY = 6_000
/** 轮询远端改动的间隔。 */
const POLL_INTERVAL = 20_000
/** 附件下载并发数。 */
const DOWNLOAD_CONCURRENCY = 3

const CURSOR_KEY = 'chat-demo:sync-cursor'
/** 记录某个地址是否已完成首次全量对齐（拉取 + 补传本地独有会话）。 */
const SEEDED_KEY = 'chat-demo:sync-seeded'

type Cursor = { url: string; token: string; cursor: number }

const dirtySessions = new Set<string>()
const dirtyDeletes = new Set<string>()
const dirtyFiles = new Set<string>()
/** 已在服务端存在的附件 ID，避免重复上传。 */
const remoteFiles = new Set<string>()
/** 因正在生成回复而暂缓应用的远端会话，等流结束后补写。 */
const deferredSessions = new Map<string, Session>()

let pushTimer: ReturnType<typeof setTimeout> | undefined
let firstQueuedAt = 0
let flushing: Promise<void> | null = null
let pollTimer: ReturnType<typeof setInterval> | undefined
let started = false

const config = () => {
  const { syncUrl, syncToken, syncEnabled } = useSettings.getState()
  const url = syncUrl.trim().replace(/\/+$/, '')
  return { url, token: syncToken.trim(), active: syncEnabled && url !== '' }
}

/** 只按地址区分端点：换访问令牌不该让整份历史重拉一遍。 */
const isSeeded = (url: string): boolean => {
  try {
    return localStorage.getItem(SEEDED_KEY) === url
  } catch {
    return false
  }
}

const markSeeded = (url: string) => {
  try {
    localStorage.setItem(SEEDED_KEY, url)
  } catch {
    // 存储不可用时下次仍按首次同步处理，只会多一次全量拉取
  }
}

const readCursor = (url: string): number => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CURSOR_KEY) ?? 'null') as Cursor | null
    if (parsed && parsed.url === url) {
      return parsed.cursor
    }
  } catch {
    // 游标损坏时按全量拉取处理
  }
  return 0
}

const writeCursor = (url: string, token: string, cursor: number) => {
  try {
    localStorage.setItem(CURSOR_KEY, JSON.stringify({ url, token, cursor } satisfies Cursor))
  } catch {
    // 存储不可用时下次仍全量拉取，不影响正确性
  }
}

const pendingCount = () => dirtySessions.size + dirtyDeletes.size + dirtyFiles.size

const refreshPending = () => {
  useSyncStore.setState({ pending: pendingCount() })
}

const schedulePush = () => {
  if (!config().active) {
    return
  }
  const now = Date.now()
  firstQueuedAt ||= now
  const wait = Math.min(PUSH_DELAY, Math.max(0, PUSH_MAX_DELAY - (now - firstQueuedAt)))
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    firstQueuedAt = 0
    void syncNow()
  }, wait)
}

/** 推送本地改动：删除 → 会话 → 附件。失败时保留队列，下一轮重试。 */
const pushLocal = async (url: string, token: string) => {
  for (const id of [...dirtyDeletes]) {
    await client.deleteSession(url, token, id)
    dirtyDeletes.delete(id)
    dirtySessions.delete(id)
    refreshPending()
  }
  for (const id of [...dirtySessions]) {
    if (dirtyDeletes.has(id)) {
      dirtySessions.delete(id)
      continue
    }
    const session = await db.loadSession(id)
    if (session) {
      await client.putSession(url, token, session)
    } else {
      // 本地已不存在（例如批量删除），同步成墓碑。
      await client.deleteSession(url, token, id)
    }
    dirtySessions.delete(id)
    refreshPending()
  }
  for (const id of [...dirtyFiles]) {
    if (remoteFiles.has(id)) {
      dirtyFiles.delete(id)
      continue
    }
    const blob = await db.loadFile(id)
    if (!blob) {
      dirtyFiles.delete(id)
      continue
    }
    await client.putFile(url, token, id, blob)
    remoteFiles.add(id)
    dirtyFiles.delete(id)
    refreshPending()
  }
}

const downloadMissing = async (
  url: string,
  token: string,
  files: client.RemoteFile[]
): Promise<void> => {
  const queue = files.slice()
  const worker = async () => {
    for (;;) {
      const file = queue.shift()
      if (!file) {
        return
      }
      if (await db.hasFile(file.id)) {
        continue
      }
      const blob = await client.getFile(url, token, file.id, file.mime)
      await db.saveFiles([{ id: file.id, blob }])
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length) }, worker))
}

/** 拉取远端改动并写入本地；正在生成回复的会话先跳过，等流结束后补写。 */
const pullRemote = async (url: string, token: string) => {
  // 首次同步按全量拉取，才能判断哪些本地会话是服务端还没有的。
  const first = !isSeeded(url)
  const since = first ? 0 : readCursor(url)
  const { cursor, sessions, files } = await client.pull(url, token, since)
  const streaming = useChatStore.getState().streaming
  const deletions: string[] = []
  const upserts: Session[] = []

  for (const record of sessions) {
    // 本地还有未推送的改动时以本地为准，避免旧版本覆盖刚编辑的内容。
    if (dirtySessions.has(record.id) || dirtyDeletes.has(record.id)) {
      continue
    }
    if (record.deleted) {
      if (!Object.hasOwn(streaming, record.id)) {
        deferredSessions.delete(record.id)
        deletions.push(record.id)
      }
      continue
    }
    if (!record.session) {
      continue
    }
    if (Object.hasOwn(streaming, record.id)) {
      deferredSessions.set(record.id, record.session)
      continue
    }
    deferredSessions.delete(record.id)
    upserts.push(record.session)
  }
  // 流结束后把之前跳过的记录补上
  for (const [id, session] of [...deferredSessions]) {
    if (Object.hasOwn(streaming, id)) {
      continue
    }
    deferredSessions.delete(id)
    upserts.push(session)
  }

  for (const id of deletions) {
    await db.deleteSession(id)
  }
  for (const session of upserts) {
    await db.saveSession(session)
  }
  if (upserts.length > 0 || deletions.length > 0) {
    applyRemoteSessions(upserts, deletions)
  }

  for (const file of files) {
    remoteFiles.add(file.id)
  }
  await downloadMissing(url, token, files)
  writeCursor(url, token, cursor)

  // 首次同步把本地已有、服务端还没有的会话补传上去，
  // 否则启用同步前就存在的历史永远不会离开本机。
  if (first) {
    const remoteIds = new Set(
      sessions.filter((record) => !record.deleted).map((record) => record.id)
    )
    for (const summary of await db.loadSessionSummaries()) {
      if (remoteIds.has(summary.id)) {
        continue
      }
      dirtySessions.add(summary.id)
      const session = await db.loadSession(summary.id)
      for (const message of session?.messages ?? []) {
        if (message.role === 'user') {
          for (const file of message.files) {
            if (!remoteFiles.has(file.id)) {
              dirtyFiles.add(file.id)
            }
          }
        }
      }
    }
    markSeeded(url)
    refreshPending()
  }
}

/** 立即同步：先推送本地改动，再拉取远端改动。并发调用合并为同一个任务。 */
export const syncNow = (): Promise<void> => {
  if (flushing) {
    return flushing
  }
  const { url, token, active } = config()
  if (!active) {
    useSyncStore.setState({ phase: 'off', error: null, pending: pendingCount() })
    return Promise.resolve()
  }
  if (useChatStore.getState().importingHistory) {
    return Promise.resolve()
  }
  useSyncStore.setState({ phase: 'syncing', error: null })
  let ok = false
  flushing = (async () => {
    try {
      await pushLocal(url, token)
      await pullRemote(url, token)
      ok = true
      useSyncStore.setState({ phase: 'ok', lastSyncAt: Date.now(), error: null })
    } catch (error) {
      useSyncStore.setState({
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      flushing = null
      refreshPending()
      // 失败时交给轮询重试，避免在服务不可用时每 1.2 秒重试一次。
      if (ok && pendingCount() > 0) {
        schedulePush()
      }
    }
  })()
  return flushing
}

/** 本地会话已落库：排队推送。 */
export const queueSession = (id: string) => {
  if (!config().active) {
    return
  }
  dirtySessions.add(id)
  refreshPending()
  schedulePush()
}

/** 本地删除会话：排队推送墓碑。 */
export const queueDelete = (id: string) => {
  if (!config().active) {
    return
  }
  dirtyDeletes.add(id)
  dirtySessions.delete(id)
  refreshPending()
  schedulePush()
}

/** 新增附件：排队上传；远端已有则跳过。 */
export const queueFile = (id: string) => {
  if (!config().active || remoteFiles.has(id)) {
    return
  }
  dirtyFiles.add(id)
  refreshPending()
  schedulePush()
}

/** 导入、全部删除后调用：把本地全部会话与附件重新排队推送。 */
export const syncAll = async (): Promise<void> => {
  if (!config().active) {
    return
  }
  for (const summary of await db.loadSessionSummaries()) {
    dirtySessions.add(summary.id)
    const session = await db.loadSession(summary.id)
    for (const message of session?.messages ?? []) {
      if (message.role === 'user') {
        for (const file of message.files) {
          if (!remoteFiles.has(file.id)) {
            dirtyFiles.add(file.id)
          }
        }
      }
    }
  }
  refreshPending()
  await syncNow()
}

/** 只推送指定会话与附件：增量导入后调用，避免把整个历史重新上传一遍。 */
export const pushSessions = async (ids: string[], fileIds: string[] = []): Promise<void> => {
  if (!config().active) {
    return
  }
  for (const id of ids) {
    dirtySessions.add(id)
  }
  for (const id of fileIds) {
    if (!remoteFiles.has(id)) {
      dirtyFiles.add(id)
    }
  }
  refreshPending()
  await syncNow()
}

/**
 * 导入或「删除所有对话」后调用：本地历史已被整体替换，远端也要镜像成同样的集合。
 * 先删掉远端多出来的会话，再把本地全部推上去，最后重置游标让下一轮重新对齐。
 */
export const syncReplaceAll = async (): Promise<void> => {
  if (!config().active) {
    return
  }
  const { url, token } = config()
  writeCursor(url, token, 0)
  try {
    const remote = await client.pull(url, token, 0)
    const local = new Set((await db.loadSessionSummaries()).map((summary) => summary.id))
    for (const record of remote.sessions) {
      if (!record.deleted && !local.has(record.id)) {
        await client.deleteSession(url, token, record.id)
      }
    }
    for (const file of remote.files) {
      remoteFiles.add(file.id)
    }
  } catch {
    // 远端不可用时仅推送本地数据，下一轮拉取会补齐差异。
  }
  await syncAll()
}

const startPolling = () => {
  clearInterval(pollTimer)
  pollTimer = setInterval(() => void syncNow(), POLL_INTERVAL)
}

/** 应用启动时调用一次：按设置变化启停同步，并在页面重新可见、网络恢复时补一次。 */
export const startSync = () => {
  if (started) {
    return
  }
  started = true
  const apply = () => {
    if (!config().active) {
      clearInterval(pollTimer)
      useSyncStore.setState({ phase: 'off', error: null, pending: 0 })
      return
    }
    startPolling()
    void syncNow()
  }
  useSettings.subscribe((state, previous) => {
    if (
      state.syncUrl !== previous.syncUrl ||
      state.syncToken !== previous.syncToken ||
      state.syncEnabled !== previous.syncEnabled
    ) {
      apply()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void syncNow()
    }
  })
  window.addEventListener('online', () => void syncNow())
  apply()
}
