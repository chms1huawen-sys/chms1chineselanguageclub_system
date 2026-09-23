-- Additive migration. Run in SQL Editor; do not run schema.sql on a live project.
begin;

alter table public.users
  add column if not exists can_manage_inventory boolean not null default false,
  add column if not exists can_approve_inventory boolean not null default false;

create or replace function public.inventory_access(p_kind text, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.users u where u.id = p_user and u.is_active and (
    case p_kind
      when 'active' then true
      when 'teacher' then u.role in ('convener_teacher','advisor_teacher','advisor')
      when 'manage' then u.can_manage_inventory or u.role in ('convener_teacher','advisor_teacher','advisor','chairperson','general_affairs','vice_general_affairs')
      when 'approve' then u.can_approve_inventory or u.role in ('convener_teacher','advisor_teacher','advisor','chairperson','general_affairs','vice_general_affairs')
      else false end));
$$;

create or replace function public.inventory_permission_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.can_manage_inventory is distinct from old.can_manage_inventory
      or new.can_approve_inventory is distinct from old.can_approve_inventory)
     and auth.uid() is not null
     and not public.current_user_has_permission('can_manage_accounts') then
    raise exception 'INVENTORY_FORBIDDEN';
  end if;
  return new;
end;
$$;
drop trigger if exists inventory_permission_guard on public.users;
create trigger inventory_permission_guard before update on public.users
for each row execute function public.inventory_permission_guard();

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 80),
  is_active boolean not null default true
);
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  category_id uuid not null references public.inventory_categories(id),
  mode text not null check (mode in ('loan','consumable')),
  asset_code text unique,
  unit text not null default '件',
  location text not null default '',
  notes text not null default '',
  photo_path text,
  available integer not null default 0 check (available >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  on_loan integer not null default 0 check (on_loan >= 0),
  damaged integer not null default 0 check (damaged >= 0),
  lost integer not null default 0 check (lost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (asset_code is null or (mode = 'loan' and available + reserved + on_loan + damaged + lost <= 1))
);
create table if not exists public.inventory_requests (
  id uuid primary key,
  applicant_id uuid references public.users(id) on delete set null,
  applicant_name text not null,
  purpose text not null check (length(trim(purpose)) between 1 and 2000),
  pickup_date date not null,
  due_date date,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','issued','closed')),
  reviewed_by uuid references public.users(id) on delete set null,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= pickup_date)
);
create table if not exists public.inventory_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inventory_requests(id),
  item_id uuid not null references public.inventory_items(id),
  item_name text not null,
  mode text not null check (mode in ('loan','consumable')),
  quantity integer not null check (quantity > 0),
  returned integer not null default 0 check (returned >= 0),
  damaged integer not null default 0 check (damaged >= 0),
  lost integer not null default 0 check (lost >= 0),
  unique (request_id, item_id),
  check (returned + damaged + lost <= quantity)
);
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id),
  request_id uuid references public.inventory_requests(id),
  actor_id uuid references public.users(id) on delete set null,
  actor_name text not null,
  action text not null,
  quantity integer not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists inventory_requests_applicant_idx on public.inventory_requests(applicant_id, created_at desc);
