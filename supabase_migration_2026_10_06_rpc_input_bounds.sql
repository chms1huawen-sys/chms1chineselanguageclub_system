begin;

-- RPC: blog_save_post
CREATE OR REPLACE FUNCTION public.blog_save_post(p_post jsonb, p_drive text, p_version integer DEFAULT NULL::integer, p_media jsonb DEFAULT '[]'::jsonb)
 RETURNS blog_posts
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v public.blog_posts; old_version integer; target uuid;
begin

  if jsonb_typeof(p_post) is distinct from 'object' or octet_length(p_post::text)>2097152 then
    raise exception 'RPC_INPUT_INVALID' using errcode='22023';
  end if;

  if jsonb_typeof(p_media) is distinct from 'array' or jsonb_array_length(p_media)>1000 then
    raise exception 'RPC_INPUT_INVALID' using errcode='22023';
  end if;

  if not public.blog_manager() then raise exception 'BLOG_FORBIDDEN'; end if;
  target:=coalesce(nullif(p_post->>'id','')::uuid,gen_random_uuid());
  select version into old_version from public.blog_posts where id=target for update;
  if found and old_version is distinct from p_version then raise exception 'BLOG_EDIT_CONFLICT'; end if;
  insert into public.blog_posts(id,title,slug,summary,body,category_id,event_date,location,tags,credit,cover_path,featured,status)
  values(target,p_post->>'title',p_post->>'slug',coalesce(p_post->>'summary',''),coalesce(p_post->>'body',''),nullif(p_post->>'category_id','')::uuid,nullif(p_post->>'event_date','')::date,coalesce(p_post->>'location',''),array(select jsonb_array_elements_text(coalesce(p_post->'tags','[]'))),coalesce(p_post->>'credit',''),coalesce(p_post->>'cover_path',''),coalesce((p_post->>'featured')::boolean,false),coalesce(p_post->>'status','draft'))
  on conflict(id) do update set title=excluded.title,slug=excluded.slug,summary=excluded.summary,body=excluded.body,category_id=excluded.category_id,event_date=excluded.event_date,location=excluded.location,tags=excluded.tags,credit=excluded.credit,cover_path=excluded.cover_path,featured=excluded.featured,status=excluded.status returning * into v;
  insert into public.blog_downloads(post_id,drive_url) values(target,coalesce(p_drive,'')) on conflict(post_id) do update set drive_url=excluded.drive_url;
  update public.blog_media m set caption=coalesce(entry.value->>'caption','')
  from jsonb_array_elements(p_media) entry(value)
  where m.post_id=target and m.id=(entry.value->>'id')::uuid;
  return v;
end $function$
;

-- RPC: blog_studio_save
CREATE OR REPLACE FUNCTION public.blog_studio_save(p_post jsonb, p_links jsonb DEFAULT '[]'::jsonb, p_album_ids uuid[] DEFAULT '{}'::uuid[], p_media jsonb DEFAULT '[]'::jsonb, p_version integer DEFAULT NULL::integer)
 RETURNS blog_posts
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare result public.blog_posts; old_version integer; target uuid; link jsonb;
begin

  if jsonb_typeof(p_post) is distinct from 'object' or octet_length(p_post::text)>2097152 then
    raise exception 'RPC_INPUT_INVALID' using errcode='22023';
  end if;

  if jsonb_typeof(p_media) is distinct from 'array' or jsonb_array_length(p_media)>1000 then
    raise exception 'RPC_INPUT_INVALID' using errcode='22023';
  end if;

  if jsonb_typeof(p_links) is distinct from 'array' or jsonb_array_length(p_links)>30 then
    raise exception 'RPC_INPUT_INVALID' using errcode='22023';
  end if;

