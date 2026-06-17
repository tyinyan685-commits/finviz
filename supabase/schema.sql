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
