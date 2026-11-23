# 部署说明

项目本身是纯静态站点：`pnpm build` 之后 `dist/` 就是全部内容，不需要 Node 运行时。同步服务是可选的独立进程。

## 一、静态站点

```sh
pnpm install
pnpm build          # 产物在 dist/
```

把 `dist/` 放到任意静态服务器的根目录即可。资源路径是相对的，放在子目录（如 `/chat/`）也能正常工作。

### nginx 直接托管

```nginx
server {
    listen 80;
    server_name chat.example.com;
    root /srv/chat-demo/dist;
    index index.html;

    # 带哈希的静态资源可以长缓存
    location /static/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 用 Node 托管（`server/static-server.mjs`）

仓库自带一个零依赖的静态服务器，适合不想动 nginx 的场景：

```sh
node server/static-server.mjs          # 默认 8091，DIST 可指定目录
```

systemd 单元示例：

```ini
[Unit]
Description=chat-demo static site
After=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/chat-demo
ExecStart=/usr/bin/node server/static-server.mjs
Environment=PORT=8091
Restart=always

[Install]
WantedBy=multi-user.target
```

前面再放一层 nginx 反向代理到 `127.0.0.1:8091`，就能挂域名和证书了。

### 开发模式下的域名访问

`pnpm dev` 的 rspack dev server 默认只放行 localhost 和 IP。要通过域名访问，设置环境变量：

```sh
CHAT_DEMO_ALLOWED_HOSTS=chat.example.com,.example.com pnpm dev
```

生产环境用 `dist/` 静态托管时没有这个限制。

## 二、同步服务（可选）

见 [server/README.md](../server/README.md)：`pnpm sync` 起服务、`SYNC_TOKEN` 设置令牌、Docker / systemd 示例、以及接口协议（想换成 S3 或其他存储时照着实现即可）。

## 三、GitHub Pages

仓库自带 [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)，在仓库 Settings → Pages 里把 Source 选成 **GitHub Actions**，然后：

- 推一个 `v*` 的 tag，或
- 在 Actions 页面手动运行 `Deploy to GitHub Pages`

CI 会用 Node 22 + pnpm 构建并发布 `dist/`。Pages 上是纯前端演示：API Key 各自填在浏览器里，**同步功能不可用**（需要你自己的同步服务）。

## 四、HTTPS 与安全上下文

页面走 HTTPS 时（nginx 配好证书即可），语音输入、朗读、剪贴板等浏览器能力才能完整使用。HTTP 下浏览器会禁用麦克风，其余功能不受影响。

如果同步服务也暴露在公网，务必：

1. 设置 `SYNC_TOKEN`
2. 用 nginx 反代并只开放 443
3. 不要把 `server/.sync-data/` 放进静态目录
