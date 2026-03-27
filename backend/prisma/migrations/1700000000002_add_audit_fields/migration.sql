-- Migration: Add audit fields for tracking
-- Created: 2024-11-15

-- Add audit fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

-- Add audit fields to refresh_tokens table
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- Add audit fields to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- Add audit fields to device_fingerprints table
ALTER TABLE device_fingerprints ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE device_fingerprints ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
