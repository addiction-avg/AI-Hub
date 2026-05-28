# AI 中转站 Starter

这是一个 OpenAI 兼容格式的 AI 中转站商业化 MVP。当前版本包含请求转发、API Key、余额、Redis 限流、调用日志、管理员后台、审计日志、充值订单预留、token 计费基础和 Docker 部署配置。

## 启动

要求：

```text
Node.js 22 LTS
Docker Desktop / Docker Compose
```

```bash
npm install
copy .env.example .env
npm run dev:db
npm run prisma:migrate
npm run dev
```

默认 API 地址：

```text
http://localhost:3000
```

管理后台：

```bash
npm run dev:admin
```

后台地址：

```text
http://localhost:3001
```

## 认证与权限

中转站用户请求使用 `RELAY_API_KEYS`，默认本地 Key 是 `sk-local-dev`。

管理后台请求使用 `ADMIN_API_KEYS`，只允许访问 `/admin/*`。支持两种格式：

```env
ADMIN_API_KEYS=admin-local-dev
ADMIN_API_KEYS=owner:owner-key,admin:ops-key,viewer:readonly-key
```

裸 Key 默认是 `owner`。角色权限：

- `viewer`：只读后台数据。
- `admin`：管理模型路由和 API Key 名称/状态，创建充值订单。
- `owner`：拥有全部权限，可修改余额、供应商密钥、充值订单状态。

## 商业化 MVP 能力

- 模型路由：对外模型名映射到上游模型名，并配置输入/输出 token 单价。
- 计费：余额仍使用整数 credit；非流式请求会解析上游 `usage` 并按每 100 万 token 单价扣费，流式请求先扣 1 credit 最低费用。
- 充值预留：后台可创建充值订单，`owner` 标记 paid 后自动增加 API Key 余额并写余额流水。
- 审计：后台写操作会记录管理员、角色、动作、对象、脱敏变更摘要、IP 和 User-Agent。
- 日志：调用日志保存状态码、耗时、token、费用和错误摘要，不保存完整 prompt 或完整密钥。
- 健康检查：公开 `/health` 保持简版；`/admin/health` 展示 PostgreSQL、Redis、供应商配置和最近失败率。

## 常用验证

```bash
curl http://localhost:3000/health
curl http://localhost:3000/v1/models
curl -H "Authorization: Bearer sk-local-dev" http://localhost:3000/dashboard/me
curl -H "Authorization: Bearer admin-local-dev" http://localhost:3000/admin/me
curl -H "Authorization: Bearer admin-local-dev" http://localhost:3000/admin/health
```

调用转发接口：

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-local-dev" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}"
```

## 数据库与迁移

本地状态保存在：

```text
PostgreSQL: localhost:5432
Redis: localhost:6379
```

供应商 Key 使用 `APP_SECRET` 通过 AES-GCM 加密后保存到 PostgreSQL。正式部署前必须替换 `.env` 里的 `APP_SECRET`，并配置真实上游：

```env
OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=你的上游供应商 Key
```

如果之前存在 `data/state.json`，迁移后可导入一次：

```bash
npm run db:import-state
```

## 测试与构建

```bash
npm test
npm run typecheck
npm run build:api
npm run build:admin
```

## 生产部署准备

生产 Compose 示例：

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

上线前检查：

- 替换 `APP_SECRET`、`ADMIN_API_KEYS`、`RELAY_API_KEYS`、`POSTGRES_PASSWORD`。
- 配置真实 `OPENAI_COMPAT_BASE_URL` 和 `OPENAI_COMPAT_API_KEY`。
- 执行 `npm run prisma:migrate` 或在部署流程中应用 Prisma migration。
- 在反向代理中配置 HTTPS、请求体大小限制和访问日志。
- 定期运行 PostgreSQL 备份脚本。

备份：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-postgres.ps1
```

恢复：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-postgres.ps1 -BackupPath data/backups/ai_relay-YYYYMMDD-HHMMSS.dump
```

## 后续阶段

- 多供应商路由：供应商优先级、权重、失败重试和自动切换。
- 支付接入：为充值订单增加真实支付渠道回调、签名校验和对账。
- 管理员登录：从环境 Key 升级为管理员账号、密码哈希和会话。
- 告警：高频失败、余额异常、供应商连续错误通知。
