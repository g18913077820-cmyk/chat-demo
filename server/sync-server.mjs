#!/usr/bin/env node
/**
 * chat-demo 局域网同步服务。
 *
 * 单房间、追加序号（seq）模型：会话整条推送、附件按 ID 存二进制，客户端用 since=cursor 增量拉取。
 * 零依赖，只用 Node 内置模块；数据存在 SYNC_DATA_DIR（默认 server/.sync-data）。
 *
 *   node server/sync-server.mjs
 *
 * 环境变量：
 *   SYNC_PORT      监听端口，默认 8787
 *   SYNC_HOST      监听地址，默认 0.0.0.0（局域网可访问）
 *   SYNC_DATA_DIR  数据目录，默认 server/.sync-data
 *   SYNC_TOKEN     可选访问令牌；设置后请求需带 x-sync-token 头或 ?token= 参数
 */

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.SYNC_PORT ?? 8787)
const host = process.env.SYNC_HOST ?? '0.0.0.0'
const dataDir = process.env.SYNC_DATA_DIR ?? join(here, '.sync-data')
const token = process.env.SYNC_TOKEN ?? ''

const sessionsDir = join(dataDir, 'sessions')
const filesDir = join(dataDir, 'files')
const indexPath = join(dataDir, 'index.json')

/** 单条请求体上限：附件可能较大，留足余量。 */
const MAX_BODY_BYTES = 512 * 1024 * 1024
/** 允许的 ID 形态，避免路径穿越。 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/** index.json 的内存副本：seq 单调递增，记录每个实体的最后修改序号。 */
let index = { seq: 0, sessions: {}, files: {} }
/** 所有写操作串行执行，保证 index 与磁盘一致。 */
let queue = Promise.resolve()

const enqueue = (task) => {
  const run = queue.then(task)
  queue = run.catch(() => {})
  return run
}

