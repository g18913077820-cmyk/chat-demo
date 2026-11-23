# 多设备同步服务

给 chat-demo 加的一个局域网同步后端：同一局域网内的手机、电脑填同一个地址，会话和图片会自动互相同步，不再需要手动导出/导入 ZIP。

零依赖，只用 Node 内置模块；数据是一个目录：会话 JSON + 附件二进制 + 一个 `index.json`。

## 启动

```sh
# 在本仓库根目录
pnpm sync
# 或
node server/sync-server.mjs
```

默认监听 `0.0.0.0:8787`，数据写到 `server/.sync-data/`。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SYNC_PORT` | `8787` | 监听端口 |
| `SYNC_HOST` | `0.0.0.0` | 监听地址 |
| `SYNC_DATA_DIR` | `server/.sync-data` | 数据目录 |
| `SYNC_TOKEN` | 空 | 设置后请求必须带 `X-Sync-Token` 头或 `?token=` 参数 |

## 开机自启（systemd）

把两个进程交给 systemd，重启后自动拉起（按自己的路径和用户改）：

```ini
# /etc/systemd/system/chat-demo-web.service
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

```ini
# /etc/systemd/system/chat-demo-sync.service
[Unit]
Description=chat-demo sync server
After=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/chat-demo
ExecStart=/usr/bin/node server/sync-server.mjs
Environment=SYNC_PORT=8787
Environment=SYNC_DATA_DIR=/var/lib/chat-demo/sync
Environment=SYNC_TOKEN=换成你自己的令牌
Restart=always

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now chat-demo-web chat-demo-sync
```

改完代码后：`pnpm build` → `sudo systemctl restart chat-demo-web`。

## 备份

服务端数据就是 `SYNC_DATA_DIR` 一个目录，直接打包即可：

```sh
tar -czf chat-demo-sync-$(date +%F).tar.gz -C /var/lib/chat-demo sync
```

想每天自动跑，用 cron 或 systemd timer 都行；`rsync --link-dest` 能做省空间的硬链接快照（每天一份完整视图，只有变化的文件占新空间）。

## Docker

`docker-compose.yml` 已放在同目录，改一下 `SYNC_TOKEN` 再 `docker compose up -d` 即可；数据挂在 `server/data`。

## 客户端配置

打开 chat-demo → 设置 → 数据管理 → 多设备同步：

- **同步地址**：`http://<这台机器的局域网 IP>:8787`，例如 `http://192.168.1.100:8787`
- **访问令牌**：服务端设置了 `SYNC_TOKEN` 时填同一个值，否则留空

填完点「保存并同步」。每台设备填同一个地址即可；手机和电脑各自保留一份本地数据，改完约 1 秒后自动推送，另一台在 20 秒轮询、页面重新可见或手动点「立即同步」时拉取。

## 同步行为

- **按会话增量同步**：改动哪个会话就只传哪个会话，附件（图片原件）只传一次。
- **附件**：新增的附件上传到 `files/<附件ID>`，其他设备拉取会话时按需下载缺失的附件。
- **冲突**：同一会话两台设备同时改，以最后推送的为准（会话级覆盖，不合并消息）。
- **删除**：本地删除会话会推送墓碑，其他设备下一轮同步时一并删除。
- **导入**：设置里可以选「合并导入」（只添加本地没有的对话，不覆盖现有数据）或「覆盖导入」（先清空再导入）。合并后新增的对话会自动推送到其他设备。
- **删除所有对话**：本地历史被整体清空后，服务端也会镜像成同样的集合。
- **游标**：每台设备在 `localStorage` 里记一个 `chat-demo:sync-cursor`，换地址或换令牌会自动全量重拉。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 服务状态与条目数 |
| `GET` | `/api/sync?since=<seq>` | 增量拉取：`{ cursor, sessions, files }` |
| `PUT` | `/api/session/<id>` | 覆盖一个会话（JSON） |
| `DELETE` | `/api/session/<id>` | 删除会话（墓碑） |
| `PUT` | `/api/file/<id>` | 上传附件二进制，`X-File-Mime` 指定类型 |
| `GET` | `/api/file/<id>` | 下载附件 |

`/sync`、`/session/...`、`/file/...` 也作为不带 `/api` 前缀的别名可用。已开 CORS（`Access-Control-Allow-Origin: *`），所以页面和接口不同源也能用。

## 换用自己的存储

同步服务刻意做得很薄，协议只有几个接口（见上表）。想换成 S3、MinIO、对象存储或者改用 Python/Go 实现，只需要满足同一套接口：

- `GET /api/sync?since=<seq>` 返回 `{ cursor, sessions, files }`，`since` 之后变化的记录
- `PUT/DELETE /api/session/<id>` 存/删一个会话 JSON，返回新的 `seq`
- `PUT/GET /api/file/<id>` 存取附件二进制

客户端只认这个协议，服务端怎么存（文件、S3、数据库）随意。也可以保留本服务、只把 `SYNC_DATA_DIR` 挂到对象存储的挂载点上。

## 注意

- 服务本身**没有多用户隔离**，一个地址就是一份共享数据；放在公网前请务必设置 `SYNC_TOKEN`。
- 数据目录是纯文件，备份直接打包 `server/.sync-data/` 即可。
- 附件按 ID 存，删除会话不会删除服务端附件（同一附件可能被多个会话引用）。
