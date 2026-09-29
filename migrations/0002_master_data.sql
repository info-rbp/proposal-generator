PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS brands(
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN('internal','client')),
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  abn TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  primary_colour TEXT NOT NULL DEFAULT '#123b3a',
  secondary_colour TEXT NOT NULL DEFAULT '#ffffff',
  accent_colour TEXT NOT NULL DEFAULT '#d9a441',
  text_colour TEXT NOT NULL DEFAULT '#172322',
  font_family TEXT NOT NULL DEFAULT 'Inter',
  cover_style TEXT NOT NULL DEFAULT 'standard',
  default_prepared_by TEXT NOT NULL DEFAULT '',
  default_terms TEXT NOT NULL DEFAULT '',
  logo_asset_id TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS brands_name_idx ON brands(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS brands_type_idx ON brands(type,archived);

CREATE TABLE IF NOT EXISTS clients(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trading_name TEXT NOT NULL DEFAULT '',
  abn TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  default_brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'AUD' CHECK(currency IN('AUD','NZD','USD','GBP','EUR')),
  payment_terms TEXT NOT NULL DEFAULT '',
  validity_days INTEGER NOT NULL DEFAULT 30,
  notes TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  account_manager TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clients_name_idx ON clients(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS clients_active_idx ON clients(archived,name);

CREATE TABLE IF NOT EXISTS templates(
  id TEXT PRIMARY KEY,
  parent_template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK(kind IN('proposal','tender-response','rfq','capability')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS templates_scope_idx ON templates(active,client_id,brand_id,kind);
CREATE INDEX IF NOT EXISTS templates_parent_idx ON templates(parent_template_id);

CREATE TABLE IF NOT EXISTS content_library(
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_library_scope_idx ON content_library(active,brand_id,client_id);

CREATE TABLE IF NOT EXISTS clause_library(
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clause_library_scope_idx ON clause_library(active,brand_id,client_id);

CREATE TABLE IF NOT EXISTS pricing_library(
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'item',
  rate TEXT NOT NULL DEFAULT '0.00',
  currency TEXT NOT NULL DEFAULT 'AUD' CHECK(currency IN('AUD','NZD','USD','GBP','EUR')),
  tax_bps INTEGER NOT NULL DEFAULT 1000,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pricing_library_scope_idx ON pricing_library(active,brand_id,client_id);
