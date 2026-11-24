-- Empêche d'enregistrer (via PostgREST direct) un storage_path hors du dossier de l'utilisateur.
-- "not valid" : ne vérifie pas les lignes existantes, seulement les nouvelles écritures.
alter table public.videos
  add constraint videos_storage_path_owner_check
  check (storage_path like user_id::text || '/%') not valid;

-- Une fois les lignes existantes vérifiées :
-- alter table public.videos validate constraint videos_storage_path_owner_check;