if not public.blog_manager() then raise exception 'BLOG_FORBIDDEN'; end if;
if cardinality(p_album_ids)>0 then raise exception 'BLOG_USE_ARTICLE_PHOTOS'; end if;
target:=coalesce(nullif(p_post->>'id','')::uuid,gen_random_uuid());
select version into old_version from public.blog_posts where id=target for update;
if found and old_version is distinct from p_version then raise exception 'BLOG_EDIT_CONFLICT'; end if;
if jsonb_array_length(p_links)>30 or cardinality(p_album_ids)>30 then raise exception 'BLOG_TOO_MANY_LINKS'; end if;
insert into public.blog_posts(id,title,slug,summary,author,body,body_document,category_id,event_date,location,tags,credit,cover_path,featured,status,content_type,content_year,is_sticky,related_ids,event_id,behind_scenes,video_url,scheduled_at,tag_ids,book_details,show_in_moments)
values(target,p_post->>'title',p_post->>'slug',coalesce(p_post->>'summary',''),coalesce(p_post->>'author',''),coalesce(p_post->>'body',''),nullif(p_post->'body_document','null'::jsonb),nullif(p_post->>'category_id','')::uuid,nullif(p_post->>'event_date','')::date,coalesce(p_post->>'location',''),array(select jsonb_array_elements_text(coalesce(p_post->'tags','[]'))),coalesce(p_post->>'credit',''),coalesce(p_post->>'cover_path',''),coalesce((p_post->>'featured')::boolean,false),coalesce(p_post->>'status','draft'),coalesce(p_post->>'content_type','article'),coalesce((p_post->>'content_year')::integer,extract(year from current_date)::integer),coalesce((p_post->>'is_sticky')::boolean,false),array(select jsonb_array_elements_text(coalesce(p_post->'related_ids','[]'))::uuid),nullif(p_post->>'event_id','')::uuid,coalesce(p_post->>'behind_scenes',''),coalesce(p_post->>'video_url',''),nullif(p_post->>'scheduled_at','')::timestamptz,array(select jsonb_array_elements_text(coalesce(p_post->'tag_ids','[]'))::uuid),coalesce(p_post->'book_details','{}'),coalesce((p_post->>'show_in_moments')::boolean,true))
on conflict(id) do update set title=excluded.title,slug=excluded.slug,summary=excluded.summary,author=excluded.author,body=excluded.body,body_document=excluded.body_document,category_id=excluded.category_id,event_date=excluded.event_date,location=excluded.location,tags=excluded.tags,credit=excluded.credit,cover_path=excluded.cover_path,featured=excluded.featured,status=excluded.status,content_type=excluded.content_type,content_year=excluded.content_year,is_sticky=excluded.is_sticky,related_ids=excluded.related_ids,event_id=excluded.event_id,behind_scenes=excluded.behind_scenes,video_url=excluded.video_url,scheduled_at=excluded.scheduled_at,tag_ids=excluded.tag_ids,book_details=excluded.book_details,show_in_moments=excluded.show_in_moments returning * into result;
delete from public.blog_links where post_id=target;
for link in select * from jsonb_array_elements(p_links) loop
insert into public.blog_links(post_id,label,url,visibility,type,position) values(target,link->>'label',link->>'url',coalesce(link->>'visibility','public'),coalesce(link->>'type','website'),coalesce((link->>'position')::integer,0)); end loop;
delete from public.blog_downloads where post_id=target;
update public.blog_media m set caption=coalesce(e.value->>'caption',''),position=coalesce((e.value->>'position')::integer,m.position),width_percent=coalesce((e.value->>'width_percent')::integer,m.width_percent),crop=nullif(e.value->'crop','null'::jsonb) from jsonb_array_elements(p_media) e(value) where m.post_id=target and m.id=(e.value->>'id')::uuid;
return result;
end $function$
;

