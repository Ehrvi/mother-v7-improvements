-- MOTHER v49.0: Native Authentication System
-- Adds passwordHash, username, and status columns to users table for email/password auth
-- Uses bcrypt for password hashing (OWASP recommended, cost factor 12)

-- Add passwordHash column (nullable - existing OAuth users won't have it)
ALTER TABLE users ADD COLUMN passwordHash varchar(255) NULL AFTER email;

-- Add username column for display purposes
ALTER TABLE users ADD COLUMN username varchar(64) NULL AFTER name;

-- Add status column: 'active' for approved users, 'pending' for awaiting approval
-- First registered user (admin) gets 'active' automatically
ALTER TABLE users ADD COLUMN status ENUM('active', 'pending', 'rejected') NOT NULL DEFAULT 'pending' AFTER role;

-- Make openId nullable (native auth users use a generated openId prefix)
ALTER TABLE users MODIFY COLUMN openId varchar(64) NULL;

-- Add unique index on email for native auth lookup
ALTER TABLE users ADD UNIQUE INDEX idx_users_email_unique (email);
