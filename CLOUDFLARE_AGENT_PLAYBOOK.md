# Cloudflare × Agent 自动化运维与全托管部署手册 (Agent Execution Playbook)

> **目标**：本手册专为 AI Coding Agent（后续开发接力）准备。Agent 读取本文档后，可**零人工介入**接管整个项目的环境准备、Git 版本控制、Cloudflare 资源编排（Pages / Workers / D1 / R2 / AI）与线上自动化部署。

---

## 一、预置环境与认证凭据 (Pre-configured Credentials)

本项目已在项目根目录创建本地凭据环境文件 `.cloudflare.env`（已加入 `.gitignore` 避免公开泄露被拦截），同时账户信息已明文记录。

Agent 在任何新会话或子任务启动时，**执行以下命令即可静默注入认证**：

```bash
# 方式一：直接加载本地预置环境变量（推荐）
if [ -f .cloudflare.env ]; then
  source .cloudflare.env
fi

# 方式二：手动声明凭据
# Cloudflare 账户唯一标识
export CLOUDFLARE_ACCOUNT_ID="3bdc485f32fa857bc24a937f69418177"
# Cloudflare API Token 存放于项目根目录 .cloudflare.env 中，具备 Pages、Workers、D1、R2、AI、KV 等完整权限
```

### 凭据自检命令 (Agent 预检)
```bash
# 验证令牌是否有效
curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

---

## 二、Git 与版本控制自动化 SOP

项目源码统一使用 GitHub 作为唯一真实源（Single Source of Truth），Agent 执行代码更新与发布时必须遵循以下静默流程：

```bash
# 1. 查看改动
git status

# 2. 暂存与提交
git add .
git commit -m "<清晰的语义化提交信息，如 feat: update api / fix: resolve bug>"

# 3. 推送主分支
git push origin main
```

---

## 三、Cloudflare Pages 静态与全栈部署 SOP

本项目在 Cloudflare Pages 中的项目名称为：`ai-agent-blog`。

### 1. 部署生产环境
Agent 在完成代码修改或打包后，进入项目根目录直接执行：
```bash
# 静态资源或打包产物发布（若有 build 产物则替换为 dist 目录）
npx -y wrangler pages deploy . --project-name=ai-agent-blog --commit-dirty=true
```

### 2. Pages 项目初始化命令（若在全新仓库部署新项目）
```bash
npx -y wrangler pages project create <新项目名> --production-branch main || true
```

### 3. 查看部署历史与线上状态
```bash
# 获取最近部署的预览链接与状态
npx -y wrangler pages deployment list --project-name=ai-agent-blog
```

---

## 四、全栈边缘资源编排命令集 (Agent Headless Cheatsheet)

Agent 如需为项目增加数据库、存储桶或 AI 能力，**必须使用非交互参数（`-y` 或 `--json`）**，严禁触发阻塞式终端确认：

### 1. Cloudflare D1 关系数据库 (SQLite)
```bash
# 1. 创建数据库并获取 database_id
npx -y wrangler d1 create <db-name> --json

# 2. 本地仿真执行 SQL 文件验证
npx -y wrangler d1 execute <db-name> --local --file=./schema.sql -y

# 3. 生产环境执行 SQL 迁移（必须带 -y）
npx -y wrangler d1 execute <db-name> --remote --file=./schema.sql -y

# 4. 执行单条 SQL 查询排查数据
npx -y wrangler d1 execute <db-name> --remote --command="SELECT * FROM table_name LIMIT 5;" -y
```

### 2. Cloudflare R2 对象存储 (免出站流量费)
```bash
# 1. 创建存储桶
npx -y wrangler r2 bucket create <bucket-name>

# 2. 查看存储桶列表
npx -y wrangler r2 bucket list

# 3. 管理端上传测试文件
npx -y wrangler r2 object put <bucket-name>/<file-path> --file=./local-file.png
```

### 3. Workers KV (键值对快速缓存)
```bash
# 1. 创建命名空间
npx -y wrangler kv namespace create <namespace-name> --json

# 2. 写入与读取缓存键值
npx -y wrangler kv key put --binding=<BINDING_NAME> "my-key" "my-value"
npx -y wrangler kv key get --binding=<BINDING_NAME> "my-key"
```

### 4. 敏感秘钥管理 (Secrets)
严禁使用交互式 `wrangler secret put`，Agent 必须通过标准输入管道静默写入：
```bash
echo "<API_KEY_VALUE>" | npx -y wrangler secret put <SECRET_NAME>
```

---

## 五、全栈 Pages 架构规范 (Pages Functions)

当项目从纯静态拓展为“全栈应用”时，Agent 必须遵循 Cloudflare Pages Functions 目录标准：

### 1. 目录结构
```text
project-root/
├── .cloudflare.env        # 本地免密环境变量 (已 gitignore)
├── wrangler.json          # 边缘资源绑定声明
├── functions/             # 自动识别为边缘 API 路由
│   └── api/
│       ├── [[route]].ts   # Hono.js 统一后端路由
│       └── chat.ts        # 针对特定接口的函数
└── public/ (或根目录)     # 前端静态 HTML/CSS/JS
```

### 2. 配置文件标准 (`wrangler.json`)
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ai-agent-blog",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "blog-db",
      "database_id": "<从创建命令获取的D1_ID>"
    }
  ],
  "r2_buckets": [
    {
      "binding": "MEDIA",
      "bucket_name": "blog-assets"
    }
  ],
  "ai": {
    "binding": "AI"
  }
}
```

### 3. 边缘后端免密调用范式 (`functions/api/example.ts`)
```typescript
interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  AI: any;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await request.json();

  // 1. 调用边缘 GPU 跑大模型 (零 API Key，原生通信)
  const aiStream = await env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
    prompt: body.prompt,
    stream: true
  });

  // 2. 写入 D1 数据库
  await env.DB.prepare('INSERT INTO logs (prompt, time) VALUES (?, ?)')
    .bind(body.prompt, Date.now())
    .run();

  return new Response(aiStream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
};
```

---

## 六、日常自动化开发闭环脚本 (Agent 复制即用)

Agent 每次完成开发后，执行以下组合命令即可完成“源码同步 + 边缘生产发布”：

```bash
# 1. 注入凭据
source .cloudflare.env

# 2. 提交至 Git
git add .
git commit -m "feat: automated feature delivery by agent"
git push origin main

# 3. 部署至 Cloudflare 边缘节点
npx -y wrangler pages deploy . --project-name=ai-agent-blog --commit-dirty=true
```

---

## 七、关键运行规则与避坑约定 (Gotchas)

1. **绝对禁止交互阻断**：所有 D1 执行带 `-y`，所有密钥写入走管道，所有创建带 `--json` 或 `|| true`。
2. **CPU 限额与 I/O 等待**：免费版纯 CPU 执行上限为 10ms~50ms；但**所有大模型流式生成等待、D1 查询、R2 读取均属于 I/O，不计入 CPU 时间**。
3. **Node.js 兼容标志必须开启**：后端代码若引用 Node 标准库，必须确保配置包含 `"compatibility_flags": ["nodejs_compat"]`。
4. **实时流式标准**：处理大模型交互一律直接透传 `ReadableStream`，严禁在后端内存中长时间 `await` 拼装全文字符串。
