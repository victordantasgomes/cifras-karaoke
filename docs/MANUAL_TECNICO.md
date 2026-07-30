# Manual Técnico — CIFRAS KARAOKÊ

## Camadas
- `routes/` — tradução HTTP ⇄ serviços; sem regra de negócio.
- `services/` — regras de negócio (auth, songs, setlist, karaoke, history, search, audio, settings, chords).
- `db.py` — pool de conexão Postgres (psycopg3); cada service abre seu próprio `with db.get_pool().connection() as conn:`.
- `services/blob_client.py` — wrapper fino sobre a API REST do Vercel Blob (store **privado** — ver seção Áudio).
- `utils/` — parser do formato TXT, transposição, normalização, slugs.
- `middlewares/` — autenticação JWT (`@require_auth`).

Não há mais camada de repositório/I/O de disco: nenhum service lê/escreve arquivo do usuário — tudo é Postgres (Neon) ou Vercel Blob, o que permite rodar como função serverless (filesystem efêmero). Ver `schema.sql` pro DDL completo e `backend/scripts/migrate_to_postgres.py` (script único, já executado) pra migração dos dados que antes viviam em `backend/data/`.

## Modelo de dados (Postgres)
`songs.header` (jsonb) guarda o cabeçalho completo — mesmo formato de sempre (`utils/parser.py::HEADER_FIELDS`) — e é a fonte da verdade pro que a API devolve. As colunas soltas (`titulo`, `autor`, `interprete`, `tom`, `tags`, `velocidade`, `nota`, `favorita`, `ritmo`) são uma desnormalização proposital, mantida em sincronia pelo próprio `SongsService` a cada create/update, pra busca/filtro/ordenação nunca precisarem abrir o JSONB. `songs.id` (uuid) é estável; `songs.slug` é recalculado a cada update (gênero+intérprete+título) — o frontend trata a troca de slug depois de salvar. `setlists.slug`, ao contrário, é fixado na criação e nunca recalculado.

Tabelas: `users`, `songs`, `song_versions` (histórico, poda pra manter só as 50 mais recentes), `song_plays` (contagem de execuções), `setlists` + `setlist_items` (item guarda `"Intérprete/Título"` cru, resolvido contra `songs` na leitura — mesma ideia de sempre, só que via SQL), `settings` (cores, upsert por `user_id`), `audio_tracks` e `samples` (guardam só `blob_url`/`content_type`, os bytes ficam no Blob).

## Busca
`SearchService.search()` monta `WHERE`/`ORDER BY`/`LIMIT`/`OFFSET` direto em SQL — sem índice em memória pra manter sincronizado, cada busca já é uma query. Busca livre (`q`) usa `pg_trgm::similarity()` como aproximação fuzzy (substitui o `rapidfuzz` de antes). O total da página vem de `count(*) OVER()` na mesma query, não de uma segunda ida ao banco. A listagem seleciona só as colunas que `_row_to_dict` usa (sem `header`/`body`, que só a leitura de uma música específica precisa) — importante num acervo grande, ver nota de performance abaixo.

**Nota de performance:** com um acervo grande (uma migração real trouxe ~24 mil músicas de um usuário), duas armadilhas já apareceram e foram corrigidas: (1) selecionar colunas grandes (`body`/`header`) numa listagem multiplica o payload por linha à toa; (2) usar a *função* `similarity()` numa cláusula `WHERE` não é acelerado pelo índice GIN trigram — precisa do *operador* `%` (ver `SetlistService._resolve_many`, que resolve cada item do setlist contra um pré-filtro indexado por `titulo`, não a tabela inteira).

## Velocidade → tempo por linha
`karaoke_service.velocity_to_ms`: interpolação linear entre 10.000 ms (v=1) e 500 ms (v=100). Constantes `MS_SLOWEST`/`MS_FASTEST` centralizadas para ajuste.

## Classificação e marcação explícita de linhas
`utils.parser.classify_line` é a heurística (letra/acorde/observação) usada quando não há marcação. `utils.parser.parse_body` é a função principal: percorre o corpo linha a linha, resolve `[t=SEG]` (via `parse_line_timing`), marcação explícita `[@tipo]`/`[@tipo:oculta]`/`[@/tipo]` (uma linha ou bloco) e rótulos de seção soltos `[Texto]` (convenção pré-existente no acervo), caindo na heurística quando nada se aplica. Retorna `[{text, t, tipo, visivel}]`. Ver [MARCACAO_CIFRAS.md](MARCACAO_CIFRAS.md) para a sintaxe do ponto de vista do usuário.

