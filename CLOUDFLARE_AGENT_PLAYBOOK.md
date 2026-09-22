# Cloudflare × Agent 自动化全栈开发与部署手册 (Reusable Playbook)

> **版本**：v1.0.0  
> **适用场景**：AI Coding Agent / 独立开发者使用 GitHub 做版本管理，全面托管给 Cloudflare 免费全栈生态（Pages + Workers + D1 + R2 + AI）的标准化交付 SOP。

---

## 目录
1. [架构全景与职责分工](#一架构全景与职责分工)
2. [第一阶段：凭据配置与免密鉴权（一次性）](#二第一阶段凭据配置与免密鉴权一次性)
3. [第二阶段：前端规范与极简设计落地（DESIGN.md）](#三第二阶段前端规范与极简设计落地designmd)
4. [第三阶段：Agent 自动化无头部署流水线](#四第三阶段agent-自动化无头部署流水线)
5. [第四阶段：全栈边缘服务扩展模式（D1 / R2 / AI）](#五第四阶段全栈边缘服务扩展模式d1--r2--ai)
6. [第五阶段：高频避坑指南 (Critical Gotchas)](#六第五阶段高频避坑指南-critical-gotchas)

---

## 一、架构全景与职责分工

| 基础设施层 | 负责平台 | 核心职责 | 免费额度 / 成本 |
| :--- | :--- | :--- | :--- |
| **代码与版本控制** | **GitHub** | 源码存储、Git 历史追溯、分支管理、Issue/PR | 100% 免费 |
| **全球边缘分发** | **Cloudflare Pages** | 静态资产托管、全球 Anycast CDN、自动 SSL | **无限流量 (Unlimited)** |
| **轻量后端 / 路由** | **Hono.js on Functions** | API 路由、CORS 拦截、流式转发 (SSE) | 每天 100,000 次请求 |
| **关系型数据存储** | **Cloudflare D1** | 业务记录、文章浏览量、点赞、会话状态 | 5GB 存储 / 每天 500 万行读 |
| **非结构化对象存储** | **Cloudflare R2** | 图床、大图、论文 PDF、模型文件 | 10GB 存储 / **免出站流量费** |
| **边缘智能推理** | **Workers AI** | 本地运行 Llama 3 / Qwen / DeepSeek-R1-Distill | 每天赠送计算神经元 (Neurons) |

---

## 二、第一阶段：凭据配置与免密鉴权（一次性）

Agent 要实现完全“零人工干预”编排 Cloudflare，核心在于**环境变量鉴权**。

### 1. API Token 最小高权权限矩阵
在 Cloudflare 仪表盘创建自定义 API Token 时，必须配置以下权限：

- **Account 权限**：
  - `Cloudflare Pages: Edit` (页面部署)
  - `Workers Scripts: Edit` (边缘脚本)
  - `D1: Edit` (关系数据库)
  - `Workers R2 Storage: Edit` (对象存储)
  - `Workers AI: Edit` / `Run` (模型推理)
  - `Vectorize: Edit` (向量检索)
  - `Workers KV Storage: Edit` (键值缓存)
- **Zone 权限**：
  - `Workers Routes: Edit`
- **资源范围 (Resources)**：
  - `Account Resources` -> `All accounts`
  - `Zone Resources` -> `All zones`
- **TTL 与 IP 过滤**：
  - 均**保持留空**（永久有效且不受动态 IP 变动影响）。

### 2. 自动化探测 Account ID
只需持有 Token，Agent 即可通过 API 自动化静默提取 Account ID，无需用户在控制台手动查找：
```bash
# 验证 Token
curl -s -X GET "https://api.cloudfare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>"

# 提取 Account ID
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" \
     -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>"
```

### 3. 环境持久化
在系统的环境变量或 CI/CD 环境中导出：
```bash
export CLOUDFLARE_API_TOKEN="<你的_TOKEN>"
export CLOUDFLARE_ACCOUNT_ID="<你的_ACCOUNT_ID>"
```

---

## 三、第二阶段：前端规范与极简设计落地（DESIGN.md）

以本次 **Apple 极简风格 AI Agent 博客** 为标杆，前端开发必须坚守以下规范：

1. **安装规范源**：
   ```bash
   npx -y getdesign@latest add apple
   ```
2. **设计令牌 (Tokens) 核心约束**：
   - **交互唯一色 (Action Blue)**：`#0066cc`（深色块下使用 `#2997ff`），严禁引入第二品牌高亮色。
   - **色块节奏律动**：纯白 (`#ffffff`) ↔ 羊皮纸灰 (`#f5f5f7`) ↔ 瓷黑 (`#272729`) 交替排布，以色块切换作为自然分割带，杜绝多余渐变与装饰边框。
   - **Apple Tight 负字距**：大标题与 Hero 文本设定 `-0.28px` 至 `-0.374px` 的负跟踪间距；正文字号坚持 **17px**（而非 16px）。
   - **唯一阴影原则**：卡片与按钮一律平铺无阴影，仅为硬件级渲染构件赋予单一专属投影 `0 24px 60px -12px rgba(0, 0, 0, 0.22)`。
   - **SVG Favicon**：必须采用 Apple iOS 连续曲率超椭圆（Squircle，`rx="14"`）作为底座。
3. **中英双语架构 (i18n)**：
   - 数据字典式分层（`zh` / `en`）；
   - 使用 `data-i18n` 属性配合 `localStorage` 实现无刷新平滑切换；
   - 包含针对长篇 Markdown 文章的沉浸式弹出阅读器（Reader Drawer）。

---

## 四、第三阶段：Agent 自动化无头部署流水线

Agent 在命令行内执行部署时，必须遵循非阻塞、静默操作原则：

### 1. 验证 Wrangler CLI
```bash
npx -y wrangler --version
```

### 2. Pages 项目一键创建与发布
```bash
cd <项目目录>

# 1. 创建 Pages 项目（存在时忽略报错继续执行）
npx -y wrangler pages project create <project-name> --production-branch main || true

# 2. 静默全球发布
npx -y wrangler pages deploy . --project-name=<project-name> --commit-dirty=true
```

### 3. GitHub 与 Cloudflare 双轨同步标准
```bash
# 提交代码至 GitHub 仓库
git add .
git commit -m "feat: updates"
git push origin main

# 部署至 Cloudflare Pages 边缘节点
npx -y wrangler pages deploy . --project-name=<project-name> --commit-dirty=true
```

---

## 五、第四阶段：全栈边缘服务扩展模式（D1 / R2 / AI）

当需要为静态页面挂载全栈能力时，遵循以下模板模式：

### 1. 目录架构升级为全栈 Pages
在项目根目录下创建 `/functions` 目录，Cloudflare Pages 会自动将其编译为边缘 API：
```text
my-project/
├── index.html            # 前端展示
├── favicon.svg           # 图标
├── wrangler.json         # 资源绑定描述文件
└── functions/
    └── api/
        ├── [[route]].ts  # Hono.js 统一轻后端路由
        └── chat.ts       # 边缘 AI 流式对话接口
```

### 2. D1 数据库生命周期（无交互模式）
```bash
# 1. 创建数据库（记录返回的 database_id）
npx -y wrangler d1 create blog-db --json

# 2. 执行本地 SQL 测试验证（-y 必须显式声明）
npx -y wrangler d1 execute blog-db --local --file=./schema.sql -y

# 3. 部署生产环境数据表
npx -y wrangler d1 execute blog-db --remote --file=./schema.sql -y
```

### 3. 统一资源绑定声明 (`wrangler.json`)
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
      "database_id": "<从第一步获取的ID>"
    }
  ],
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "blog-assets"
    }
  ],
  "ai": {
    "binding": "AI"
  }
}
```

### 4. 边缘后端原生免密调用范式 (`functions/api/chat.ts`)
```typescript
interface Env {
  DB: D1Database;
  AI: any;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const { prompt } = await request.json();

  // 1. 调用边缘 GPU 模型生成回复 (流式)
  const stream = await env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
    prompt,
    stream: true
  });

  // 2. 异步将审计日志写入 D1 SQL
  context.waitUntil(
    env.DB.prepare('INSERT INTO logs (prompt, created_at) VALUES (?, ?)')
      .bind(prompt, Date.now())
      .run()
  );

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream' }
  });
};
```

---

## 六、第五阶段：高频避坑指南 (Critical Gotchas)

1. **CPU Execution Time ≠ Wall Clock Time**：
   - Workers 免费层的 CPU 时间限制为 10ms ~ 50ms。
   - **关键认知**：等待大模型流式生成、等待网络请求、读取 D1/R2 的时间**属于 I/O 等待，不计入 CPU 时间**。避免在单次请求里执行密集的本地加解密或大数组多重循环即可。
2. **避免命令行交互阻塞**：
   - Agent 执行任何 D1 操作必须附加 `-y` / `--yes` 参数；
   - 写入敏感环境变量使用管道：`echo "$SECRET" | npx wrangler secret put KEY`。
3. **Node.js 兼容标志必须开启**：
   - 依赖外部 npm 包时，务必在配置中指定 `"compatibility_flags": ["nodejs_compat"]`。
4. **流式传输必须返回 `ReadableStream`**：
   - 对接大模型打字机效果时，直接透传流式对象，严禁在后端 `await` 拼成完整长字符串再响应。

---

*手册沉淀自实际项目：`https://github.com/hirohana77/ai-agent-blog`*  
*生产线上验证：`https://ai-agent-blog.pages.dev/`*
