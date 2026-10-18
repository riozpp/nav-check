-- 为分类表添加 is_private 字段以支持私密分类
-- Add is_private field to categories table to support private categories
ALTER TABLE categories ADD COLUMN is_private INTEGER DEFAULT 0;

-- 创建索引以提升查询性能
-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_categories_private 
ON categories(is_private);

