-- 为书签 URL 添加索引以支持重复检测
-- Add index for bookmark URL to support duplicate detection
CREATE INDEX IF NOT EXISTS idx_bookmarks_url 
ON bookmarks(url);

