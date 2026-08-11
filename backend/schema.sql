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
    -- nullable: contas admin-criadas de hoje nunca coletaram e-mail.
    -- Cadastro público (Fase 5) sempre grava um. Unicidade só quando
    -- presente (índice parcial abaixo) — várias linhas com email NULL não
    -- colidem entre si.
    email         text,
    email_verified boolean not null default false,
    -- cidade onde o usuário mora, texto livre (sem geocoding) — usada por
    -- alerts_service.py pra cruzar com a cidade de um anúncio do mural.
    -- Comparação sempre normalizada (lower(trim(...))) na hora de ler,
    -- nunca gravada normalizada aqui (mantém o que o usuário digitou pra
    -- exibição).
    city          text not null default '',
    created_at    timestamptz not null default now()
);
-- "create table if not exists" não altera uma tabela já existente (é o
-- caso do banco de produção, criado antes destes campos existirem).
alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists login_count int not null default 0;
alter table users add column if not exists share_by_default boolean not null default true;
alter table users add column if not exists email text;
alter table users add column if not exists email_verified boolean not null default false;
alter table users add column if not exists city text not null default '';
create unique index if not exists idx_users_email_unique on users(email) where email is not null;

-- Instrumentos que o usuário toca + nível técnico em cada um — vocabulário
-- fechado (ver backend/utils/instruments.py), validado na escrita em
-- auth_service.py, nunca aqui (mesmo padrão do resto do schema, sem CHECK).
-- Usado no perfil (ProfileModal) e por alerts_service.py pro cruzamento
-- com instruments_needed de um anúncio do mural.
create table if not exists user_instruments (
    user_id     text not null references users(id) on delete cascade,
    instrument  text not null,
    skill_level text not null default '',
    primary key (user_id, instrument)
);

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

-- Favoritos de gênero/intérprete (Fase 6) — mesmo raciocínio de
-- user_song_prefs (preferência por usuário sobre algo compartilhado), mas
-- sobre o VALOR do facet, não sobre uma música específica. "interprete"/
-- "genero" continuam texto livre (sem tabela normalizada de artistas —
-- search_service.py::facets() já deriva os valores distintos assim, mesma
-- convenção). Favoritar "Legião Urbana" só precisa bater com o texto que já
-- existe em songs.interprete, não referencia nenhuma linha específica.
create table if not exists user_favorite_artists (
    user_id    text not null references users(id) on delete cascade,
    interprete text not null,
    primary key (user_id, interprete)
);
create table if not exists user_favorite_genres (
    user_id text not null references users(id) on delete cascade,
    genero  text not null,
    primary key (user_id, genero)
);

-- Logo de marca própria (whitelabel, Fase 8) — um por usuário, mesmo padrão
-- de audio_tracks (metadado aqui, bytes no Vercel Blob). Leitura pública de
-- propósito (GET /branding/<user_id>/logo, sem @protected): o player de
-- karaokê e os posts do mural (Fase 9) mostram a logo pra visitante sem
-- login. Só upload/exclusão exigem dono (checado na rota).
-- 4 variantes por usuário (preta/branca/colorida-clara/colorida-escura) —
-- o sistema escolhe automaticamente a mais adequada pro tema de quem está
-- vendo (ver BrandingService.resolve_logo). `variant` entra na chave
-- primária composta (idempotente via ALTER, pra não quebrar quem já tinha
-- uma logo salva do esquema antigo "um logo por usuário").
create table if not exists user_logos (
    user_id      text references users(id) on delete cascade,
    blob_url     text not null,
    content_type text not null default '',
    size_bytes   bigint not null default 0,
    uploaded_at  timestamptz not null default now()
);
alter table user_logos add column if not exists variant text not null default 'color_dark';
alter table user_logos drop constraint if exists user_logos_pkey;
alter table user_logos add primary key (user_id, variant);

