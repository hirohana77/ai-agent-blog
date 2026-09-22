-- Cloudflare D1 Database Schema for Blog Post Management

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title_zh TEXT NOT NULL,
  title_en TEXT NOT NULL,
  summary_zh TEXT,
  summary_en TEXT,
  category TEXT DEFAULT 'Architecture',
  tags TEXT DEFAULT '[]', -- JSON array of tags
  status TEXT CHECK(status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  read_time_min INTEGER DEFAULT 5,
  word_count INTEGER DEFAULT 0,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexing for fast search and listing
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Version snapshots for Agent editing history & rollback
CREATE TABLE IF NOT EXISTS post_revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  changed_by TEXT DEFAULT 'agent', -- 'user' or 'agent'
  change_summary TEXT,
  snapshot_r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_revisions_post_id ON post_revisions(post_id);