`karaoke_service.payload` usa `parse_body` e **filtra** linhas com `visivel=False` antes de montar `lines` — o player nunca recebe esse conteúdo. `ChordSheet.jsx` (frontend) espelha a mesma lógica em `utils/lineClassifier.js` (`classifyLine`/`parseBody`), necessário porque a pré-visualização no editor classifica o texto local a cada digitação, sem round-trip à API; lá, linhas ocultas continuam visíveis (com aviso) para o autor gerenciar.

Tipos com estilo dedicado (`KNOWN_TYPES` em ambos os arquivos): `letra`, `acorde`, `observacao`, `solo`, `riff`, `tab`, `secao`, `sample`. Qualquer outra palavra após `[@` vira tipo customizado (CSS `.custom`, com o nome exibido via `data-tipo`).

## Áudio: faixa de referência, samples e sincronismo
`AudioService` grava a faixa e os samples no **Vercel Blob** (`audio/<user_id>/<slug>/track.<ext>` e `.../samples/<sample_id>.<ext>`, via `blob_client.put`) e guarda só `blob_url`/`content_type` nas tabelas `audio_tracks`/`samples` — os bytes nunca passam pelo Postgres. `sample_id = slugify(nome)`. `karaoke_service.payload` expõe `has_audio: bool` e `samples: [{id, nome, t}]` — um sample só entra na lista se a linha `[@sample] nome` correspondente tiver `t` explícito **e** um upload com nome coincidente (sem os dois, a linha aparece no palco como aviso visual mas não dispara sozinha).

O store do Vercel Blob usado aqui é **privado** (criado assim por padrão) — não dá pra buscar a URL direto do frontend/CDN sem autenticação. Por isso o backend faz o papel de proxy autenticado: `GET /songs/<slug>/audio` e `.../samples/<id>` chamam `blob_client.get(url)` (com `Authorization: Bearer BLOB_READ_WRITE_TOKEN`) e devolvem os bytes via `Response(data, mimetype=content_type)` — não `flask.send_file` (não há mais arquivo local) nem redirect pra URL pública (não existe uma). O frontend busca áudio/samples como **Blob** autenticado via axios (`responseType: 'blob'` + `URL.createObjectURL`) pelo mesmo motivo de sempre: evita um esquema de autenticação por query string só pra tags de mídia, e garante que o clipe já está todo em memória antes de tocar (importante pro caso de uso ao vivo: sem risco de engasgo de rede no meio de um disparo). Essas queries usam `staleTime: Infinity` + `refetchOnWindowFocus: false` deliberadamente — um refetch em segundo plano reatribuiria `audio.src` e resetaria a reprodução no meio de uma apresentação.

No frontend, `utils/timeline.js::resolveTimeline(lines, audioDuration, msPerLine)` resolve o `t`/`tEnd` de cada linha: usa as âncoras explícitas (`t` não nulo, filtradas por ordem crescente e por estarem dentro da duração real do áudio), interpola linearmente entre elas e extrapola antes da primeira / depois da última usando o espaçamento local (ou a duração real do áudio, ou `msPerLine` como último fallback). Sem nenhuma âncora, distribui as linhas uniformemente pela duração real (ou por `msPerLine` até ela ser conhecida). `findActiveIndex` faz busca binária nesse array já resolvido.

`hooks/useAudioSync.js` roda um único loop `requestAnimationFrame` (não vários lendo `currentTime` em momentos diferentes) que, a cada frame: acha a linha ativa (só escreve na store quando o índice muda — ritmo de linha, não de frame), pinta a varredura estilo CDG da linha ativa e a barra de progresso via mutação **direta** de `style` num ref (sem passar pelo ciclo de render do React, que não aguentaria 60 atualizações/s), e dispara os samples cadastrados (um `<audio>` dedicado por sample; a regra `prevTime < t <= currentTime && !triggered` cobre play normal, seek pra frente sem disparo retroativo, e seek pra trás rearmando o disparo). O loop se auto-suspende quando o áudio está pausado, retomando com os eventos `play`/`seeked`.

