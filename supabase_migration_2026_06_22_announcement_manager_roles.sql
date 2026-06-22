-- Allow convener teacher, advisor teacher, president, and vice president
-- to create, edit, and delete announcements.

alter table public.announcements enable row level security;

drop policy if exists "Announcement managers can create announcements." on public.announcements;
drop policy if exists "Announcement managers can create announcements" on public.announcements;
create policy "Announcement managers can create announcements."
on public.announcements
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_active = true
      and users.role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
  )
);

drop policy if exists "Announcement managers can update announcements." on public.announcements;
drop policy if exists "Announcement managers can update announcements" on public.announcements;
create policy "Announcement managers can update announcements."
on public.announcements
for update
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_active = true
      and users.role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_active = true
      and users.role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
  )
);

drop policy if exists "Announcement managers can delete announcements." on public.announcements;
drop policy if exists "Announcement managers can delete announcements" on public.announcements;
create policy "Announcement managers can delete announcements."
on public.announcements
for delete
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_active = true
      and users.role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
  )
);

notify pgrst, 'reload schema';
