-- Schema Postgres do Cifras Karaokê (ver migração de FilesystemRepository
-- para banco — plano em .claude/plans, sessão de refatoração pra Vercel).
--
-- `songs.header` guarda o dicionário de cabeçalho completo (mesmo formato
-- que utils/parser.py::HEADER_FIELDS sempre teve) — fonte da verdade pra
-- tudo que SongsService.get() devolve. As colunas soltas (titulo, autor,
-- interprete, tom, tags, velocidade, nota, favorita, ritmo) são uma
-- desnormalização proposital: substituem o IndexEntry/IndexService em
-- memória, mantidas em sincronia a cada create/update pelo próprio
-- SongsService, pra busca/filtro/ordenação não precisarem abrir o JSONB.
--
-- Identidade: `songs.id` (uuid) é estável — nunca muda. `songs.slug` é
-- recalculado a cada update (mesmo comportamento de sempre: slug deriva de
-- gênero+intérprete+título, então muda se algum desses mudar; o frontend já
-- trata isso — ver SongEditor.jsx navegando pro slug novo após salvar).
-- `setlists.slug`, ao contrário, é fixado na criação e nunca recalculado
-- (mesmo comportamento do arquivo hoje: renomear um setlist não muda a URL).

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- busca fuzzy (ILIKE/similarity)

create table if not exists users (
    id            text primary key,
    username      text not null unique,
    name          text not null default '',
    password_hash text not null,
    created_at    timestamptz not null default now()
);

create table if not exists songs (
    id          uuid primary key default gen_random_uuid(),
    user_id     text not null references users(id) on delete cascade,
    slug        text not null,
    genero      text not null default '',
    titulo      text not null default '',
    autor       text not null default '',
    interprete  text not null default '',
    tom         text not null default '',
    ritmo       text not null default '',
    tags        text[] not null default '{}',
    velocidade  int not null default 50,
    nota        text not null default '',
    favorita    boolean not null default false,
    header      jsonb not null default '{}'::jsonb,
    body        text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (user_id, slug)
);
create index if not exists idx_songs_user on songs(user_id);
create index if not exists idx_songs_user_favorita on songs(user_id, favorita);
create index if not exists idx_songs_user_tom on songs(user_id, tom);
create index if not exists idx_songs_user_ritmo on songs(user_id, ritmo);
create index if not exists idx_songs_user_genero on songs(user_id, genero);
create index if not exists idx_songs_tags on songs using gin(tags);
create index if not exists idx_songs_titulo_trgm on songs using gin(titulo gin_trgm_ops);
create index if not exists idx_songs_autor_trgm on songs using gin(autor gin_trgm_ops);
create index if not exists idx_songs_interprete_trgm on songs using gin(interprete gin_trgm_ops);

create table if not exists song_versions (
    id        uuid primary key default gen_random_uuid(),
    song_id   uuid not null references songs(id) on delete cascade,
    header    jsonb not null,
    body      text not null,
    saved_at  timestamptz not null default now()
);
create index if not exists idx_song_versions_song on song_versions(song_id, saved_at desc);

create table if not exists song_plays (
    song_id        uuid primary key references songs(id) on delete cascade,
    count          int not null default 0,
    last_played_at timestamptz
);

create table if not exists setlists (
    id         uuid primary key default gen_random_uuid(),
    user_id    text not null references users(id) on delete cascade,
    slug       text not null,
    nome       text not null,
    created_at timestamptz not null default now(),
    unique (user_id, slug)
);

create table if not exists setlist_items (
    id          uuid primary key default gen_random_uuid(),
    setlist_id  uuid not null references setlists(id) on delete cascade,
    position    int not null,
    ref         text not null  -- "Intérprete/Título" cru, resolvido em leitura (ver SetlistService._resolve)
);
create index if not exists idx_setlist_items_setlist on setlist_items(setlist_id, position);

create table if not exists settings (
    user_id text primary key references users(id) on delete cascade,
    colors  jsonb not null default '{}'::jsonb
);

create table if not exists audio_tracks (
    song_id      uuid primary key references songs(id) on delete cascade,
    blob_url     text not null,
    content_type text not null default '',
    uploaded_at  timestamptz not null default now()
);

create table if not exists samples (
    id        uuid primary key default gen_random_uuid(),
    song_id   uuid not null references songs(id) on delete cascade,
    sample_id text not null,
    nome      text not null,
    blob_url  text not null,
    unique (song_id, sample_id)
);
