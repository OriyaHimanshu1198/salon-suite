# 08 Website Content Management
Website offers and announcements.

## Current Implementation
- **site_content:** Key/value table for public site copy (hero, about, contact, policy, footer, social links).
- **offers:** Table with title, description, kind (percent/amount), value, code, dates, banner, emoji, linked services.
- **Admin UI:** `/api/admin/site` (GET/PATCH), `/api/admin/offers` (CRUD), `/api/admin/notice` (notice bar), `/api/admin/hours` (opening hours).
- **Public API:** `/api/public/site` returns all content + offers + services + staff + reviews + packages + hours.

## Gaps vs Target Platform
| Target Requirement | Current State | Gap |
|--------------------|---------------|-----|
| Draft/Preview/Publish/Schedule/Expire | ⚠️ Live edit only | No workflow, no versioning |
| Homepage Banners | ⚠️ Notice bar only | No hero carousel/banner manager |
| Promotional Images | ❌ | No image upload/storage |
| Staff Profiles | ⚠️ Read-only from staff table | No bio/image management for site |
| Treatment Descriptions | ⚠️ From services table | No rich text, no separate site copy |
| Announcements | ❌ | Not implemented |
| Loyalty Programme Info | ❌ | Not on public site |
| Decouple from Marketing | ✅ | Offers don't auto-send |

## Required Schema Changes
```sql
-- Website Content with Workflow
ALTER TABLE site_content ADD COLUMN status TEXT NOT NULL DEFAULT 'published'; -- draft, published, scheduled, expired
ALTER TABLE site_content ADD COLUMN scheduled_for TEXT;                     -- ISO timestamp
ALTER TABLE site_content ADD COLUMN expires_on TEXT;                        -- YYYY-MM-DD
ALTER TABLE site_content ADD COLUMN updated_by TEXT;
ALTER TABLE site_content ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- Announcements (new table)
CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',           -- HTML allowed (sanitised)
  type TEXT NOT NULL DEFAULT 'general',    -- general, new_treatment, holiday_hours, event, closure, availability, staff_news
  location TEXT NOT NULL DEFAULT 'banner', -- hero, banner, footer, sidebar, popup
  status TEXT NOT NULL DEFAULT 'draft',    -- draft, published, scheduled, expired
  scheduled_for TEXT,                      -- ISO timestamp
  expires_on TEXT,                         -- YYYY-MM-DD
  image_url TEXT,                          -- uploaded image
  link_url TEXT,                           -- CTA link
  link_text TEXT,                          -- CTA text
  priority INTEGER NOT NULL DEFAULT 0,     -- display order
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_announcements_status ON announcements(status, scheduled_for, expires_on);

-- Content Blocks (for modular homepage sections)
CREATE TABLE content_blocks (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,                -- e.g. 'hero', 'about', 'footer_note'
  label TEXT NOT NULL,                     -- admin label
  type TEXT NOT NULL DEFAULT 'richtext',   -- richtext, markdown, image, video, html
  content TEXT NOT NULL DEFAULT '',        -- JSON or HTML
  status TEXT NOT NULL DEFAULT 'published',-- draft, published, scheduled, expired
  scheduled_for TEXT,
  expires_on TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

-- Media Library (images)
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL
);
```

## Workflow
1. **Draft:** Admin edits in CMS → saved as `status='draft'`.
2. **Preview:** `/preview?key=...` or `/admin/preview` renders with draft content (authenticated only).
3. **Publish:** Click "Publish" → `status='published'`, `updated_at=now`.
4. **Schedule:** Set `scheduled_for` → status=`scheduled` → scheduler tick publishes at time.
5. **Expire:** Set `expires_on` → status=`expired` after date passes.
6. **Unpublish:** Set `status='draft'` → removed from public API.

## Public API Changes
- `/api/public/site` → only returns `status='published'` AND (`scheduled_for` is null OR <= now) AND (`expires_on` is null OR >= today).
- New: `/api/public/announcements` → active announcements for current date, ordered by priority.
- New: `/api/public/content-blocks` → published blocks for page assembly.

## Image Upload
- **Storage:** `public/uploads/` (local) or S3-compatible (configurable).
- **Endpoint:** `POST /api/admin/media` (multipart/form-data) → returns `{ id, url, width, height }`.
- **Sanitisation:** Resize >1920px, strip EXIF, convert to WebP.
- **CDN Ready:** Settings `media.base_url` (e.g., `https://cdn.lumiere-salon.co.uk`).

## Rich Text Editor
- **Admin:** TipTap or similar (lightweight, outputs sanitised HTML).
- **Allowed Tags:** `p, br, strong, em, u, a, ul, ol, li, h2, h3, blockquote, img`.
- **Sanitisation:** DOMPurify on server before save.

## Admin UI Sections
| Section | Tables | Actions |
|---------|--------|---------|
| Homepage | content_blocks (hero, about, stats) | Edit, Preview, Publish, Schedule |
| Offers | offers + offer_services | CRUD, link services, set dates, upload banner |
| Announcements | announcements | CRUD, type, location, priority, schedule, expire |
| Staff Profiles | staff + media | Edit bio, upload photo, set display order |
| Treatments | services | Rich description, category, pricing, images |
| Loyalty Info | content_blocks (loyalty) | Explain visit rewards, birthday treats |
| Hours | opening_hours | Per-day open/close/closed |
| Notice Bar | settings (site.notice_*) | Text, link, tone, active toggle |

## Settings Additions
```js
'media.storage': 'local',              // local | s3
'media.base_url': '',                  // CDN base if S3
'media.max_size_mb': '5',
'content.editor': 'tiptap',            // tiptap | markdown
'website.preview_secret': '',          // random token for unauthenticated preview links
```

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/content-blocks` | List all blocks |
| PATCH | `/api/admin/content-blocks/:key` | Update block (draft) |
| POST | `/api/admin/content-blocks/:key/publish` | Publish now |
| POST | `/api/admin/content-blocks/:key/schedule` | Schedule publish |
| POST | `/api/admin/content-blocks/:key/expire` | Set expiry |
| GET | `/api/admin/announcements` | List announcements |
| POST | `/api/admin/announcements` | Create announcement |
| PATCH | `/api/admin/announcements/:id` | Update |
| POST | `/api/admin/announcements/:id/publish` | Publish |
| POST | `/api/admin/announcements/:id/schedule` | Schedule |
| DELETE | `/api/admin/announcements/:id` | Delete |
| POST | `/api/admin/media` | Upload image |
| GET | `/api/admin/media` | List media |
| DELETE | `/api/admin/media/:id` | Delete media |
| GET | `/api/public/announcements` | Active announcements for site |
| GET | `/api/public/content-blocks` | Published blocks for site |