"""Fábrica da aplicação Flask — CIFRAS KARAOKÊ.

Camadas:
    routes -> services -> Postgres (db.py) + Vercel Blob (blob_client.py)
Nenhuma regra de negócio nas rotas; nenhum SQL/HTTP de storage fora dos
services. Não sobra I/O de disco local nenhum — tudo fala com Postgres
(Neon) ou Vercel Blob, pronto pro filesystem efêmero de uma função
serverless (ver plano de migração em .claude/plans).
"""
from __future__ import annotations

import logging

from flask import Flask, jsonify
from flask_cors import CORS

import db
from config import Config
from middlewares.auth_middleware import require_admin, require_auth
from routes.api_routes import build_blueprint
from services.ai_service import AIService
from services.audio_service import AudioService
from services.auth_service import AuthService
from services.chord_dictionary_service import ChordDictionaryService
from services.clip_queue_service import ClipQueueService
from services.history_service import HistoryService
from services.karaoke_service import KaraokeService
from services.search_service import SearchService
from services.setlist_service import SetlistService
from services.settings_service import SettingsService
from services.songs_service import SongsService


class Services:
    """Container de injeção de dependências."""

    def __init__(self):
        self.auth = AuthService()
        self.search = SearchService()
        self.setlists = SetlistService()
        self.audio = AudioService()
        self.clips = ClipQueueService()
        self.songs = SongsService(setlists=self.setlists, audio=self.audio, clips=self.clips)
        self.audio.songs = self.songs  # injetado depois pra evitar ciclo
        self.clips.songs = self.songs  # idem
        self.karaoke = KaraokeService(self.songs, self.audio, self.clips)
        self.history = HistoryService(self.songs)
        self.settings = SettingsService()
        self.chords = ChordDictionaryService()
        self.ai = AIService()
        self.require_auth = require_auth(self.auth)
        self.require_admin = require_admin(self.auth)


def create_app() -> Flask:
    logging.basicConfig(
        level=Config.LOG_LEVEL,
        format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
    )
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app, origins=Config.CORS_ORIGINS.split(","))

    db.init_schema()  # idempotente (CREATE ... IF NOT EXISTS) — garante o schema em qualquer ambiente novo

    ctx = Services()
    app.register_blueprint(build_blueprint(ctx))

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "app": "cifras-karaoke"})

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000, debug=True)
