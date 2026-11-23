#!/usr/bin/env node
/**
 * chat-demo 静态站点服务：把构建产物 dist/ 挂到固定端口，供宝塔 nginx 反向代理。
 * 零依赖；生产环境用它代替 `pnpm dev`（开发仍用 pnpm dev）。
 *
 *   node server/static-server.mjs
 *
 * 环境变量：PORT（默认 8091）、HOST（默认 0.0.0.0）、DIST（默认仓库下的 dist）
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(process.env.DIST ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist'))
const port = Number(process.env.PORT ?? 8091)
const host = process.env.HOST ?? '0.0.0.0'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end()
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  // 目录请求落到 index.html；未知路径同样回 index.html（单页应用）。
  const target = normalize(join(root, pathname))
  if (!target.startsWith(`${root}${sep}`) && target !== root) {
    res.writeHead(403)
    res.end()
    return
  }
  let file = target
  try {
    const info = await stat(file)
    if (info.isDirectory()) {
      file = join(file, 'index.html')
    }
  } catch {
    file = join(root, 'index.html')
  }
  let info
  try {
    info = await stat(file)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }
  // 带哈希的静态资源可以长缓存，入口 HTML 必须每次校验。
  const hashed = /\/static\//.test(file)
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Last-Modified': info.mtime.toUTCString(),
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
})

server.listen(port, host, () => {
  console.log(`[web] 静态站点 ${root} 已挂到 http://${host}:${port}`)
})