-- Mural "monte uma banda" (Fase 9) — anúncios públicos de vaga/formação.
-- `user_id` aqui é NOT NULL + ON DELETE CASCADE (diferente do padrão de
-- conteúdo/SET NULL usado em songs/setlists): um anúncio sem ninguém pra
-- contatar não tem valor nenhum, ao contrário de uma música/setlist órfã,
-- que continua útil sem dono. `setlist_refs` linka opcionalmente setlists
-- do próprio autor (ids, resolvidos/validados na escrita — ver
-- band_board_service.py). Desativação nunca é exclusão de verdade (mesmo
-- raciocínio de SetlistService.set_shared()).
create table if not exists band_posts (
    id                  uuid primary key default gen_random_uuid(),
    user_id             text not null references users(id) on delete cascade,
    band_name           text not null default '',
    -- cidade do anúncio, mesmo raciocínio de users.city (texto livre, sem
    -- geocoding) — usada por alerts_service.py pro cruzamento de cidade.
    city                text not null default '',
    genero              text not null default '',
    style_freeform      text not null default '',
    skill_level         text not null default '',
    goal                text not null default '',
    -- vocabulário fechado (ver WEEKDAYS em band_board_service.py) — era
    -- texto livre antes; mesma ressalva de instruments_needed abaixo pra
    -- anúncios antigos.
    rehearsal_days      text[] not null default '{}',
    -- vocabulário fechado desde a melhoria de alertas (ver
    -- backend/utils/instruments.py) — era texto livre antes; anúncios
    -- antigos com texto livre continuam com os valores antigos na coluna,
    -- só não batem com o vocabulário novo até o dono reeditar o anúncio.
    instruments_needed  text[] not null default '{}',
    -- só relevante quando "vocals" está em instruments_needed — texto
    -- livre (ex.: "Português e Inglês"), nunca validado contra nada.
    vocal_languages     text not null default '',
    -- links de redes sociais da banda (Instagram, Facebook, etc.) — cada
    -- item validado como URL (http/https) na escrita, ver
    -- band_board_service.py; texto livre além disso (sem exigir domínio
    -- específico, novas redes aparecem o tempo todo).
    social_links        text[] not null default '{}',
    bio                 text not null default '',
    contact_info        text not null default '',
    setlist_refs        uuid[] not null default '{}',
    active              boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
alter table band_posts add column if not exists city text not null default '';
alter table band_posts add column if not exists vocal_languages text not null default '';
alter table band_posts add column if not exists social_links text[] not null default '{}';
create index if not exists idx_band_posts_active on band_posts(active) where active = true;

-- O que o usuário já dispensou/leu no sino de alertas (ver
-- alerts_service.py) — lista de correspondências em si NUNCA é persistida
-- (computada ao vivo a cada GET /me/alerts, cidade+instrumento), só o que
-- foi dispensado precisa de memória entre uma consulta e outra.
create table if not exists user_alert_dismissals (
    user_id      text not null references users(id) on delete cascade,
    post_id      uuid not null references band_posts(id) on delete cascade,
    dismissed_at timestamptz not null default now(),
    primary key (user_id, post_id)
);

-- Mídia anexada a um anúncio (fotos, vídeos, links e vídeos do YouTube —
-- melhoria à Fase 9) — até BandBoardService.MAX_MEDIA_PER_POST itens por
-- anúncio, ordenados por created_at (sem reordenação manual, fora de
-- escopo). `kind` distingue upload de verdade (photo/video, bytes no Blob
-- privado, sempre servidos via proxy do backend — mesmo padrão de
-- audio_tracks/song_clips) de link externo (link/youtube, só a URL
-- informada, sem upload). Exatamente um dos dois (blob_url / external_url)
-- é preenchido conforme `kind` — validado em BandBoardService, não em
-- constraint de banco (mesmo padrão do resto do schema, sem CHECK).
create table if not exists band_post_media (
    id           uuid primary key default gen_random_uuid(),
    post_id      uuid not null references band_posts(id) on delete cascade,
    kind         text not null,
    label        text not null default '',
    blob_url     text,
    external_url text,
    content_type text not null default '',
    size_bytes   bigint not null default 0,
    created_at   timestamptz not null default now()
);
create index if not exists idx_band_post_media_post on band_post_media(post_id, created_at);

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
    -- 0 = ainda não medido (linhas antigas, de antes da Fase 8) — ver
    -- POST /admin/storage/recompute-batch, que preenche em lote via HEAD
    -- contra o blob. Upload novo já grava o valor certo na hora.
    size_bytes   bigint not null default 0,
    uploaded_at  timestamptz not null default now()
);
alter table audio_tracks add column if not exists size_bytes bigint not null default 0;