Player e editor têm um branch limpo entre **modo áudio** (`player.audioMode`, ativado quando `has_audio`) e **modo legado** (cronômetro fixo de `ms_per_line`, como sempre funcionou) — o efeito do cronômetro legado tem uma guarda (`if (player.audioMode) return`) para os dois relógios nunca rodarem ao mesmo tempo. A varredura CSS usa `background-clip: text` com um gradiente atualizado via JS; funciona bem com a fonte monoespaçada porque `%` do gradiente mapeia direto em `%` de caracteres.

## API REST (prefixo /api)

| Método | Rota | Descrição |
|---|---|---|
| POST | /auth/register | Cria usuário e retorna token |
| POST | /auth/login | Autentica (JWT Bearer) |
| GET | /songs | Busca paginada: `q, genero, interprete, tom, ritmo, tag, favoritas, page, page_size(≤500), sort` |
| GET | /songs/facets | Valores distintos para filtros |
| POST | /songs | Upload TXT (multipart `file` + `genero`/`interprete`) ou JSON |
| GET/PUT/DELETE | /songs/&lt;slug&gt; | Ler / editar (gera versão) / excluir (limpa setlists) |
| POST | /songs/&lt;slug&gt;/favorite | `{value: bool}` |
| POST | /songs/&lt;slug&gt;/rating | `{nota: 1..10}` |
| POST | /songs/&lt;slug&gt;/transpose | `{semitones}` ou `{to_key}`, `save` opcional |
| GET | /songs/&lt;slug&gt;/export | Download TXT |
| GET | /songs/&lt;slug&gt;/versions | Lista versões |
| GET | /songs/&lt;slug&gt;/versions/&lt;id&gt; | Conteúdo + diff unificado |
| POST | /songs/&lt;slug&gt;/versions/&lt;id&gt;/restore | Restaura versão |
| GET | /karaoke/&lt;slug&gt; | Payload do player (registra execução; inclui `has_audio` e `samples`) |
| POST/GET/DELETE | /songs/&lt;slug&gt;/audio | Enviar / baixar (stream) / remover a faixa de referência |
| POST/GET | /songs/&lt;slug&gt;/samples | Enviar (multipart `file`+`nome`) / listar samples |
| GET/DELETE | /songs/&lt;slug&gt;/samples/&lt;id&gt; | Baixar (stream) / remover um sample |
| GET/POST | /setlists | Listar / criar |
| GET/PUT/DELETE | /setlists/&lt;id&gt; | Ler / salvar (ordem = ordem do array) / excluir |
| GET | /setlists/&lt;id&gt;/export · POST /setlists/import | Exportar / importar TXT |
| GET | /dashboard | Totais, mais tocadas, recentes, favoritas |

Não existem mais `/reindex`/`/normalize` (eram operações do índice em memória/dos arquivos — sem sentido com Postgres como fonte da verdade).

## Configuração (.env)
`SECRET_KEY`, `JWT_HOURS`, `CORS_ORIGINS`, `LOG_LEVEL`, `DATABASE_URL` (Postgres/Neon, connection string *pooled*), `BLOB_READ_WRITE_TOKEN` (Vercel Blob), `TEST_DATABASE_URL` (só pra suíte de testes — ver seção Testes).

## Testes
`python -m pytest` — unitários (parser, transposição, slug) e integração de serviços contra um Postgres **real** (CRUD, histórico, setlists, karaokê, paginação, áudio/samples com Blob mockado). Cobertura configurada em `pytest.ini`.

`conftest.py` faz `TRUNCATE ... CASCADE` nas tabelas antes de cada teste — por isso exige `TEST_DATABASE_URL` **separada** de `DATABASE_URL` (ex.: uma branch do Neon) e recusa a rodar (`pytest.exit`) se as duas coincidirem ou se a variável não existir. Essa exigência não é teórica: rodar a suíte sem ela apontando sem querer pro banco de produção/dev já apagou dados reais uma vez nesta base.

Frontend não tem framework de teste automatizado configurado; `utils/timeline.js` foi validado via um script Node isolado durante o desenvolvimento (âncoras fora de ordem, fora da duração, zero/uma âncora, busca binária) e o player foi verificado ponta a ponta contra o backend real.

## Roadmap sugerido
Disparo manual de samples (soundboard) como alternativa ao automático · ajuste fino de `[t=…]` por palavra/sílaba (hoje a varredura é proporcional por caractere dentro da linha) · PWA/offline · i18n · tema claro · backup automático agendado · sincronização com nuvem.
