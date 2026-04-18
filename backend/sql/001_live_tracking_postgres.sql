create extension if not exists pgcrypto;

create table if not exists live_streamer_state (
  streamer_id text primary key,
  tiktok_username text not null,
  is_live boolean not null default false,
  viewer_count integer not null default 0,
  followers_count integer not null default 0,
  checked_at timestamptz not null,
  source text not null,
  raw_snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists live_stream_sessions (
  id uuid primary key default gen_random_uuid(),
  streamer_id text not null,
  source text not null,
  status text not null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  peak_viewer_count integer not null default 0,
  current_viewer_count integer not null default 0,
  like_count integer not null default 0,
  gift_count integer not null default 0,
  message_count integer not null default 0,
  raw_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_stream_sessions_streamer_status_idx
  on live_stream_sessions(streamer_id, status, started_at desc);

create table if not exists live_stream_events (
  id uuid primary key default gen_random_uuid(),
  stream_session_id uuid null references live_stream_sessions(id) on delete cascade,
  streamer_id text not null,
  event_type text not null,
  source text not null,
  viewer_id text null,
  external_viewer_id text null,
  event_timestamp timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists live_stream_events_streamer_timestamp_idx
  on live_stream_events(streamer_id, event_timestamp desc);