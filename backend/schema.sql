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
    is_admin      boolean not null default false,
    last_login_at timestamptz,
    login_count   int not null default 0,
    -- default TRUE pros usuários de hoje (criados só pelo admin, banda
    -- única, mesmo comportamento colaborativo de sempre) — o cadastro
    -- público (SaaS multi-tenant) grava FALSE explicitamente pras contas
    -- novas, que começam privadas por padrão (ver songs.shared abaixo).
    share_by_default boolean not null default true,
    created_at    timestamptz not null default now()
);
-- "create table if not exists" não altera uma tabela já existente (é o
-- caso do banco de produção, criado antes destes campos existirem).
alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists login_count int not null default 0;
alter table users add column if not exists share_by_default boolean not null default true;

create table if not exists songs (
    id          uuid primary key default gen_random_uuid(),
    -- nullable: música é da biblioteca global, user_id vira só "quem criou"
    -- (ou clonou) — sobrevive à exclusão do usuário (ver ON DELETE SET NULL
    -- abaixo). slug é único globalmente, não mais por usuário.
    user_id     text references users(id) on delete set null,
    slug        text not null unique,
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
    normalizada boolean not null default false,
    -- default TRUE: grandfathering automático pras ~23.888 músicas já
    -- existentes (continuam visíveis pra todo mundo, sem migração de
    -- dados) — só músicas novas de cadastros públicos nascem privadas,
    -- via users.share_by_default (ver SongsService.create()).
    shared      boolean not null default true,
    header      jsonb not null default '{}'::jsonb,
    body        text not null default '',
    -- aponta pra música original quando esta linha é uma cópia gerada por
    -- edição de não-dono (ver services/songs_service.py::update).
    origin_song_id uuid references songs(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
-- idempotente pro banco de produção/teste, criados antes destes campos
-- existirem — ver README > Testes sobre TEST_DATABASE_URL.
alter table songs add column if not exists normalizada boolean not null default false;
alter table songs add column if not exists origin_song_id uuid references songs(id) on delete set null;
alter table songs add column if not exists shared boolean not null default true;
alter table songs alter column user_id drop not null;
alter table songs drop constraint if exists songs_user_id_fkey;
alter table songs add constraint songs_user_id_fkey
    foreign key (user_id) references users(id) on delete set null;
alter table songs drop constraint if exists songs_user_id_slug_key;
create unique index if not exists idx_songs_slug_unique on songs(slug);
create index if not exists idx_songs_normalizada on songs(normalizada);
create index if not exists idx_songs_origin on songs(origin_song_id);
create index if not exists idx_songs_user on songs(user_id);
create index if not exists idx_songs_user_favorita on songs(user_id, favorita);
create index if not exists idx_songs_user_tom on songs(user_id, tom);
create index if not exists idx_songs_user_ritmo on songs(user_id, ritmo);
create index if not exists idx_songs_user_genero on songs(user_id, genero);
create index if not exists idx_songs_tags on songs using gin(tags);
create index if not exists idx_songs_titulo_trgm on songs using gin(titulo gin_trgm_ops);
create index if not exists idx_songs_autor_trgm on songs using gin(autor gin_trgm_ops);
create index if not exists idx_songs_interprete_trgm on songs using gin(interprete gin_trgm_ops);

-- Biblioteca global: favorita/nota são preferência de QUEM VÊ a música, não
-- da música em si (songs.favorita/songs.nota ficam paradas, sem uso — ver
-- services/songs_service.py). Sem isso, "eu favoritei" apareceria favoritado
-- pra todo mundo.
create table if not exists user_song_prefs (
    user_id  text not null references users(id) on delete cascade,
    song_id  uuid not null references songs(id) on delete cascade,
    favorita boolean not null default false,
    nota     text not null default '',
    primary key (user_id, song_id)
);
create index if not exists idx_user_song_prefs_user_favorita on user_song_prefs(user_id, favorita);

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
    -- nullable pelo mesmo motivo de songs.user_id: excluir o usuário não
    -- pode levar o setlist junto se ele estiver compartilhado.
    user_id    text references users(id) on delete set null,
    slug       text not null,
    nome       text not null,
    shared     boolean not null default true,
    created_at timestamptz not null default now(),
    unique (user_id, slug)
);
-- idempotente pro banco de produção/teste, criados antes destes campos
-- existirem.
alter table setlists add column if not exists shared boolean not null default true;
alter table setlists alter column user_id drop not null;
alter table setlists drop constraint if exists setlists_user_id_fkey;
alter table setlists add constraint setlists_user_id_fkey
    foreign key (user_id) references users(id) on delete set null;

create table if not exists setlist_items (
    id          uuid primary key default gen_random_uuid(),
    setlist_id  uuid not null references setlists(id) on delete cascade,
    position    int not null,
    ref         text not null  -- "Intérprete/Título" cru, resolvido em leitura (ver SetlistService._resolve)
);
create index if not exists idx_setlist_items_setlist on setlist_items(setlist_id, position);

create table if not exists settings (
    user_id text primary key references users(id) on delete cascade,
    colors  jsonb not null default '{}'::jsonb,
    -- preferências avulsas por usuário que não merecem coluna própria — hoje
    -- só {pedalKey}, a tecla do pedal (foot switch) usada no palco (ver
    -- ClipQueueService/karaoke_service.py).
    prefs   jsonb not null default '{}'::jsonb
);
alter table settings add column if not exists prefs jsonb not null default '{}'::jsonb;

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

-- Fila de clipes curtos disparados manualmente por pedal (foot switch) —
-- recurso independente dos `samples` acima (que disparam sozinhos por
-- timestamp `[t=SEG]`): aqui a ordem em `position` é que dita a sequência,
-- sem nenhuma marcação no corpo da cifra.
create table if not exists song_clips (
    id           uuid primary key default gen_random_uuid(),
    song_id      uuid not null references songs(id) on delete cascade,
    position     int not null,
    nome         text not null,
    blob_url     text not null,
    content_type text not null default '',
    size_bytes   bigint not null default 0,
    created_at   timestamptz not null default now()
);
create index if not exists idx_song_clips_song on song_clips(song_id, position);
