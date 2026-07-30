"""Rotas da API REST. Nenhuma regra de negócio aqui — apenas HTTP <-> serviços."""
from __future__ import annotations

from flask import Blueprint, Response, g, jsonify, request

from services.auth_service import AuthError
from services.songs_service import SongNotFound


def build_blueprint(ctx) -> Blueprint:
    """ctx: container de serviços (ver app.py)."""
    api = Blueprint("api", __name__, url_prefix="/api")
    protected = ctx.require_auth

    # ---------------- auth ----------------
    @api.post("/auth/register")
    def register():
        d = request.get_json(force=True)
        try:
            user = ctx.auth.register(d.get("username", ""), d.get("password", ""), d.get("name", ""))
        except AuthError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(ctx.auth.login(d["username"], d["password"]) | {"user": user}), 201

    @api.post("/auth/login")
    def login():
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.auth.login(d.get("username", ""), d.get("password", "")))
        except AuthError as e:
            return jsonify({"error": str(e)}), 401

    # ---------------- músicas ----------------
    @api.get("/songs")
    @protected
    def list_songs():
        a = request.args
        return jsonify(ctx.search.search(
            g.user_id,
            q=a.get("q", ""), genero=a.get("genero", ""),
            interprete=a.get("interprete", ""), tom=a.get("tom", ""),
            ritmo=a.get("ritmo", ""), tag=a.get("tag", ""),
            favoritas=a.get("favoritas") == "1",
            page=a.get("page", 1, type=int),
            page_size=a.get("page_size", 50, type=int),
            sort=a.get("sort", "titulo"),
        ))

    @api.get("/songs/facets")
    @protected
    def facets():
        return jsonify(ctx.search.facets(g.user_id))

    @api.post("/songs")
    @protected
    def upload_song():
        if "file" in request.files:
            f = request.files["file"]
            content = f.read().decode("utf-8", errors="replace")
            title = request.form.get("titulo") or f.filename.rsplit(".", 1)[0]
            genre = request.form.get("genero", "Sem Gênero")
            artist = request.form.get("interprete", "Desconhecido")
        else:
            d = request.get_json(force=True)
            content = d.get("content", "")
            title = d.get("titulo", "Sem título")
            genre = d.get("genero", "Sem Gênero")
            artist = d.get("interprete", "Desconhecido")
        return jsonify(ctx.songs.create(g.user_id, genre, artist, title, content)), 201

    @api.get("/songs/<slug>")
    @protected
    def get_song(slug):
        try:
            return jsonify(ctx.songs.get(g.user_id, slug))
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404

    @api.put("/songs/<slug>")
    @protected
    def update_song(slug):
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.songs.update(g.user_id, slug, d.get("header", {}), d.get("body", "")))
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404

    @api.delete("/songs/<slug>")
    @protected
    def delete_song(slug):
        try:
            ctx.songs.delete(g.user_id, slug)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        return "", 204

    @api.post("/songs/<slug>/favorite")
    @protected
    def favorite(slug):
        d = request.get_json(force=True)
        return jsonify(ctx.songs.set_favorite(g.user_id, slug, bool(d.get("value"))))

    @api.post("/songs/<slug>/rating")
    @protected
    def rating(slug):
        d = request.get_json(force=True)
        return jsonify(ctx.songs.set_rating(g.user_id, slug, int(d.get("nota", 5))))

    @api.post("/songs/<slug>/transpose")
    @protected
    def transpose(slug):
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.songs.transpose(
                g.user_id, slug,
                semitones=d.get("semitones"),
                to_key=d.get("to_key"),
                save=bool(d.get("save")),
            ))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    @api.get("/songs/<slug>/export")
    @protected
    def export_song(slug):
        data = ctx.songs.get(g.user_id, slug)
        from utils.parser import Song, serialize_song
        txt = serialize_song(Song(header=data["header"], body=data["body"]))
        return Response(txt, mimetype="text/plain; charset=utf-8", headers={
            "Content-Disposition": f'attachment; filename="{data["titulo"]}.txt"'})

    # ---------------- áudio (faixa de referência + samples) ----------------
    @api.post("/songs/<slug>/audio")
    @protected
    def upload_audio(slug):
        f = request.files.get("file")
        if not f:
            return jsonify({"error": "Arquivo de áudio ausente."}), 400
        try:
            ctx.audio.save_track(g.user_id, slug, f)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        return jsonify({"ok": True}), 201

    @api.get("/songs/<slug>/audio")
    @protected
    def get_audio(slug):
        result = ctx.audio.track_bytes(g.user_id, slug)
        if not result:
            return jsonify({"error": "Esta música não tem áudio enviado."}), 404
        data, content_type = result
        return Response(data, mimetype=content_type or "application/octet-stream")

    @api.delete("/songs/<slug>/audio")
    @protected
    def delete_audio(slug):
        ctx.audio.delete_track(g.user_id, slug)
        return "", 204

    @api.post("/songs/<slug>/samples")
    @protected
    def upload_sample(slug):
        f = request.files.get("file")
        nome = request.form.get("nome", "")
        if not f:
            return jsonify({"error": "Arquivo de áudio ausente."}), 400
        try:
            sample = ctx.audio.save_sample(g.user_id, slug, f, nome)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(sample), 201

    @api.get("/songs/<slug>/samples")
    @protected
    def list_samples(slug):
        return jsonify(ctx.audio.list_samples(g.user_id, slug))

    @api.get("/songs/<slug>/samples/<sample_id>")
    @protected
    def get_sample(slug, sample_id):
        result = ctx.audio.sample_bytes(g.user_id, slug, sample_id)
        if not result:
            return jsonify({"error": "Sample não encontrado."}), 404
        data, content_type = result
        return Response(data, mimetype=content_type or "application/octet-stream")

    @api.delete("/songs/<slug>/samples/<sample_id>")
    @protected
    def delete_sample(slug, sample_id):
        ctx.audio.delete_sample(g.user_id, slug, sample_id)
        return "", 204

    # ---------------- karaokê ----------------
    @api.get("/karaoke/<slug>")
    @protected
    def karaoke(slug):
        try:
            payload = ctx.karaoke.payload(g.user_id, slug)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        ctx.history.register_play(g.user_id, slug)
        return jsonify(payload)

    # ---------------- histórico ----------------
    @api.get("/songs/<slug>/versions")
    @protected
    def versions(slug):
        return jsonify(ctx.history.versions(g.user_id, slug))

    @api.get("/songs/<slug>/versions/<version_id>")
    @protected
    def version_content(slug, version_id):
        try:
            return jsonify({"content": ctx.history.read_version(g.user_id, slug, version_id),
                            "diff": ctx.history.diff(g.user_id, slug, version_id)})
        except FileNotFoundError:
            return jsonify({"error": "Versão não encontrada."}), 404

    @api.post("/songs/<slug>/versions/<version_id>/restore")
    @protected
    def restore(slug, version_id):
        return jsonify(ctx.history.restore(g.user_id, slug, version_id))

    # ---------------- setlists ----------------
    @api.get("/setlists")
    @protected
    def list_setlists():
        return jsonify(ctx.setlists.list(g.user_id))

    @api.post("/setlists")
    @protected
    def create_setlist():
        d = request.get_json(force=True)
        return jsonify(ctx.setlists.save(g.user_id, d.get("nome", "Novo setlist"),
                                         d.get("items", []))), 201

    @api.get("/setlists/<setlist_id>")
    @protected
    def get_setlist(setlist_id):
        try:
            return jsonify(ctx.setlists.get(g.user_id, setlist_id))
        except FileNotFoundError:
            return jsonify({"error": "Setlist não encontrado."}), 404

    @api.put("/setlists/<setlist_id>")
    @protected
    def update_setlist(setlist_id):
        d = request.get_json(force=True)
        return jsonify(ctx.setlists.save(g.user_id, d.get("nome", setlist_id),
                                         d.get("items", []), setlist_id))

    @api.delete("/setlists/<setlist_id>")
    @protected
    def delete_setlist(setlist_id):
        ctx.setlists.delete(g.user_id, setlist_id)
        return "", 204

    @api.get("/setlists/<setlist_id>/export")
    @protected
    def export_setlist(setlist_id):
        txt = ctx.setlists.export_txt(g.user_id, setlist_id)
        return Response(txt, mimetype="text/plain; charset=utf-8", headers={
            "Content-Disposition": f'attachment; filename="{setlist_id}.txt"'})

    @api.post("/setlists/import")
    @protected
    def import_setlist():
        if "file" in request.files:
            content = request.files["file"].read().decode("utf-8", errors="replace")
        else:
            content = request.get_json(force=True).get("content", "")
        return jsonify(ctx.setlists.import_txt(g.user_id, content)), 201

    # ---------------- configurações ----------------
    @api.get("/settings")
    @protected
    def get_settings():
        return jsonify(ctx.settings.get(g.user_id))

    @api.put("/settings")
    @protected
    def update_settings():
        d = request.get_json(force=True)
        return jsonify(ctx.settings.update(g.user_id, d.get("colors", {})))

    # ---------------- dicionário de acordes ----------------
    @api.get("/acordes")
    @protected
    def list_acordes():
        a = request.args
        return jsonify(ctx.chords.list(
            instrumento=a.get("instrumento", ""), acorde=a.get("acorde", ""),
            tonica=a.get("tonica", ""), qualidade=a.get("qualidade", ""),
            dificuldade=a.get("dificuldade", ""), pestana=a.get("pestana", ""),
            page=a.get("page", 1, type=int), page_size=a.get("page_size", 50, type=int),
        ))

    @api.get("/acordes/facetas")
    @protected
    def acordes_facetas():
        return jsonify(ctx.chords.facetas(request.args.get("instrumento", "")))

    @api.get("/qualidades")
    @protected
    def qualidades():
        return jsonify(ctx.chords.qualidades)

    @api.get("/acordes/busca")
    @protected
    def buscar_acordes():
        return jsonify(ctx.chords.buscar(request.args.get("q", ""), request.args.get("instrumento", "")))

    @api.get("/acordes/variacoes")
    @protected
    def acordes_variacoes():
        return jsonify(ctx.chords.variacoes(request.args.get("acorde", ""), request.args.get("instrumento", "")))

    @api.post("/acordes/transpor")
    @protected
    def transpor_acorde():
        d = request.get_json(force=True)
        return jsonify(ctx.chords.transpor(
            d.get("acorde", ""), int(d.get("semitons", 0)), d.get("instrumento", ""),
        ))

    @api.get("/acordes/<item_id>")
    @protected
    def get_acorde(item_id):
        item = ctx.chords.get(item_id)
        if not item:
            return jsonify({"error": "Acorde não encontrado."}), 404
        return jsonify(item)

    # ---------------- dashboard ----------------
    # (as antigas rotas de manutenção /reindex e /normalize somem na migração
    # pra Postgres: não existe mais índice em memória pra reconstruir, e uma
    # linha recém-criada/editada já nasce com o cabeçalho canônico completo
    # — ver SongsService.create/update — então não há mais nada pra
    # "normalizar" depois. Ver Settings.jsx, que perde os cartões correspondentes.)
    @api.get("/dashboard")
    @protected
    def dashboard():
        all_songs = ctx.search.search(g.user_id, page_size=500)["items"]
        plays = ctx.history.plays(g.user_id)
        by_slug = {e["slug"]: e for e in all_songs}

        top = sorted(plays.items(), key=lambda kv: -kv[1]["count"])[:8]
        recent = sorted(plays.items(), key=lambda kv: kv[1].get("last", ""), reverse=True)[:8]
        return jsonify({
            "total_songs": len(all_songs),
            "total_setlists": len(ctx.setlists.list(g.user_id)),
            "favorites": [e for e in all_songs if e["favorita"]][:8],
            "most_played": [by_slug[s] | {"plays": v["count"]} for s, v in top if s in by_slug],
            "recent": [by_slug[s] | {"last": v.get("last")} for s, v in recent if s in by_slug],
        })

    return api
