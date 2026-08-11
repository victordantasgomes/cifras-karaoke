# TUMTUMPA

Sistema web para músicos, bandas e ministérios de louvor: exibe **cifras em modo karaokê** (janela de 3 linhas, avanço automático linha a linha) durante apresentações ao vivo. **Não reproduz áudio** — apenas sincroniza a exibição do TXT.

## Stack

| Camada | Tecnologias |
|---|---|
| Backend | Python 3.12+, Flask, JWT (PyJWT), Flask-CORS, psycopg |
| Frontend | React 18, Vite, React Router, Axios, React Query, Zustand, CSS (design system próprio) |
| Armazenamento | **Postgres** (Neon/Vercel Postgres) + **Vercel Blob** (áudio) |
| Hospedagem | Vercel (frontend estático + função serverless Python) |

## Como rodar

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # ajuste SECRET_KEY, DATABASE_URL (Postgres) e BLOB_READ_WRITE_TOKEN
python seed.py              # opcional: cria usuário demo (demo/demo123) com músicas
python app.py               # http://localhost:5000 — cria o schema (schema.sql) sozinho se não existir
```

### Frontend
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxy /api -> :5000)
```

### Testes
```bash
cd backend
python -m pytest            # cobertura configurada em pytest.ini
```
Exige `TEST_DATABASE_URL` em `backend/.env`, apontando pra uma instância
Postgres **separada** da de `DATABASE_URL` (ex.: uma branch no Neon —
Console → Branches → Create branch). A suíte faz `TRUNCATE ... CASCADE` nas
tabelas antes de cada teste; sem essa separação ela roda sem avisar contra
o banco de dados de verdade e apaga tudo (já aconteceu).

## Arquitetura

```
┌───────────────────────────── FRONTEND (React) ─────────────────────────────┐
│  pages/  ──  components/  ──  hooks/                                       │
│     │                                                                      │
│  React Query (dados)      Zustand (auth + player)                          │
│     │                                                                      │
│  services/api.js (Axios + JWT interceptor)                                 │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │ HTTP /api (JSON)
┌──────────────────────────────────▼─────────────────────────────────────────┐
│  routes/api_routes.py      ← só HTTP, zero regra de negócio                │
│  middlewares/auth_middleware.py (JWT)                                      │
│  services/  auth · songs · setlist · karaoke · history · search · settings │
│  db.py (pool Postgres)  ·  services/blob_client.py (Vercel Blob)           │
│  utils/  parser · transpose · slug                                         │
└──────────────────────────────────┬─────────────────────────────────────────┘
                          ▼                          ▼
                     Postgres (Neon)            Vercel Blob
              users, songs, setlists,        áudio (faixa + samples)
              histórico, settings...
```

Empacotado num único projeto Vercel: `api/index.py` expõe a mesma app Flask
como função serverless Python; `vercel.json` builda `frontend/` como site
estático e faz o rewrite de SPA.

## Decisões de performance

- Toda busca/filtro/faceta é uma **query direta no Postgres** (índices em
  `user_id`, `favorita`, `tom`, `ritmo`, `tags` e trigram em
  título/autor/intérprete) — nunca um índice em memória pra manter sincronizado.
- Busca fuzzy via `pg_trgm` nativo do Postgres.
- **Paginação obrigatória** (máx. 500 por página) em todas as listagens.
- **Lista virtualizada** no frontend: renderiza apenas as linhas visíveis.
- O store do Vercel Blob usado aqui é **privado** (sem acesso direto por
  URL) — o backend autentica e faz streaming dos bytes de áudio pro
  frontend (`GET /songs/<slug>/audio`), que busca como blob e usa
  `URL.createObjectURL` (ver `services/audio_service.py` e
  `services/blob_client.py`).

## Deploy na Vercel

Front e back moram no mesmo projeto Vercel: `vercel.json` builda
`frontend/` (Vite) como site estático e roteia `/api/*` pra
`api/index.py`, que expõe a mesma app Flask como função serverless Python
(ver `requirements.txt` na raiz, que só aponta pra
`backend/requirements.txt`).

Configure estas variáveis de ambiente no projeto Vercel (Settings →
Environment Variables) antes do primeiro deploy:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | Connection string *pooled* do Postgres (Neon) — a mesma usada em `backend/.env` |
| `BLOB_READ_WRITE_TOKEN` | Token do Vercel Blob (criado junto com o store, em Storage → Blob) |
| `SECRET_KEY` | Uma chave aleatória forte — nunca a de exemplo do `.env.example` |
| `JWT_HOURS` | Validade do token de login (opcional, padrão `12`) |
| `CORS_ORIGINS` | Pode deixar sem definir/como `*`: front e back ficam no mesmo domínio em produção, então não há CORS cross-origin de verdade |

`VITE_API_URL` **não** deve ser definida em produção — `frontend/src/services/api.js`
já cai em `baseURL: '/api'` (mesma origem) quando ela está vazia.

Antes do primeiro deploy real, rode a migração dos dados locais uma única
vez (`backend/scripts/migrate_to_postgres.py` — ver docstring do arquivo)
contra o mesmo `DATABASE_URL`/`BLOB_READ_WRITE_TOKEN` configurados na Vercel.

## Player Karaokê

- Tela cheia, fundo preto, fonte branca, sem menus; controles surgem ao mover o mouse.
- Janela fixa de **3 linhas** — avanço **linha a linha** (nunca scroll contínuo).
- `@velocidade` (1–100) → ms por linha: `v=1 → 10s/linha`, `v=100 → 0,5s/linha` (linear). Ajustável durante a execução.
- Atalhos: `Espaço` play/pause · `←/→` linha · `↑/↓` velocidade · `R` reiniciar · `F` tela cheia · `ESC` voltar.
- **Preparado para tempo por linha**: o parser já reconhece marcadores `[t=15.2]` e a API expõe `lines[].t` (hoje ignorado pelo player).

## Documentação

- [Manual do usuário](docs/MANUAL_USUARIO.md)
- [Manual técnico + API](docs/MANUAL_TECNICO.md)