create index if not exists inventory_requests_due_idx on public.inventory_requests(due_date) where status = 'issued';
create index if not exists inventory_movements_time_idx on public.inventory_movements(created_at desc);
create table if not exists public.inventory_operations (
  id uuid primary key,
  actor_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.inventory_operations enable row level security;
revoke all on public.inventory_operations from anon, authenticated;

-- All mutations pass through the transaction below; table writes are not granted.
alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_requests enable row level security;
alter table public.inventory_request_lines enable row level security;
alter table public.inventory_movements enable row level security;
drop policy if exists inventory_read on public.inventory_categories;
create policy inventory_read on public.inventory_categories for select to authenticated using (public.inventory_access('active'));
drop policy if exists inventory_read on public.inventory_items;
create policy inventory_read on public.inventory_items for select to authenticated using (public.inventory_access('active'));
drop policy if exists inventory_read on public.inventory_requests;
create policy inventory_read on public.inventory_requests for select to authenticated using (
  public.inventory_access('active') and (applicant_id = auth.uid() or public.inventory_access('manage') or public.inventory_access('approve')));
drop policy if exists inventory_read on public.inventory_request_lines;
create policy inventory_read on public.inventory_request_lines for select to authenticated using (
  exists(select 1 from public.inventory_requests r where r.id = request_id));
drop policy if exists inventory_read on public.inventory_movements;
create policy inventory_read on public.inventory_movements for select to authenticated using (public.inventory_access('manage') or public.inventory_access('approve'));
revoke all on public.inventory_categories, public.inventory_items, public.inventory_requests, public.inventory_request_lines, public.inventory_movements from anon, authenticated;
grant select on public.inventory_categories, public.inventory_items, public.inventory_requests, public.inventory_request_lines, public.inventory_movements to authenticated;

create or replace function public.inventory_mutate(p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  actor_name text;
  target uuid := nullif(p_data->>'id','')::uuid;
  item public.inventory_items%rowtype;
  req public.inventory_requests%rowtype;
  line public.inventory_request_lines%rowtype;
  entry jsonb;
  amount integer;
  good integer;
  bad integer;
  missing integer;
  note text := coalesce(p_data->>'note','');
  recipient uuid;
  nid uuid;
  notification_ids uuid[] := '{}';
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  op uuid := nullif(p_data->>'operation_id','')::uuid;
  result jsonb;
begin
  if not public.inventory_access('active') then raise exception 'INVENTORY_FORBIDDEN'; end if;
  if op is null then raise exception 'INVENTORY_OPERATION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,1));
  select o.result into result from public.inventory_operations o where o.id = op and o.actor_id = actor;
  if found then return result || jsonb_build_object('notification_ids','[]'::jsonb); end if;
  select name into actor_name from public.users where id = actor;

  if p_action = 'category' then
    if not public.inventory_access('manage') then raise exception 'INVENTORY_FORBIDDEN'; end if;
    if target is null then
      insert into public.inventory_categories(name) values(trim(p_data->>'name')) returning id into target;
    else
      update public.inventory_categories set name = trim(p_data->>'name'), is_active = (p_data->>'is_active')::boolean where id = target;
      if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
    end if;
  elsif p_action = 'item' then
    if not public.inventory_access('manage') then raise exception 'INVENTORY_FORBIDDEN'; end if;
    if not exists(select 1 from public.inventory_categories where id = (p_data->>'category_id')::uuid) then raise exception 'INVENTORY_CATEGORY_REQUIRED'; end if;
    if target is null then
      insert into public.inventory_items(name,category_id,mode,asset_code,unit,location,notes,photo_path,available)
      values(trim(p_data->>'name'),(p_data->>'category_id')::uuid,p_data->>'mode',nullif(trim(p_data->>'asset_code'),''),
        coalesce(nullif(trim(p_data->>'unit'),''),'件'),coalesce(p_data->>'location',''),coalesce(p_data->>'notes',''),nullif(p_data->>'photo_path',''),(p_data->>'quantity')::integer)
      returning id into target;
    else
      select * into item from public.inventory_items where id = target for update;
      if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
      -- Existing loan/consumable records retain their accounting meaning.
      if (item.mode <> p_data->>'mode' or coalesce(item.asset_code,'') <> coalesce(p_data->>'asset_code',''))
        and exists(select 1 from public.inventory_request_lines where item_id = target) then raise exception 'INVENTORY_MODE_LOCKED'; end if;
      if not (p_data->>'is_active')::boolean and (item.reserved > 0 or item.on_loan > 0) then raise exception 'INVENTORY_OUTSTANDING'; end if;
      update public.inventory_items set name = trim(p_data->>'name'), category_id = (p_data->>'category_id')::uuid,
        mode = p_data->>'mode',asset_code = nullif(trim(p_data->>'asset_code'),''),unit = coalesce(nullif(trim(p_data->>'unit'),''),'件'),
        location = coalesce(p_data->>'location',''), notes = coalesce(p_data->>'notes',''),photo_path = nullif(p_data->>'photo_path',''),is_active = (p_data->>'is_active')::boolean where id = target;
    end if;
    insert into public.inventory_movements(item_id,actor_id,actor_name,action,quantity,note)
    values(target,actor,actor_name,'item',coalesce((p_data->>'quantity')::integer,0),coalesce(p_data->>'name',''));
  elsif p_action = 'adjust' then
    if not public.inventory_access('manage') then raise exception 'INVENTORY_FORBIDDEN'; end if;
    if trim(note) = '' then raise exception 'INVENTORY_NOTE_REQUIRED'; end if;
    good := coalesce((p_data->>'available')::integer,0);
    bad := coalesce((p_data->>'damaged')::integer,0);
    missing := coalesce((p_data->>'lost')::integer,0);
    update public.inventory_items set available = available + good,damaged = damaged + bad,lost = lost + missing where id = target;
    if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
    insert into public.inventory_movements(item_id,actor_id,actor_name,action,quantity,note)
    values(target,actor,actor_name,'adjust',good,note || format(' [available:%s damaged:%s lost:%s]',good,bad,missing));
  elsif p_action = 'submit' then
    if target is null or jsonb_typeof(p_data->'lines') <> 'array' or coalesce(jsonb_array_length(p_data->'lines'),0) not between 1 and 30 then raise exception 'INVENTORY_LINES_REQUIRED'; end if;
    -- A client-generated UUID makes a network retry idempotent.
    perform pg_advisory_xact_lock(hashtextextended(target::text,0));
    select * into req from public.inventory_requests where id = target;
    if found then
      if req.applicant_id <> actor then raise exception 'INVENTORY_FORBIDDEN'; end if;
      return jsonb_build_object('id',target,'notification_ids','[]'::jsonb);
    end if;
    if (p_data->>'pickup_date')::date < today then raise exception 'INVENTORY_DATE_INVALID'; end if;
    insert into public.inventory_requests(id,applicant_id,applicant_name,purpose,pickup_date,due_date)
    values(target,actor,actor_name,trim(p_data->>'purpose'),(p_data->>'pickup_date')::date,nullif(p_data->>'due_date','')::date);
    for entry in select value from jsonb_array_elements(p_data->'lines') order by value->>'item_id' loop
      select * into item from public.inventory_items where id = (entry->>'item_id')::uuid for update;
      amount := (entry->>'quantity')::integer;
      if not found or not item.is_active or amount is null or amount <= 0 or item.available < amount then raise exception 'INVENTORY_STOCK_UNAVAILABLE'; end if;
      if item.mode = 'loan' and nullif(p_data->>'due_date','') is null then raise exception 'INVENTORY_DUE_REQUIRED'; end if;
      insert into public.inventory_request_lines(request_id,item_id,item_name,mode,quantity) values(target,item.id,item.name,item.mode,amount);
    end loop;
  elsif p_action in ('approve','reject','cancel','issue','return') then
    select * into req from public.inventory_requests where id = target for update;
    if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
    if p_action in ('approve','reject') then
      if not public.inventory_access('approve') or (req.applicant_id = actor and not public.inventory_access('teacher')) then raise exception 'INVENTORY_SELF_APPROVAL'; end if;
      if req.status <> 'pending' then raise exception 'INVENTORY_STATUS_CHANGED'; end if;
      if p_action = 'reject' and trim(note) = '' then raise exception 'INVENTORY_NOTE_REQUIRED'; end if;
    elsif p_action = 'cancel' then
      if req.applicant_id is distinct from actor and not public.inventory_access('manage') then raise exception 'INVENTORY_FORBIDDEN'; end if;
      if req.status not in ('pending','approved') then raise exception 'INVENTORY_STATUS_CHANGED'; end if;
    else
      if not public.inventory_access('manage') then raise exception 'INVENTORY_FORBIDDEN'; end if;
      if p_action = 'issue' and req.status <> 'approved' then raise exception 'INVENTORY_STATUS_CHANGED'; end if;
      if p_action = 'return' and req.status not in ('issued','closed') then raise exception 'INVENTORY_STATUS_CHANGED'; end if;
    end if;
    -- Consistent item lock order avoids deadlocks for overlapping requests.
    perform i.id from public.inventory_items i join public.inventory_request_lines l on l.item_id = i.id
      where l.request_id = target order by i.id for update of i;
    if p_action = 'return' then
      if coalesce(jsonb_array_length(p_data->'lines'),0) = 0 then raise exception 'INVENTORY_LINES_REQUIRED'; end if;
      for entry in select value from jsonb_array_elements(p_data->'lines') loop
        select * into line from public.inventory_request_lines where id = (entry->>'id')::uuid and request_id = target for update;
        if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
        good := coalesce((entry->>'good')::integer,0);
        bad := coalesce((entry->>'damaged')::integer,0);
        missing := coalesce((entry->>'lost')::integer,0);
        amount := good + bad + missing;
        if least(good,bad,missing) < 0 or amount <= 0 or amount > line.quantity - line.returned - line.damaged - line.lost
          or (line.mode = 'consumable' and (bad > 0 or missing > 0)) then raise exception 'INVENTORY_RETURN_INVALID'; end if;
        if (bad > 0 or missing > 0) and trim(note) = '' then raise exception 'INVENTORY_NOTE_REQUIRED'; end if;
        update public.inventory_items set available = available + good, damaged = damaged + bad, lost = lost + missing,
          on_loan = on_loan - case when line.mode = 'loan' then amount else 0 end where id = line.item_id;
        update public.inventory_request_lines set returned = returned + good,damaged = damaged + bad,lost = lost + missing where id = line.id;
        insert into public.inventory_movements(item_id,request_id,actor_id,actor_name,action,quantity,note)
        values(line.item_id,target,actor,actor_name,'return',amount,note || format(' [good:%s damaged:%s lost:%s]',good,bad,missing));
      end loop;
    else
      for line in select * from public.inventory_request_lines where request_id = target order by item_id loop
        if p_action = 'approve' then
          update public.inventory_items set available = available - line.quantity,reserved = reserved + line.quantity
          where id = line.item_id and is_active and available >= line.quantity;
          if not found then raise exception 'INVENTORY_STOCK_UNAVAILABLE'; end if;
        elsif p_action = 'cancel' and req.status = 'approved' then
          update public.inventory_items set available = available + line.quantity,reserved = reserved - line.quantity where id = line.item_id;
        elsif p_action = 'issue' then
          update public.inventory_items set reserved = reserved - line.quantity,on_loan = on_loan + case when line.mode = 'loan' then line.quantity else 0 end where id = line.item_id;
        end if;
        insert into public.inventory_movements(item_id,request_id,actor_id,actor_name,action,quantity,note)
        values(line.item_id,target,actor,actor_name,p_action,line.quantity,note);
      end loop;
    end if;
    update public.inventory_requests set status = case
      when p_action = 'approve' then 'approved' when p_action = 'reject' then 'rejected' when p_action = 'cancel' then 'cancelled'
      when exists(select 1 from public.inventory_request_lines where request_id = target and mode = 'loan' and quantity > returned + damaged + lost) then 'issued'
      else 'closed' end,
      reviewed_by = case when p_action in ('approve','reject') then actor else reviewed_by end,
      review_note = case when p_action in ('approve','reject') then note else review_note end,updated_at = now() where id = target;
  else raise exception 'INVENTORY_ACTION_INVALID';
  end if;

  if p_action in ('submit','approve','reject','cancel','issue','return') then
    for recipient in select u.id from public.users u where u.is_active and (
      (p_action = 'submit' and public.inventory_access('approve',u.id) and (u.id <> actor or public.inventory_access('teacher',u.id)))
      or (p_action <> 'submit' and u.id = (select applicant_id from public.inventory_requests where id = target))) loop
      insert into public.notifications(user_id,type,title,body)
      values(recipient,'inventory','物品申请更新 / Item request update',actor_name || ' · ' ||
        case p_action when 'submit' then '新物品申请 / New request' when 'approve' then '已批准 / Approved'
        when 'reject' then '已拒绝 / Rejected' when 'cancel' then '已取消 / Cancelled' when 'issue' then '已领取 / Collected'
        else '已登记归还 / Return recorded' end || ' · ' || left(target::text,8)) returning id into nid;
      notification_ids := array_append(notification_ids,nid);
    end loop;
  end if;
  result := jsonb_build_object('id',target,'notification_ids',to_jsonb(notification_ids));
  insert into public.inventory_operations(id,actor_id,result) values(op,actor,result);
  return result;
end;
$$;
revoke all on function public.inventory_mutate(text,jsonb), public.inventory_access(text,uuid), public.inventory_permission_guard() from public, anon;
grant execute on function public.inventory_mutate(text,jsonb), public.inventory_access(text,uuid) to authenticated;

-- Only the scheduled service can generate daily due/overdue reminders.
create or replace function public.inventory_due_reminders()
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  ids uuid[];
begin
  with inserted as (
    insert into public.notifications(user_id,type,title,body,dedupe_key)
    select u.id,'inventory',
      case when r.due_date = today then '物品今日归还 / Items due today' else '物品逾期未归还 / Overdue items' end,
      r.applicant_name || ' · ' || left(r.id::text,8) || ' · ' || r.due_date::text,
      'inventory-due-' || r.id::text || '-' || u.id::text || '-' || today::text
    from public.inventory_requests r cross join public.users u
    where r.status = 'issued' and r.due_date <= today and u.is_active
      and (u.id = r.applicant_id or public.inventory_access('manage',u.id))
      and exists(select 1 from public.inventory_request_lines l where l.request_id = r.id and l.mode='loan' and l.quantity > l.returned + l.damaged + l.lost)
    on conflict(dedupe_key) do nothing returning id
  ) select coalesce(array_agg(id),'{}'::uuid[]) into ids from inserted;
  return ids;
end;
$$;
revoke all on function public.inventory_due_reminders() from public, anon, authenticated;
grant execute on function public.inventory_due_reminders() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inventory-photos','inventory-photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists inventory_photo_read on storage.objects;
create policy inventory_photo_read on storage.objects for select to authenticated using (bucket_id = 'inventory-photos' and public.inventory_access('active'));
drop policy if exists inventory_photo_insert on storage.objects;
create policy inventory_photo_insert on storage.objects for insert to authenticated with check (bucket_id = 'inventory-photos' and public.inventory_access('manage'));
drop policy if exists inventory_photo_delete on storage.objects;
create policy inventory_photo_delete on storage.objects for delete to authenticated using (bucket_id = 'inventory-photos' and public.inventory_access('manage'));

do $$ declare tbl text; begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array array['inventory_categories','inventory_items','inventory_requests','inventory_request_lines','inventory_movements'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl) then
        execute format('alter publication supabase_realtime add table public.%I',tbl);
      end if;
    end loop;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
