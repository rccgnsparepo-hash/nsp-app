
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_url text not null,
  type text not null default 'link' check (type in ('pdf', 'link')),
  created_at timestamptz default now()
);

alter table public.resources enable row level security;

create policy "Anyone can view resources" on public.resources for select using (true);
create policy "Admin can insert resources" on public.resources for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admin can update resources" on public.resources for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admin can delete resources" on public.resources for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Add resources bucket for PDF uploads
insert into storage.buckets (id, name, public) values ('resources', 'resources', true);
create policy "Anyone can view resources files" on storage.objects for select using (bucket_id = 'resources');
create policy "Admin upload resources files" on storage.objects for insert to authenticated with check (bucket_id = 'resources' and public.has_role(auth.uid(), 'admin'));
