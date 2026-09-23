-- Additive migration; never reset the production schema.
begin;
alter table public.users
  add column if not exists can_manage_finance boolean not null default false,
  add column if not exists can_approve_finance boolean not null default false;

create or replace function public.finance_access(kind text, person uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.users u where u.id=person and u.is_active and case kind
    when 'active' then true
    when 'teacher' then u.role in ('convener_teacher','advisor_teacher','advisor')
    when 'treasury' then u.can_manage_finance or u.role in ('convener_teacher','advisor_teacher','advisor','treasurer','vice_treasurer')
    when 'president' then u.can_approve_finance or u.role in ('convener_teacher','advisor_teacher','advisor','chairperson')
    when 'view' then u.can_manage_finance or u.can_approve_finance or u.role in ('convener_teacher','advisor_teacher','advisor','treasurer','vice_treasurer','chairperson')
    else false end);
$$;
create or replace function public.finance_permission_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.can_manage_finance is distinct from old.can_manage_finance or new.can_approve_finance is distinct from old.can_approve_finance)
    and auth.uid() is not null and not public.current_user_has_permission('can_manage_accounts') then
    raise exception 'FINANCE_FORBIDDEN';
  end if;
  return new;
end; $$;
drop trigger if exists finance_permission_guard on public.users;
create trigger finance_permission_guard before update on public.users for each row execute function public.finance_permission_guard();

