-- Complemento necessário para atualizar e excluir objetos pelo painel.
drop policy if exists "mvp_storage_select" on storage.objects;
create policy "mvp_storage_select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'media');