const loadIndex = async () => {
  try {
    const parsed = JSON.parse(await readFile(indexPath, 'utf8'))
    if (parsed && typeof parsed.seq === 'number') {
      index = {
        seq: parsed.seq,
        sessions: parsed.sessions ?? {},
        files: parsed.files ?? {},
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[sync] 读取 index.json 失败，将以空索引启动：', error.message)
    }
  }
}

const saveIndex = async () => {
  const temp = `${indexPath}.tmp`
  await writeFile(temp, JSON.stringify(index))
  await rename(temp, indexPath)
}

const nextSeq = () => {
  index.seq += 1
  return index.seq
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Token, X-File-Mime',
  'Access-Control-Max-Age': '86400',
}

const send = (res, status, body, headers = {}) => {
  const payload = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    ...cors,
    ...(payload ? { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json' } : {}),
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

const fail = (res, status, message) => send(res, status, { error: message })

const authorized = (req, url) => {
  if (!token) {
    return true
  }
  const header = req.headers['x-sync-token']
  return header === token || url.searchParams.get('token') === token
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const sessionPath = (id) => join(sessionsDir, `${id}.json`)
const filePath = (id) => join(filesDir, id)

const handleSync = async (res, url) => {
  const since = Math.max(0, Math.trunc(Number(url.searchParams.get('since') ?? '0')) || 0)
  const sessions = []
  const files = []
  for (const [id, record] of Object.entries(index.sessions)) {
    if (record.seq <= since) {
      continue
    }
    if (record.deleted) {
      sessions.push({ id, seq: record.seq, deleted: true })
      continue
    }
    try {
      sessions.push({ id, seq: record.seq, session: JSON.parse(await readFile(sessionPath(id), 'utf8')) })
    } catch (error) {
      // 文件缺失时按删除下发，避免客户端一直等不到这条记录。
      console.error(`[sync] 会话 ${id} 读取失败：`, error.message)
      sessions.push({ id, seq: record.seq, deleted: true })
    }
  }
  for (const [id, record] of Object.entries(index.files)) {
    if (record.seq > since) {
      files.push({ id, seq: record.seq, mime: record.mime, size: record.size })
    }
  }
  send(res, 200, { cursor: index.seq, sessions, files })
}

const handlePutSession = async (req, res, id) => {
  const raw = await readBody(req)
  let session
  try {
    session = JSON.parse(raw.toString('utf8'))
  } catch {
    return fail(res, 400, '会话不是合法 JSON')
  }
  if (!session || session.id !== id) {
    return fail(res, 400, '会话 id 与路径不一致')
  }
  return enqueue(async () => {
    await writeFile(`${sessionPath(id)}.tmp`, JSON.stringify(session))
    await rename(`${sessionPath(id)}.tmp`, sessionPath(id))
    const seq = nextSeq()
    index.sessions[id] = { seq, deleted: false }
    await saveIndex()
    send(res, 200, { seq })
  })
}

const handleDeleteSession = (res, id) =>
  enqueue(async () => {
    const seq = nextSeq()
    index.sessions[id] = { seq, deleted: true }
    delete index.files[id]
    await rm(sessionPath(id), { force: true })
    await saveIndex()
    send(res, 200, { seq })
  })

const handlePutFile = async (req, res, id) =>
  enqueue(async () => {
    const body = await readBody(req)
    const mime = String(req.headers['x-file-mime'] ?? 'application/octet-stream').slice(0, 128)
    await writeFile(`${filePath(id)}.tmp`, body)
    await rename(`${filePath(id)}.tmp`, filePath(id))
    const seq = nextSeq()
    index.files[id] = { seq, mime, size: body.length }
    await saveIndex()
    send(res, 200, { seq, size: body.length })
  })

const handleGetFile = async (res, id) => {
  const record = index.files[id]
  const path = filePath(id)
  let info
  try {
    info = await stat(path)
  } catch {
    return fail(res, 404, '附件不存在')
  }
  res.writeHead(200, {
    ...cors,
    'Content-Type': record?.mime ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-store',
  })
  createReadStream(path).pipe(res)
  return undefined
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }
  if (!authorized(req, url)) {
    fail(res, 401, '访问令牌无效')
    return
  }
  if (req.method === 'GET' && (path === '/health' || path === '/api/health')) {
    send(res, 200, {
      ok: true,
      seq: index.seq,
      sessions: Object.values(index.sessions).filter((record) => !record.deleted).length,
      files: Object.keys(index.files).length,
    })
    return
  }
  if (req.method === 'GET' && (path === '/api/sync' || path === '/sync')) {
    handleSync(res, url).catch((error) => fail(res, 500, error.message))
    return
  }
  const sessionMatch = /^\/(?:api\/)?session\/([^/]+)$/.exec(path)
  if (sessionMatch) {
    const id = sessionMatch[1]
    if (!ID_PATTERN.test(id)) {
      fail(res, 400, '非法会话 ID')
      return
    }
    if (req.method === 'PUT') {
      handlePutSession(req, res, id).catch((error) => fail(res, 500, error.message))
      return
    }
    if (req.method === 'DELETE') {
      handleDeleteSession(res, id).catch((error) => fail(res, 500, error.message))
      return
    }
  }
  const fileMatch = /^\/(?:api\/)?file\/([^/]+)$/.exec(path)
  if (fileMatch) {
    const id = fileMatch[1]
    if (!ID_PATTERN.test(id)) {
      fail(res, 400, '非法附件 ID')
      return
    }
    if (req.method === 'PUT') {
      handlePutFile(req, res, id).catch((error) => fail(res, 500, error.message))
      return
    }
    if (req.method === 'GET') {
      handleGetFile(res, id).catch((error) => fail(res, 500, error.message))
      return
    }
  }
  fail(res, 404, '接口不存在')
})

await mkdir(sessionsDir, { recursive: true })
await mkdir(filesDir, { recursive: true })
await loadIndex()
server.listen(port, host, () => {
  console.log(`[sync] 同步服务已启动 http://${host}:${port}`)
  console.log(`[sync] 数据目录 ${dataDir}${token ? '（已启用访问令牌）' : '（未设置令牌）'}`)
})