create table if not exists samples (
    id         uuid primary key default gen_random_uuid(),
    song_id    uuid not null references songs(id) on delete cascade,
    sample_id  text not null,
    nome       text not null,
    blob_url   text not null,
    size_bytes bigint not null default 0,  -- ver comentário em audio_tracks.size_bytes
    unique (song_id, sample_id)
);
alter table samples add column if not exists size_bytes bigint not null default 0;

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

-- Planos pagos do SaaS multi-tenant (Hobby/Practice/Professional — nomes e
-- valores definidos pelo admin, não fixos no código). `stripe_product_id`/
-- `stripe_price_id` ficam vazios até a Fase 7 (integração com Stripe)
-- preenchê-los. Nunca excluído de verdade uma vez referenciado por algum
-- usuário (Fase 7) — só arquivado (`active=false`), pra não quebrar FK nem
-- o histórico de eventos de webhook da Stripe.
create table if not exists plans (
    id                 uuid primary key default gen_random_uuid(),
    name               text not null unique,
    max_setlists       int not null,
    storage_limit_mb   int not null,
    price_cents        int not null,
    stripe_product_id  text,
    stripe_price_id    text,
    active             boolean not null default true,
    created_at         timestamptz not null default now()
);

-- Estado de assinatura fica direto em `users` (não numa tabela separada) —
-- cada tenant é 1 login com no máximo 1 assinatura ativa, confirmado no
-- plano; uma tabela própria seria generalidade sem uso agora. Precisa vir
-- DEPOIS da criação de `plans` acima (plan_id referencia essa tabela).
-- `subscription_status`: none|trialing|active|past_due|canceled.
alter table users add column if not exists plan_id uuid references plans(id);
alter table users add column if not exists stripe_customer_id text;
alter table users add column if not exists stripe_subscription_id text;
alter table users add column if not exists subscription_status text not null default 'none';
alter table users add column if not exists current_period_end timestamptz;

-- Contagem de visitas na landing page (Fase 5) — usada pelo painel admin de
-- vendas (Fase 14). Uma linha por visita, sem dado pessoal nenhum (nem IP);
-- a granularidade por timestamp permite quebrar por dia/semana na leitura.
create table if not exists landing_page_views (
    id        bigserial primary key,
    viewed_at timestamptz not null default now()
);
create index if not exists idx_landing_page_views_time on landing_page_views(viewed_at);

-- Pings de atividade (Fase 12) — um "sinal de vida" a cada ~45-60s enquanto
-- a aba do usuário está visível (ver useActivityPing.js). Tempo de sessão
-- não é pré-computado aqui: a leitura (Fase 13) agrupa pings por gap em
-- sessões e calcula a duração aproximada — é uma heurística, não uma
-- medição exata de tempo de uso.
create table if not exists activity_pings (
    id        bigserial primary key,
    user_id   text not null references users(id) on delete cascade,
    pinged_at timestamptz not null default now()
);
create index if not exists idx_activity_pings_user_time on activity_pings(user_id, pinged_at);

-- Histórico de transições de status de assinatura (Fase 14) — gravado por
-- BillingService.handle_webhook_event() sempre que um webhook da Stripe
-- muda users.subscription_status. Sem isso, o painel de vendas só
-- conseguiria mostrar "quantos estão cancelados agora", sem tendência ao
-- longo do tempo (o estado atual já vive em users, não duplicado aqui).
create table if not exists subscription_events (
    id           bigserial primary key,
    user_id      text not null references users(id) on delete cascade,
    old_status   text,
    new_status   text not null,
    occurred_at  timestamptz not null default now()
);
create index if not exists idx_subscription_events_user on subscription_events(user_id, occurred_at);
