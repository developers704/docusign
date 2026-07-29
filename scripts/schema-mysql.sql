-- Valliani Agreements — MySQL / MariaDB schema
-- Run inside database: vallian1_valliani_esign (phpMyAdmin → select DB → SQL tab)
-- Charset: utf8mb4

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS offices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  brand_color VARCHAR(32) NOT NULL DEFAULT '#130032',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_offices_slug (slug),
  KEY idx_offices_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  office_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  password_salt VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  last_login_at DATETIME(3) NULL,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_office (office_id),
  CONSTRAINT fk_users_office FOREIGN KEY (office_id) REFERENCES offices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS smtp_settings (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL DEFAULT 465,
  secure TINYINT(1) NOT NULL DEFAULT 1,
  user_name VARCHAR(255) NOT NULL,
  pass_value TEXT NOT NULL,
  from_address VARCHAR(512) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS template_folders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  office_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'my',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY idx_folders_office (office_id),
  CONSTRAINT fk_folders_office FOREIGN KEY (office_id) REFERENCES offices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS templates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  office_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(512) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  visibility VARCHAR(32) NOT NULL DEFAULT 'office',
  payload LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY idx_templates_office (office_id),
  KEY idx_templates_status (status),
  CONSTRAINT fk_templates_office FOREIGN KEY (office_id) REFERENCES offices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS template_folder_links (
  template_id CHAR(36) NOT NULL,
  folder_id CHAR(36) NOT NULL,
  PRIMARY KEY (template_id, folder_id),
  KEY idx_tfl_folder (folder_id),
  CONSTRAINT fk_tfl_template FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE CASCADE,
  CONSTRAINT fk_tfl_folder FOREIGN KEY (folder_id) REFERENCES template_folders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS envelopes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  office_id CHAR(36) NOT NULL,
  envelope_number VARCHAR(64) NOT NULL,
  title VARCHAR(512) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  payload LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_envelopes_number (envelope_number),
  KEY idx_envelopes_office (office_id),
  KEY idx_envelopes_status (status),
  CONSTRAINT fk_envelopes_office FOREIGN KEY (office_id) REFERENCES offices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipients (
  id CHAR(36) NOT NULL PRIMARY KEY,
  envelope_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  signing_order INT NOT NULL DEFAULT 1,
  token_hash VARCHAR(128) NULL,
  payload LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY idx_recipients_envelope (envelope_id),
  KEY idx_recipients_email (email),
  KEY idx_recipients_token (token_hash),
  CONSTRAINT fk_recipients_envelope FOREIGN KEY (envelope_id) REFERENCES envelopes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  office_id CHAR(36) NULL,
  envelope_id CHAR(36) NULL,
  recipient_id CHAR(36) NULL,
  event_type VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  payload LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY idx_audit_office (office_id),
  KEY idx_audit_envelope (envelope_id),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS powerforms (
  id CHAR(36) NOT NULL PRIMARY KEY,
  office_id CHAR(36) NOT NULL,
  template_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  payload LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_powerforms_slug (slug),
  KEY idx_powerforms_office (office_id),
  CONSTRAINT fk_powerforms_office FOREIGN KEY (office_id) REFERENCES offices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webforms (
  id CHAR(36) NOT NULL PRIMARY KEY,
  office_id CHAR(36) NOT NULL,
  template_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  payload LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_webforms_slug (slug),
  KEY idx_webforms_office (office_id),
  CONSTRAINT fk_webforms_office FOREIGN KEY (office_id) REFERENCES offices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Quick check: you should see these tables in phpMyAdmin after running.
-- SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE();
