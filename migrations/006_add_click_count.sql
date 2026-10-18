-- 书签点击计数（用于「最常用」排序与热门榜）
ALTER TABLE bookmarks ADD COLUMN click_count INTEGER DEFAULT 0;
ALTER TABLE bookmarks ADD COLUMN last_clicked_at TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_bookmarks_click_count ON bookmarks(click_count);
