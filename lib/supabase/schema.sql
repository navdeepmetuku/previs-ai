-- ─────────────────────────────────────────────────────────────────────────────
-- PREVIS-AI — Supabase schema (Phase 13)
--
-- Run this once in Supabase Studio → SQL Editor.
-- Free tier covers everything below comfortably.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── scene_images ────────────────────────────────────────────────────────────
-- One row per generated image. Multiple rows per scene_id supports versioning.
-- The "active" row for a scene is the one with the highest created_at.
create table if not exists public.scene_images (
  id           uuid             primary key default gen_random_uuid(),
  project_id   text             not null,
  scene_id     text             not null,
  image_url    text             not null,            -- data URL or remote CDN URL
  prompt       text,
  provider     text,                                  -- "Pollinations/FLUX" | "fal.ai/FLUX.1-schnell" | "Replicate/FLUX.1-schnell"
  model        text,
  tier         text,                                  -- "draft" | "standard" | "premium"
  bytes        integer,
  duration_ms  integer,
  is_active    boolean          not null default true,
  created_at   timestamptz      not null default now()
);

create index if not exists scene_images_scene_idx
  on public.scene_images (scene_id, created_at desc);

create index if not exists scene_images_project_idx
  on public.scene_images (project_id, created_at desc);

-- ── RLS: open for anon (this is a local-first single-tenant app) ────────────
-- If you later add auth, tighten these policies.
alter table public.scene_images enable row level security;

drop policy if exists "anon read"   on public.scene_images;
drop policy if exists "anon write"  on public.scene_images;
drop policy if exists "anon update" on public.scene_images;
drop policy if exists "anon delete" on public.scene_images;

create policy "anon read"   on public.scene_images for select using (true);
create policy "anon write"  on public.scene_images for insert with check (true);
create policy "anon update" on public.scene_images for update using (true) with check (true);
create policy "anon delete" on public.scene_images for delete using (true);
