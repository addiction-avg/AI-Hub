# AI 中转站 Starter

这是一个从零搭建 AI 中转站的 MVP 后端骨架，先实现 OpenAI 兼容的 `/v1/chat/completions` 转发能力，并预留 API Key、模型映射、余额、限流、调用日志和 Docker 部署配置。

## 当前本地检测

已具备：

- Node.js 22 LTS
- npm
- Git
- Docker Desktop / Docker Compose
- PostgreSQL 16 容器
- Redis 7 容器

当前版本使用 PostgreSQL 保存 API Key、模型、供应商、余额和调用日志；使用 Redis 做 API Key 维度限流。

## 启动

要求：

```text
Node.js 22 LTS
Docker Desktop
```

```bash
npm install
copy .env.example .env
npm run dev:db
npm run prisma:migrate
npm run dev
```

默认服务地址：

```text
http://localhost:3000
```

管理后台：

```bash
npm run dev:admin
```

后台访问地址：

```text
http://localhost:3001
```

管理后台默认使用 `sk-local-dev` 连接本地 API。当前后台已支持：

- 新增、编辑模型路由。
- 配置 OpenAI 兼容供应商的 Base URL 和上游 API Key。
- 创建新的中转站 API Key。
- 修改 API Key 名称、状态和余额。
- 查看调用日志和基础统计。

本地 MVP 会把运行状态保存到：

```text
PostgreSQL: localhost:5432
Redis: localhost:6379
```

供应商 Key 会使用 `APP_SECRET` 通过 AES-GCM 加密后保存到 PostgreSQL。正式部署前请替换 `.env` 里的 `APP_SECRET`。

如果当前 PowerShell 仍提示找不到 `docker`，请关闭后重新打开终端；Docker Desktop 安装后 PATH 通常需要新终端才生效。

由于项目目录包含中文，Docker Compose 需要固定项目名：

```env
COMPOSE_PROJECT_NAME=ai-relay
```

这个值已经写入 `.env.example`。

## 数据迁移

如果之前已经生成过 `data/state.json`，可以在数据库迁移后导入一次：

```bash
npm run db:import-state
```

导入脚本不会删除 `data/state.json`，它只作为本地备份保留。

测试健康检查：

```bash
curl http://localhost:3000/health
```

测试可用模型：

```bash
curl http://localhost:3000/v1/models
```

测试用户信息：

```bash
curl -H "Authorization: Bearer sk-local-dev" http://localhost:3000/dashboard/me
```

## 调用转发接口

先在 `.env` 里配置真实上游：

```env
OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=你的上游供应商Key
```

然后请求：

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-local-dev" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}"
```

## 下一步

### 1. 管理后台安全

- 增加管理员登录，不再直接复用中转站 API Key 访问后台。
- 增加管理员角色：`owner`、`admin`、`viewer`。
- 增加后台操作审计日志，记录模型、供应商、余额、Key 状态变更。

### 2. 计费与用量

- 将当前“请求点数”升级为按 token 计费。
- 在模型表中增加输入/输出 token 单价。
- 从上游响应中解析 usage，并写入调用日志。
- 支持用户余额不足时提前拒绝请求。

### 3. 多供应商路由

- 支持多个 OpenAI 兼容供应商。
- 给模型配置供应商优先级、权重和启停状态。
- 增加失败重试和自动切换线路。
- 在后台展示每个供应商的成功率、平均延迟和错误数。

### 4. 风控与稳定性

- 增加按用户、API Key、IP、模型维度的限流策略。
- 增加日志脱敏，默认不保存完整 prompt。
- 增加异常请求告警：高频失败、余额异常、供应商连续错误。
- 增加健康检查：PostgreSQL、Redis、供应商连通性。

### 5. 部署准备

- 增加生产 Dockerfile / Compose 配置。
- 增加数据库备份和恢复脚本。
- 增加环境变量校验文档。
- 为正式上线准备 Nginx/Caddy 反向代理和 HTTPS 配置。
