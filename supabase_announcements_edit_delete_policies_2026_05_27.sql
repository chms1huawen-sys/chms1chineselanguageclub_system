alter table public.announcements enable row level security;

drop policy if exists "Announcement managers can update announcements" on public.announcements;
create policy "Announcement managers can update announcements"
on public.announcements
for update
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.role in ('convener_teacher', 'advisor_teacher', 'chairperson')
      and users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.role in ('convener_teacher', 'advisor_teacher', 'chairperson')
      and users.is_active = true
  )
);

drop policy if exists "Announcement managers can delete announcements" on public.announcements;
create policy "Announcement managers can delete announcements"
on public.announcements
for delete
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.role in ('convener_teacher', 'advisor_teacher', 'chairperson')
      and users.is_active = true
  )
);
