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
