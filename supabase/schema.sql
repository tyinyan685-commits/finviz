create extension if not exists pgcrypto;

create table if not exists public.radar_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  preset_id text not null,
  preset_name text not null,
  generated_at timestamptz not null,
  stock_count integer not null default 0,
  data_quality jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_date, preset_id)
);

create table if not exists public.radar_candidates (
  run_id uuid not null references public.radar_runs(id) on delete cascade,
  run_date date not null,
  preset_id text not null,
  symbol text not null,
  name text,
  sector text,
  industry text,
  exchange text,
  rank integer,
  score numeric,
  price numeric,
  changes_percentage numeric,
  change_20d numeric,
  relative_volume numeric,
  market_cap numeric,
  pe numeric,
  reasons jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (run_date, preset_id, symbol)
);

create index if not exists radar_candidates_symbol_idx on public.radar_candidates(symbol);
create index if not exists radar_candidates_run_date_idx on public.radar_candidates(run_date desc);
create index if not exists radar_candidates_preset_idx on public.radar_candidates(preset_id, run_date desc);
create index if not exists radar_candidates_score_idx on public.radar_candidates(score desc);

create table if not exists public.stock_ratings (
  run_date date not null,
  symbol text not null,
  name text,
  score numeric,
  rating text,
  rating_en text,
  confidence numeric,
  fundamental_score numeric,
  technical_score numeric,
  sentiment_score numeric,
  model_version text,
  generated_at timestamptz not null,
  radar_preset_count integer not null default 0,
  radar_presets jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (run_date, symbol)
);

create index if not exists stock_ratings_symbol_idx on public.stock_ratings(symbol, run_date desc);
create index if not exists stock_ratings_score_idx on public.stock_ratings(run_date desc, score desc);
alter table public.stock_ratings enable row level security;
