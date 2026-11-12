-- Legacy data: 1 MASTER, 1 ADMIN, 2 plain users (+ one user created later), one client with full content.
insert into auth.users(id, email, created_at) values
  ('00000000-0000-0000-0000-00000000000a', 'master@x.com', now() - interval '4 days'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@x.com',  now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000c', 'func@x.com',   now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000000d', 'abap@x.com',   now() - interval '1 days');
insert into public.profiles(id, nome) select id, split_part(email, '@', 1) from auth.users;
insert into public.app_roles(user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', 'MASTER'),
  ('00000000-0000-0000-0000-00000000000b', 'ADMIN');
insert into public.clients(id, name, created_by) values ('10000000-0000-0000-0000-000000000001', 'ACME', '00000000-0000-0000-0000-00000000000a');
insert into public.client_modules(id, client_id, name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Programas');
insert into public.projects(id, user_id, client_id, name) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'P1');
insert into public.chats(id, user_id, client_id, module_id, project_id, title) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'chat');
insert into public.chat_messages(chat_id, user_id, content) values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'oi');
insert into public.project_documents(id, project_id, user_id, name) values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'doc');
insert into public.client_files(id, client_id, module_id, name, storage_path, user_id, deleted_at) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'a.txt',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/f1', '00000000-0000-0000-0000-00000000000c', now());
insert into storage.objects(bucket_id, name, owner_id) values
  ('client-files', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/f1', '00000000-0000-0000-0000-00000000000c'),
  ('other', 'x/y', null);
