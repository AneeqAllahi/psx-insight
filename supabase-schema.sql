create table if not exists public.news_articles (
  url text primary key,
  headline text not null,
  category text not null,
  published_at timestamptz not null,
  summary text not null,
  full_text text not null,
  symbols text[] not null default '{}',
  source text,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_articles_published_at_idx
  on public.news_articles (published_at desc);

create index if not exists news_articles_symbols_idx
  on public.news_articles using gin (symbols);

create table if not exists public.news_metadata (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_news_articles_updated_at on public.news_articles;
create trigger set_news_articles_updated_at
before update on public.news_articles
for each row execute function public.set_updated_at();

drop trigger if exists set_news_metadata_updated_at on public.news_metadata;
create trigger set_news_metadata_updated_at
before update on public.news_metadata
for each row execute function public.set_updated_at();