-- RPC: finance_mutate
CREATE OR REPLACE FUNCTION public.finance_mutate(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor uuid:=auth.uid(); actor_name text; op uuid:=(p_data->>'operation_id')::uuid;
  target uuid:=(p_data->>'id')::uuid; c public.finance_claims%rowtype; e public.finance_ledger%rowtype;
  previous text; next_status text; note text:=coalesce(p_data->>'note',''); r jsonb; result jsonb;
  recipient uuid; nid uuid; ids uuid[]:='{}'; stage text; day date; value numeric(12,2);
begin

  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then
    raise exception 'RPC_INPUT_INVALID' using errcode='22023';
  end if;

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
end; $function$
;

-- RPC: finance_record_income
CREATE OR REPLACE FUNCTION public.finance_record_income(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare op uuid:=(p_data->>'operation_id')::uuid; result jsonb; target uuid; actor_name text; day date:=(p_data->>'entry_date')::date;
begin

  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then
    raise exception 'RPC_INPUT_INVALID' using errcode='22023';
  end if;

  if not public.finance_can_record_income() or op is null then raise exception 'FINANCE_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  select o.result into result from public.finance_operations o where o.id=op and o.actor_id=auth.uid();
  if found then return result; end if;
  if day is null or day>(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'FINANCE_DATE_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('finance-ledger',0));
  if exists(select 1 from public.finance_ledger where kind='opening' and entry_date>day) then raise exception 'FINANCE_BEFORE_OPENING'; end if;
  select name into actor_name from public.users where id=auth.uid();
  insert into public.finance_ledger(entry_date,kind,description,amount,actor_id,actor_name)
  values(day,'income',p_data->>'description',(p_data->>'amount')::numeric,auth.uid(),actor_name) returning id into target;
  result:=jsonb_build_object('id',target,'notification_ids','[]'::jsonb);
  insert into public.finance_operations values(op,auth.uid(),result);
  return result;
end; $function$
;

-- RPC: inventory_mutate
CREATE OR REPLACE FUNCTION public.inventory_mutate(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then
    raise exception 'RPC_INPUT_INVALID' using errcode='22023';
  end if;

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
$function$
;

-- RPC: create_task_repeat_plan
CREATE OR REPLACE FUNCTION public.create_task_repeat_plan(p_team uuid, p_scope text, p_title text, p_description text, p_assigned uuid[], p_priority text, p_first timestamp with time zone, p_immediate boolean, p_weekday integer, p_time time without time zone, p_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare plan_id uuid; first_at timestamptz; publish_local timestamp; due_local timestamp; i integer;
begin

  if p_immediate is null or p_scope is null or p_scope not in ('members','executive')
    or p_priority is null or p_priority not in ('high','medium','low')
    or p_count is null or p_count not between 1 and 12
    or p_weekday is null or p_weekday not between 0 and 6
    or p_time is null or p_time >= time '24:00'
    or length(coalesce(p_title,'')) > 300 or length(coalesce(p_description,'')) > 20000
    or coalesce(cardinality(p_assigned),0) not between 1 and 500
    or (not p_immediate and (p_first is null or not isfinite(p_first))) then
    raise exception 'TASK_PLAN_INPUT_INVALID' using errcode='22023';
  end if;

  if not public.current_user_has_permission('can_create_tasks') then raise exception 'TASK_PLAN_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.teams where id=p_team and not is_archived) then raise exception 'TASK_TEAM_INVALID'; end if;
  if nullif(trim(p_title),'') is null or cardinality(p_assigned) is null or cardinality(p_assigned)<1 then raise exception 'TASK_PLAN_FIELDS_REQUIRED'; end if;
  if exists(select 1 from unnest(p_assigned) a(id) left join public.users u on u.id=a.id where u.id is null or not u.is_active
    or (p_scope='executive' and u.role in ('ordinary_member','event_member'))
    or (exists(select 1 from public.teams where id=p_team and type='event') and not exists(select 1 from public.team_members where team_id=p_team and user_id=a.id)))
    then raise exception 'TASK_ROSTER_ASSIGNEE_INVALID'; end if;
  first_at:=case when p_immediate then now() else p_first end;
  if first_at is null or (not p_immediate and first_at<=now()) then raise exception 'FIRST_PUBLICATION_MUST_BE_FUTURE'; end if;
  insert into public.task_repeat_plans(created_by,team_id,task_scope,title,description,assigned_to,priority,first_publish_at,due_weekday,due_time,occurrence_count)
    values(auth.uid(),p_team,p_scope,trim(p_title),p_description,p_assigned,p_priority,first_at,p_weekday,p_time,p_count) returning id into plan_id;
  for i in 0..p_count-1 loop
    publish_local:=(first_at at time zone 'Asia/Kuala_Lumpur')+make_interval(days=>i*7);
    due_local:=publish_local::date+p_time+make_interval(days=>(p_weekday-extract(dow from publish_local)::integer+7)%7);
    if due_local<=publish_local then due_local:=due_local+interval '7 days'; end if;
    insert into public.task_repeat_occurrences(plan_id,sequence,publish_at,due_date)
      values(plan_id,i+1,publish_local at time zone 'Asia/Kuala_Lumpur',due_local at time zone 'Asia/Kuala_Lumpur');
  end loop;
  if p_immediate then perform public.publish_due_task_plans(); end if;
  return plan_id;
end;
$function$
;

-- RPC: blog_record_visit
CREATE OR REPLACE FUNCTION public.blog_record_visit(p_id uuid, p_visitor uuid, p_session uuid, p_path text, p_source text DEFAULT '(direct)'::text, p_device text DEFAULT 'desktop'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer; begin

  if p_device is null or p_path is null or length(p_path)>200 then return false; end if;

if p_id is null or p_visitor is null or p_session is null or p_device not in ('desktop','mobile','tablet') then return false; end if;
if public.blog_manager() then return false; end if;
if p_path not in ('/','/activities','/bookroom','/about','/literature','/news') then
  if p_path !~ '^/blog/[a-z0-9]+(-[a-z0-9]+)*$' or not exists(select 1 from public.blog_posts where status='published' and '/blog/'||slug=p_path) then return false; end if;
end if;
if length(p_path)>200 or p_path is null then return false; end if;
if p_source is null or (p_source<>'(direct)' and (length(p_source)>253 or p_source !~ '[a-z]' or p_source !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')) then p_source:='(direct)'; end if;
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_visitor::text)::bigint);
if (select count(*) from public.blog_visits where visitor_id=p_visitor and visited_at>now()-interval '1 minute')>=20 then return false; end if;
insert into public.blog_visits(id,visitor_id,session_id,path,source,device,minute_bucket)
values(p_id,p_visitor,p_session,p_path,p_source,p_device,date_trunc('minute',now())) on conflict do nothing;
get diagnostics n=row_count; return n=1;
end $function$
;

notify pgrst, 'reload schema';
commit;