create table if not exists public.finance_claims (
  id uuid primary key,
  applicant_id uuid references public.users(id) on delete set null,
  applicant_name text not null,
  title text not null check(length(trim(title)) between 1 and 160),
  description text not null default '' check(length(description)<=3000),
  amount numeric(12,2) not null check(amount>0 and amount<10000000),
  expense_date date not null,
  status text not null default 'treasury' check(status in ('treasury','president','teacher','approved','paid','returned','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.finance_receipts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.finance_claims(id),
  name text not null check(length(name) between 1 and 255),
  path text not null unique
);
create table if not exists public.finance_reviews (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.finance_claims(id),
  actor_id uuid references public.users(id) on delete set null,
  actor_name text not null,
  action text not null,
  from_status text,
  to_status text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.finance_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  kind text not null check(kind in ('opening','income','expense','reversal')),
  description text not null check(length(trim(description)) between 1 and 500),
  amount numeric(12,2) not null check(amount<>0 and abs(amount)<10000000),
  claim_id uuid unique references public.finance_claims(id),
  reverses_id uuid unique references public.finance_ledger(id),
  actor_id uuid references public.users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now(),
  check((kind='income' and amount>0) or (kind='expense' and amount<0) or kind in ('opening','reversal')),
  check((kind='reversal')=(reverses_id is not null))
);
create unique index if not exists finance_one_opening on public.finance_ledger(kind) where kind='opening';
create index if not exists finance_ledger_date on public.finance_ledger(entry_date,created_at);
create index if not exists finance_claims_owner on public.finance_claims(applicant_id,created_at desc);
create index if not exists finance_claims_stage on public.finance_claims(status,created_at);
create index if not exists finance_reviews_claim on public.finance_reviews(claim_id,created_at);
create table if not exists public.finance_operations(id uuid primary key,actor_id uuid not null,result jsonb not null);
alter table public.finance_operations enable row level security;
revoke all on public.finance_operations from anon,authenticated;

alter table public.finance_claims enable row level security;
alter table public.finance_receipts enable row level security;
alter table public.finance_reviews enable row level security;
alter table public.finance_ledger enable row level security;
drop policy if exists finance_read on public.finance_claims;
create policy finance_read on public.finance_claims for select to authenticated using(public.finance_access('active') and (applicant_id=auth.uid() or public.finance_access('view')));
drop policy if exists finance_read on public.finance_receipts;
create policy finance_read on public.finance_receipts for select to authenticated using(exists(select 1 from public.finance_claims c where c.id=claim_id));
drop policy if exists finance_read on public.finance_reviews;
create policy finance_read on public.finance_reviews for select to authenticated using(exists(select 1 from public.finance_claims c where c.id=claim_id));
drop policy if exists finance_read on public.finance_ledger;
create policy finance_read on public.finance_ledger for select to authenticated using(public.finance_access('view'));
revoke all on public.finance_claims,public.finance_receipts,public.finance_reviews,public.finance_ledger from anon,authenticated;
grant select on public.finance_claims,public.finance_receipts,public.finance_reviews,public.finance_ledger to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-receipts','finance-receipts',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists finance_receipt_read on storage.objects;
create policy finance_receipt_read on storage.objects for select to authenticated using(bucket_id='finance-receipts' and public.finance_access('active') and (
  split_part(name,'/',1)=auth.uid()::text or (public.finance_access('view') and exists(select 1 from public.finance_receipts r where r.path=storage.objects.name))));
drop policy if exists finance_receipt_upload on storage.objects;
create policy finance_receipt_upload on storage.objects for insert to authenticated with check(bucket_id='finance-receipts' and public.finance_access('active') and split_part(name,'/',1)=auth.uid()::text);
-- Submitted receipts are immutable, including for their uploader.
drop policy if exists finance_receipt_delete on storage.objects;
create policy finance_receipt_delete on storage.objects for delete to authenticated using(bucket_id='finance-receipts' and public.finance_access('active') and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from public.finance_receipts r where r.path=storage.objects.name));

create or replace function public.finance_mutate(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor uuid:=auth.uid(); actor_name text; op uuid:=(p_data->>'operation_id')::uuid;
  target uuid:=(p_data->>'id')::uuid; c public.finance_claims%rowtype; e public.finance_ledger%rowtype;
  previous text; next_status text; note text:=coalesce(p_data->>'note',''); r jsonb; result jsonb;
  recipient uuid; nid uuid; ids uuid[]:='{}'; stage text; day date; value numeric(12,2);
begin
  if not public.finance_access('active') or op is null then raise exception 'FINANCE_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  select o.result into result from public.finance_operations o where o.id=op and o.actor_id=actor;
  if found then return result || jsonb_build_object('notification_ids','[]'::jsonb); end if;
  select name into actor_name from public.users where id=actor;
  if length(note)>3000 then raise exception 'FINANCE_INVALID'; end if;
  if p_action in ('submit','resubmit') then
    if target is null or jsonb_typeof(p_data->'receipts') is distinct from 'array' then raise exception 'FINANCE_RECEIPTS_REQUIRED'; end if;
    if jsonb_array_length(p_data->'receipts') not between 1 and 5 then raise exception 'FINANCE_RECEIPTS_REQUIRED'; end if;
    if (p_data->>'expense_date')::date > (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'FINANCE_DATE_INVALID'; end if;
    if p_action='resubmit' then
      select * into c from public.finance_claims where id=target for update;
      if not found or c.applicant_id is distinct from actor then raise exception 'FINANCE_FORBIDDEN'; end if;
      if c.status<>'returned' then raise exception 'FINANCE_STATUS_CHANGED'; end if;
      previous:=c.status;
      update public.finance_claims set title=p_data->>'title',description=coalesce(p_data->>'description',''),amount=(p_data->>'amount')::numeric,expense_date=(p_data->>'expense_date')::date,status='treasury',updated_at=now() where id=target;
    else
      insert into public.finance_claims(id,applicant_id,applicant_name,title,description,amount,expense_date)
      values(target,actor,actor_name,p_data->>'title',coalesce(p_data->>'description',''),(p_data->>'amount')::numeric,(p_data->>'expense_date')::date);
    end if;
    for r in select * from jsonb_array_elements(p_data->'receipts') loop
      if split_part(r->>'path','/',1)<>actor::text or split_part(r->>'path','/',2)<>target::text
        or not exists(select 1 from storage.objects where bucket_id='finance-receipts' and name=r->>'path') then raise exception 'FINANCE_RECEIPT_INVALID'; end if;
    end loop;
    delete from public.finance_receipts where claim_id=target;
    insert into public.finance_receipts(claim_id,name,path) select target,x->>'name',x->>'path' from jsonb_array_elements(p_data->'receipts') x;
    next_status:='treasury';
  elsif p_action in ('approve','return','cancel','pay') then
    select * into c from public.finance_claims where id=target for update;
    if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
    previous:=c.status;
    if p_data->>'expected_status' is distinct from c.status then raise exception 'FINANCE_STATUS_CHANGED'; end if;
    if p_action='cancel' then
      if c.applicant_id is distinct from actor then raise exception 'FINANCE_FORBIDDEN'; end if;
      if c.status not in ('treasury','president','teacher','returned') then raise exception 'FINANCE_STATUS_CHANGED'; end if;
      next_status:='cancelled';
    elsif p_action='pay' then
      if not public.finance_access('treasury') then raise exception 'FINANCE_FORBIDDEN'; end if;
      if c.status<>'approved' then raise exception 'FINANCE_STATUS_CHANGED'; end if;
      if c.applicant_id=actor and not public.finance_access('teacher') then raise exception 'FINANCE_SELF_APPROVAL'; end if;
      if length(trim(note))=0 then raise exception 'FINANCE_NOTE_REQUIRED'; end if;
      day:=(p_data->>'entry_date')::date;
      if day is null or day<c.expense_date or day>(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'FINANCE_DATE_INVALID'; end if;
      perform pg_advisory_xact_lock(hashtextextended('finance-ledger',0));
      if exists(select 1 from public.finance_ledger where kind='opening' and entry_date>day) then raise exception 'FINANCE_BEFORE_OPENING'; end if;
      insert into public.finance_ledger(entry_date,kind,description,amount,claim_id,actor_id,actor_name)
      values(day,'expense',c.title,-c.amount,c.id,actor,actor_name);
      next_status:='paid';
    else
      if c.status not in ('treasury','president','teacher') then raise exception 'FINANCE_STATUS_CHANGED'; end if;
      if not public.finance_access(c.status) then raise exception 'FINANCE_FORBIDDEN'; end if;
      if c.applicant_id=actor and not public.finance_access('teacher') then raise exception 'FINANCE_SELF_APPROVAL'; end if;
      if p_action='return' then
        if length(trim(note))=0 then raise exception 'FINANCE_NOTE_REQUIRED'; end if;
        next_status:='returned';
      else
        next_status:=case c.status when 'treasury' then 'president' when 'president' then 'teacher' else 'approved' end;
      end if;
    end if;
    update public.finance_claims set status=next_status,updated_at=now() where id=target;
  elsif p_action in ('income','opening','reverse') then
    if not public.finance_access('treasury') then raise exception 'FINANCE_FORBIDDEN'; end if;
    perform pg_advisory_xact_lock(hashtextextended('finance-ledger',0));
    day:=(p_data->>'entry_date')::date;
    if day is null or day>(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'FINANCE_DATE_INVALID'; end if;
    if p_action='opening' and exists(select 1 from public.finance_ledger where entry_date<day or kind='opening') then raise exception 'FINANCE_OPENING_EXISTS'; end if;
    if p_action<>'opening' and exists(select 1 from public.finance_ledger where kind='opening' and entry_date>day) then raise exception 'FINANCE_BEFORE_OPENING'; end if;
    if p_action='reverse' then
      select * into e from public.finance_ledger where id=target for update;
      if not found or e.kind not in ('income','opening') then raise exception 'FINANCE_INVALID'; end if;
      if day<e.entry_date or length(trim(note))=0 then raise exception 'FINANCE_NOTE_REQUIRED'; end if;
      insert into public.finance_ledger(entry_date,kind,description,amount,reverses_id,actor_id,actor_name)
      values(day,'reversal',note,-e.amount,e.id,actor,actor_name) returning id into target;
    else
      value:=(p_data->>'amount')::numeric;
      if value is null or value<=0 then raise exception 'FINANCE_INVALID'; end if;
      insert into public.finance_ledger(entry_date,kind,description,amount,actor_id,actor_name)
      values(day,p_action,p_data->>'description',value,actor,actor_name) returning id into target;
    end if;
  else raise exception 'FINANCE_INVALID'; end if;

  if next_status is not null then
    insert into public.finance_reviews(claim_id,actor_id,actor_name,action,from_status,to_status,note)
    values(target,actor,actor_name,p_action,previous,next_status,note);
    stage:=case next_status when 'approved' then 'treasury' else next_status end;
    for recipient in select u.id from public.users u where u.is_active and (
      u.id=(select applicant_id from public.finance_claims where id=target)
      or (next_status in ('treasury','president','teacher','approved') and public.finance_access(stage,u.id)
        and (u.id<>(select applicant_id from public.finance_claims where id=target) or public.finance_access('teacher',u.id)))) loop
      insert into public.notifications(user_id,type,title,body)
      values(recipient,'finance','报销进度更新 / Claim update',actor_name||' · '||(select title from public.finance_claims where id=target)||' · '||
        case next_status when 'treasury' then '待财政审核 / Treasury review' when 'president' then '待主席批准 / President review'
        when 'teacher' then '待老师批准 / Teacher review' when 'approved' then '待付款 / Awaiting payment'
        when 'paid' then '已付款 / Paid' when 'returned' then '已退回 / Returned' else '已取消 / Cancelled' end)
      returning id into nid;
      ids:=array_append(ids,nid);
    end loop;
  end if;
  result:=jsonb_build_object('id',target,'notification_ids',to_jsonb(ids));
  insert into public.finance_operations values(op,actor,result);
  return result;
end; $$;
revoke all on function public.finance_mutate(text,jsonb) from public,anon;
grant execute on function public.finance_mutate(text,jsonb) to authenticated;

-- Compute balances in decimal SQL, over the entire ledger (not an API-limited page).
create or replace function public.finance_statement(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare first_day date:=date_trunc('month',p_month)::date; last_day date:=(date_trunc('month',p_month)+interval '1 month')::date; opening numeric; closing numeric; rows jsonb;
begin
  if not public.finance_access('view') then raise exception 'FINANCE_FORBIDDEN'; end if;
  select coalesce(sum(amount),0) into opening from public.finance_ledger where entry_date<first_day or (kind='opening' and entry_date>=first_day and entry_date<last_day);
  select coalesce(jsonb_agg(to_jsonb(l) order by l.entry_date,l.created_at,l.id),'[]'::jsonb) into rows from public.finance_ledger l where entry_date>=first_day and entry_date<last_day and kind<>'opening';
  select opening+coalesce(sum(amount),0) into closing from public.finance_ledger where entry_date>=first_day and entry_date<last_day and kind<>'opening';
  return jsonb_build_object('opening',opening,'closing',closing,'entries',rows);
end; $$;
revoke all on function public.finance_statement(date) from public,anon;
grant execute on function public.finance_statement(date) to authenticated;
do $$ declare tbl text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach tbl in array array['finance_claims','finance_receipts','finance_reviews','finance_ledger'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl) then
        execute format('alter publication supabase_realtime add table public.%I',tbl);
      end if;
    end loop;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
