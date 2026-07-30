"""Shim da função serverless Python da Vercel — qualquer .py em /api na raiz
do projeto vira uma função automaticamente. `backend/` não é um pacote
instalado (as rotas/services importam entre si com paths absolutos tipo
`from services.songs_service import ...`, assumindo backend/ no sys.path,
igual tests/conftest.py e scripts/migrate_to_postgres.py já fazem), então
precisa entrar no sys.path antes de importar create_app."""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# Em produção (Vercel) as variáveis vêm do dashboard, não de um .env — isso
# é só pra `vercel dev` local encontrar backend/.env (config.py já faz
# load_dotenv() sem path, que só acha o arquivo se o cwd for backend/).
from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

from app import create_app  # noqa: E402

app = create_app()
