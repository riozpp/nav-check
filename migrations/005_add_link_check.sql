-- 添加书签链接有效性检测相关字段
ALTER TABLE bookmarks ADD COLUMN check_status TEXT DEFAULT '';
ALTER TABLE bookmarks ADD COLUMN check_code INTEGER DEFAULT NULL;
ALTER TABLE bookmarks ADD COLUMN check_time TEXT DEFAULT '';
