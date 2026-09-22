// Cloudflare Pages Functions - Admin Posts & Agent Copilot API

interface Env {
  DB?: D1Database;
  MEDIA?: R2Bucket;
  AI?: any;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  // Set standard CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. GET /api/admin/posts - List articles or get single article
    if (method === 'GET') {
      const slug = url.searchParams.get('slug');

      // If slug provided, return article details + R2 Markdown content
      if (slug) {
        let meta = null;
        let contentZh = '';
        let contentEn = '';

        if (env.DB) {
          meta = await env.DB.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first();
        }

        if (env.MEDIA) {
          const zhObj = await env.MEDIA.get(`posts/${slug}/zh.md`);
          if (zhObj) contentZh = await zhObj.text();
          const enObj = await env.MEDIA.get(`posts/${slug}/en.md`);
          if (enObj) contentEn = await enObj.text();
        }

        return new Response(JSON.stringify({
          success: true,
          data: { meta, contentZh, contentEn }
        }), { headers: corsHeaders });
      }

      // Default: List all posts from D1
      if (env.DB) {
        const { results } = await env.DB.prepare(
          'SELECT id, slug, title_zh, title_en, summary_zh, summary_en, category, status, word_count, read_time_min, updated_at FROM posts ORDER BY updated_at DESC'
        ).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: corsHeaders });
      }

      // Mock fallback if DB binding not yet provisioned
      return new Response(JSON.stringify({
        success: true,
        data: [
          {
            id: "post-1",
            slug: "why-single-turn-react-fails",
            title_zh: "为什么单轮 ReAct 在复杂企业生产环境中必然失败",
            title_en: "Why Single-Turn ReAct Fails in Enterprise Environments",
            category: "Architecture",
            status: "published",
            word_count: 2400,
            read_time_min: 8,
            updated_at: Date.now() - 86400000 * 2
          },
          {
            id: "post-2",
            slug: "zero-error-bash-tool-calling",
            title_zh: "零事故终端执行：带有推测守卫的 Tool 架构",
            title_en: "Zero-Error Tool Execution with Speculative Guards",
            category: "Tool Grounding",
            status: "published",
            word_count: 3100,
            read_time_min: 12,
            updated_at: Date.now() - 86400000 * 7
          },
          {
            id: "post-3",
            slug: "structured-working-memory",
            title_zh: "向量检索不是记忆：构建真正结构化的工作上下文",
            title_en: "Vector DBs are Not Memory: Structured Working Context",
            category: "Memory",
            status: "draft",
            word_count: 1850,
            read_time_min: 6,
            updated_at: Date.now() - 86400000 * 12
          }
        ]
      }), { headers: corsHeaders });
    }

    // 2. POST /api/admin/posts - Save article (D1 metadata + R2 markdown raw text)
    if (method === 'POST') {
      const body: any = await request.json();
      const {
        id = `post-${Date.now()}`,
        slug,
        title_zh,
        title_en,
        summary_zh,
        summary_en,
        category = 'Architecture',
        tags = '[]',
        status = 'draft',
        content_zh = '',
        content_en = ''
      } = body;

      if (!slug || !title_zh || !title_en) {
        return new Response(JSON.stringify({
          success: false,
          error: "Missing required fields: slug, title_zh, title_en"
        }), { status: 400, headers: corsHeaders });
      }

      const now = Date.now();
      const wordCount = content_zh.length + content_en.length;
      const readTime = Math.max(1, Math.ceil(wordCount / 400));

      // Save to D1
      if (env.DB) {
        await env.DB.prepare(`
          INSERT INTO posts (id, slug, title_zh, title_en, summary_zh, summary_en, category, tags, status, word_count, read_time_min, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            title_zh = excluded.title_zh,
            title_en = excluded.title_en,
            summary_zh = excluded.summary_zh,
            summary_en = excluded.summary_en,
            category = excluded.category,
            tags = excluded.tags,
            status = excluded.status,
            word_count = excluded.word_count,
            read_time_min = excluded.read_time_min,
            updated_at = excluded.updated_at
        `).bind(
          id, slug, title_zh, title_en, summary_zh, summary_en,
          category, typeof tags === 'string' ? tags : JSON.stringify(tags),
          status, wordCount, readTime, now, now
        ).run();
      }

      // Save Markdown text to R2
      if (env.MEDIA) {
        await env.MEDIA.put(`posts/${slug}/zh.md`, content_zh, {
          httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
        });
        await env.MEDIA.put(`posts/${slug}/en.md`, content_en, {
          httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Article and Markdown content saved successfully to D1 & R2",
        data: { id, slug, status, wordCount, readTime, updated_at: now }
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || "Internal server error"
    }), { status: 500, headers: corsHeaders });
  }
};
