-- Additive installation only; existing notes, policies and recovery data are untouched.
begin;
create table if not exists public.vault_device_credentials (
 id text primary key, owner_id uuid not null references auth.users(id), public_key text not null,
 counter bigint not null default 0 check(counter >= 0),
 status text not null default 'pending' check(status in ('pending','approved','revoked')),
 created_at timestamptz not null default now()
);
create index if not exists vault_device_owner on public.vault_device_credentials(owner_id);
create table if not exists public.vault_device_challenges (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 session_hash text not null, purpose text not null check(purpose in ('register','authenticate')),
 challenge text not null, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists vault_device_challenge_owner on public.vault_device_challenges(owner_id,created_at);
create table if not exists public.vault_device_grants (
 token_hash text primary key, credential_id text not null references public.vault_device_credentials(id),
 owner_id uuid not null references auth.users(id), session_hash text not null, expires_at timestamptz not null
);
alter table public.vault_device_credentials enable row level security;
alter table public.vault_device_challenges enable row level security;
alter table public.vault_device_grants enable row level security;
revoke all on public.vault_device_credentials, public.vault_device_challenges, public.vault_device_grants from public, anon, authenticated, service_role;
grant select on public.vault_device_credentials to service_role;
grant insert(id,owner_id,public_key,counter) on public.vault_device_credentials to service_role;
grant update(counter) on public.vault_device_credentials to service_role;
grant select,insert,delete on public.vault_device_challenges, public.vault_device_grants to service_role;
commit;
-- Administrator only: inspect pending rows, independently verify owner and security device,
-- then update EXACTLY that credential and owner from pending to approved.
-- No automatic approval. To revoke, set status='revoked'; every API rechecks status.
