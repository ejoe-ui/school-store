-- Product photo storage -- same access model as the student-photos bucket
-- (this app never logs into Supabase Auth, so all access is via the anon
-- key + these policies, not RLS on the tables themselves).
insert into storage.buckets (id, name, public)
  values ('product-photos', 'product-photos', false)
  on conflict (id) do nothing;

create policy "Allow anon upload to product-photos"
  on storage.objects for insert to anon
  with check (bucket_id = 'product-photos');

create policy "Allow anon update to product-photos"
  on storage.objects for update to anon
  using (bucket_id = 'product-photos');

create policy "Allow anon select from product-photos"
  on storage.objects for select to anon
  using (bucket_id = 'product-photos');
