
-- Create app_role enum
create type public.app_role as enum ('admin', 'user');

-- User roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null default 'user',
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  profile_image_url text,
  date_of_birth date,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- Posts table
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  caption text,
  image_url text,
  video_url text,
  type text not null default 'image' check (type in ('image', 'youtube', 'video')),
  created_at timestamptz default now()
);
alter table public.posts enable row level security;

-- Prayer requests table
create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  message text not null,
  created_at timestamptz default now()
);
alter table public.prayer_requests enable row level security;

-- Prayer interactions
create table public.prayer_interactions (
  id uuid primary key default gen_random_uuid(),
  prayer_request_id uuid references public.prayer_requests(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (prayer_request_id, user_id)
);
alter table public.prayer_interactions enable row level security;

-- Gallery table
create table public.gallery (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text,
  created_at timestamptz default now()
);
alter table public.gallery enable row level security;

-- Security definer function for role checking
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email);

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS Policies

-- Profiles
create policy "Anyone can view profiles" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- User roles
create policy "Authenticated can view roles" on public.user_roles for select to authenticated using (true);
create policy "Admin insert roles" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admin update roles" on public.user_roles for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admin delete roles" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Posts
create policy "Anyone can view posts" on public.posts for select using (true);
create policy "Admin can insert posts" on public.posts for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admin can update posts" on public.posts for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admin can delete posts" on public.posts for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Prayer requests
create policy "Authenticated view prayers" on public.prayer_requests for select to authenticated using (true);
create policy "Users create own prayers" on public.prayer_requests for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete own prayers" on public.prayer_requests for delete to authenticated using (auth.uid() = user_id);

-- Prayer interactions
create policy "Authenticated view interactions" on public.prayer_interactions for select to authenticated using (true);
create policy "Users create own interactions" on public.prayer_interactions for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete own interactions" on public.prayer_interactions for delete to authenticated using (auth.uid() = user_id);

-- Gallery
create policy "Anyone can view gallery" on public.gallery for select using (true);
create policy "Admin can insert gallery" on public.gallery for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admin can update gallery" on public.gallery for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admin can delete gallery" on public.gallery for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Storage buckets
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
insert into storage.buckets (id, name, public) values ('posts', 'posts', true);
insert into storage.buckets (id, name, public) values ('gallery', 'gallery', true);

-- Storage policies
create policy "Anyone can view avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "Authenticated upload avatars" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
create policy "Users update own avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars');

create policy "Anyone can view posts media" on storage.objects for select using (bucket_id = 'posts');
create policy "Admin upload posts media" on storage.objects for insert to authenticated with check (bucket_id = 'posts' and public.has_role(auth.uid(), 'admin'));

create policy "Anyone can view gallery media" on storage.objects for select using (bucket_id = 'gallery');
create policy "Admin upload gallery media" on storage.objects for insert to authenticated with check (bucket_id = 'gallery' and public.has_role(auth.uid(), 'admin'));

-- Enable realtime
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.prayer_requests;
alter publication supabase_realtime add table public.prayer_interactions;
alter publication supabase_realtime add table public.gallery;
