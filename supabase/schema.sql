create table products (
  id bigint generated always as identity primary key,
  title text not null,
  image text,
  url text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table products enable row level security;

create policy "public read active" on products
  for select to anon using (is_active = true);

create policy "admin all" on products
  for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true);

create policy "admin upload images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images');
