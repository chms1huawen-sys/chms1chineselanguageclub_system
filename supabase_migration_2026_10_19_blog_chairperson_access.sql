-- Include the chairperson without granting vice-chair or inactive accounts access.
begin;
create or replace function public.blog_manager()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.users u where u.id=auth.uid()
    and u.is_active=true and u.can_manage_blog is distinct from false
    and u.role::text in ('chairperson','convener_teacher','advisor_teacher','advisor','media_lead','vice_media_lead','social_media_editor'));
$$;
comment on column public.users.can_manage_blog is 'NULL/true permits eligible chairperson, teachers and media; false revokes. Other roles cannot gain blog access through this flag.';
commit;
