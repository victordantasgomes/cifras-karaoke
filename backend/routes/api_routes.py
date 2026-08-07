"""Rotas da API REST. Nenhuma regra de negócio aqui — apenas HTTP <-> serviços."""
from __future__ import annotations

from flask import Blueprint, Response, g, jsonify, request

from services.ai_service import AIError
from services.auth_service import AuthError
from services.billing_service import BillingError
from services.plans_service import DuplicatePlanName, PlanNotFound, StripeSyncError
from services.quota_service import QuotaExceeded
from services.songs_service import NotOwner, SongNotFound


def build_blueprint(ctx) -> Blueprint:
    """ctx: container de serviços (ver app.py)."""
    api = Blueprint("api", __name__, url_prefix="/api")
    protected = ctx.require_auth
    not_blocked = ctx.require_not_blocked

    # ---------------- auth ----------------
    @api.post("/auth/login")
    def login():
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.auth.login(d.get("username", ""), d.get("password", "")))
        except AuthError as e:
            return jsonify({"error": str(e)}), 401

    # Cadastro público (Fase 5) — deliberadamente SEPARADO de
    # POST /admin/users (admin-only, abaixo): nunca lê/repassa `is_admin` do
    # corpo da requisição, então não existe caminho por aqui pra uma conta
    # nova se autopromover. Sempre share_by_default=False (biblioteca
    # privada por padrão) e exige e-mail (usado depois pela Stripe — ver
    # Fase 7). Devolve token na hora — login automático após o cadastro.
    @api.post("/auth/register")
    def register():
        d = request.get_json(force=True)
        email = d.get("email", "").strip()
        if not email:
            return jsonify({"error": "E-mail é obrigatório."}), 400
        try:
            ctx.auth.register(
                d.get("username", ""), d.get("password", ""), d.get("name", ""),
                email=email, share_by_default=False,
            )
            return jsonify(ctx.auth.login(d.get("username", ""), d.get("password", "")))
        except AuthError as e:
            return jsonify({"error": str(e)}), 400

    # ---------------- administração (só is_admin) ----------------
    @api.get("/admin/users")
    @ctx.require_admin
    def admin_list_users():
        return jsonify(ctx.auth.list_users())

    @api.post("/admin/users")
    @ctx.require_admin
    def admin_create_user():
        d = request.get_json(force=True)
        try:
            user = ctx.auth.register(
                d.get("username", ""), d.get("password", ""), d.get("name", ""),
                is_admin=bool(d.get("is_admin", False)),
            )
        except AuthError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(user), 201

    @api.delete("/admin/users/<user_id>")
    @ctx.require_admin
    def admin_delete_user(user_id):
        try:
            ctx.auth.delete_user(user_id, g.user_id)
        except AuthError as e:
            return jsonify({"error": str(e)}), 400
        return "", 204

    @api.post("/admin/users/<user_id>/reset-password")
    @ctx.require_admin
    def admin_reset_password(user_id):
        d = request.get_json(force=True)
        try:
            ctx.auth.reset_password(user_id, d.get("password", ""))
        except AuthError as e:
            return jsonify({"error": str(e)}), 400
        return "", 204

    @api.get("/admin/plans")
    @ctx.require_admin
    def admin_list_plans():
        return jsonify(ctx.plans.list())

    @api.post("/admin/plans")
    @ctx.require_admin
    def admin_create_plan():
        d = request.get_json(force=True)
        try:
            plan = ctx.plans.create(
                d.get("name", ""), int(d.get("max_setlists", 0)),
                int(d.get("storage_limit_mb", 0)), int(d.get("price_cents", 0)),
            )
        except DuplicatePlanName:
            return jsonify({"error": "Já existe um plano com esse nome."}), 400
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except StripeSyncError as e:
            return jsonify({"error": f"Plano não sincronizou com a Stripe: {e}"}), 502
        return jsonify(plan), 201

    @api.put("/admin/plans/<plan_id>")
    @ctx.require_admin
    def admin_update_plan(plan_id):
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.plans.update(
                plan_id, int(d.get("max_setlists", 0)),
                int(d.get("storage_limit_mb", 0)), int(d.get("price_cents", 0)),
            ))
        except PlanNotFound:
            return jsonify({"error": "Plano não encontrado."}), 404
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except StripeSyncError as e:
            return jsonify({"error": f"Plano não sincronizou com a Stripe: {e}"}), 502

    # ---------------- planos (leitura pública p/ usuário logado) + cobrança ----------------
    @api.get("/plans")
    @protected
    def list_plans():
        return jsonify(ctx.plans.list_active())

    @api.get("/billing/status")
    @protected
    def billing_status():
        try:
            return jsonify(ctx.billing.get_status(g.user_id))
        except BillingError as e:
            return jsonify({"error": str(e)}), 400

    @api.post("/billing/checkout-session")
    @protected
    def create_checkout_session():
        d = request.get_json(force=True)
        try:
            url = ctx.billing.create_checkout_session(
                g.user_id, d.get("plan_id", ""),
                d.get("success_url", ""), d.get("cancel_url", ""),
            )
        except BillingError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify({"url": url})

    @api.get("/billing/portal-session")
    @protected
    def get_portal_session():
        try:
            url = ctx.billing.create_portal_session(g.user_id, request.args.get("return_url", ""))
        except BillingError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify({"url": url})

    # Webhook da Stripe — SEM @protected (a Stripe não manda Bearer token; a
    # assinatura no cabeçalho Stripe-Signature é a autenticação daqui).
    @api.post("/stripe/webhook")
    def stripe_webhook():
        try:
            ctx.billing.handle_webhook_event(request.data, request.headers.get("Stripe-Signature", ""))
        except BillingError as e:
            return jsonify({"error": str(e)}), 400
        return "", 200

    @api.post("/admin/plans/<plan_id>/active")
    @ctx.require_admin
    def admin_set_plan_active(plan_id):
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.plans.set_active(plan_id, bool(d.get("value", True))))
        except PlanNotFound:
            return jsonify({"error": "Plano não encontrado."}), 404

    @api.get("/admin/songs/normalize-status")
    @ctx.require_admin
    def admin_normalize_status():
        return jsonify(ctx.songs.normalize_status())

    @api.post("/admin/songs/normalize-batch")
    @ctx.require_admin
    def admin_normalize_batch():
        d = request.get_json(silent=True) or {}
        limit = min(max(int(d.get("limit", 50)), 1), 200)
        return jsonify(ctx.songs.normalize_batch(limit=limit))

    @api.get("/admin/storage/recompute-status")
    @ctx.require_admin
    def admin_storage_recompute_status():
        return jsonify(ctx.audio.storage_recompute_status())

    @api.post("/admin/storage/recompute-batch")
    @ctx.require_admin
    def admin_storage_recompute_batch():
        d = request.get_json(silent=True) or {}
        limit = min(max(int(d.get("limit", 50)), 1), 200)
        return jsonify(ctx.audio.storage_recompute_batch(limit=limit))

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
            only_mine=a.get("only_mine") == "1",
            page=a.get("page", 1, type=int),
            page_size=a.get("page_size", 50, type=int),
            sort=a.get("sort", "titulo"),
            is_admin=g.is_admin,
        ))

    @api.get("/songs/facets")
    @protected
    def facets():
        return jsonify(ctx.search.facets(g.user_id, is_admin=g.is_admin))

    @api.post("/songs")
    @protected
    @not_blocked
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
            return jsonify(ctx.songs.get(g.user_id, slug, is_admin=g.is_admin))
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404

    @api.put("/songs/<slug>")
    @protected
    def update_song(slug):
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.songs.update(
                g.user_id, slug, d.get("header", {}), d.get("body", ""), editor_name=g.name,
            ))
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404

    @api.delete("/songs/<slug>")
    @protected
    def delete_song(slug):
        try:
            ctx.songs.delete(g.user_id, slug, is_admin=g.is_admin)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode excluí-la."}), 403
        return "", 204

    @api.post("/songs/<slug>/shared")
    @protected
    def share_song(slug):
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.songs.set_shared(g.user_id, slug, bool(d.get("value"))))
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode alterar o compartilhamento."}), 403

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
                editor_name=g.name,
            ))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    @api.post("/songs/<slug>/normalize")
    @protected
    def normalize_song_route(slug):
        try:
            return jsonify(ctx.songs.normalize(g.user_id, slug, editor_name=g.name))
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404

    @api.post("/songs/<slug>/ai-suggest")
    @protected
    def ai_suggest_header(slug):
        try:
            data = ctx.songs.get(g.user_id, slug)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        try:
            return jsonify(ctx.ai.suggest_header(data["header"], data["body"]))
        except AIError as e:
            return jsonify({"error": str(e)}), 502

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
    @not_blocked
    def upload_audio(slug):
        f = request.files.get("file")
        if not f:
            return jsonify({"error": "Arquivo de áudio ausente."}), 400
        try:
            ctx.audio.save_track(g.user_id, slug, f)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode enviar áudio."}), 403
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
        try:
            ctx.audio.delete_track(g.user_id, slug)
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode remover o áudio."}), 403
        return "", 204

    @api.post("/songs/<slug>/samples")
    @protected
    @not_blocked
    def upload_sample(slug):
        f = request.files.get("file")
        nome = request.form.get("nome", "")
        if not f:
            return jsonify({"error": "Arquivo de áudio ausente."}), 400
        try:
            sample = ctx.audio.save_sample(g.user_id, slug, f, nome)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode enviar samples."}), 403
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
        try:
            ctx.audio.delete_sample(g.user_id, slug, sample_id)
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode remover samples."}), 403
        return "", 204

    # ---------------- fila de clipes (pedal) ----------------
    @api.post("/songs/<slug>/clips")
    @protected
    @not_blocked
    def upload_clip(slug):
        f = request.files.get("file")
        nome = request.form.get("nome", "")
        if not f:
            return jsonify({"error": "Arquivo de áudio ausente."}), 400
        try:
            clip = ctx.clips.save_clip(g.user_id, slug, f, nome)
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode enviar clipes."}), 403
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(clip), 201

    @api.get("/songs/<slug>/clips")
    @protected
    def list_clips(slug):
        return jsonify(ctx.clips.list_clips(g.user_id, slug))

    @api.post("/songs/<slug>/clips/reorder")
    @protected
    def reorder_clips(slug):
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.clips.reorder_clips(g.user_id, slug, d.get("ids", [])))
        except SongNotFound:
            return jsonify({"error": "Música não encontrada."}), 404
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode reordenar clipes."}), 403

    @api.get("/songs/<slug>/clips/<clip_id>")
    @protected
    def get_clip(slug, clip_id):
        result = ctx.clips.clip_bytes(g.user_id, slug, clip_id)
        if not result:
            return jsonify({"error": "Clipe não encontrado."}), 404
        data, content_type = result
        return Response(data, mimetype=content_type or "application/octet-stream")

    @api.delete("/songs/<slug>/clips/<clip_id>")
    @protected
    def delete_clip(slug, clip_id):
        try:
            ctx.clips.delete_clip(g.user_id, slug, clip_id)
        except NotOwner:
            return jsonify({"error": "Só quem criou esta música (ou um admin) pode remover clipes."}), 403
        return "", 204

    # ---------------- karaokê ----------------
    @api.get("/karaoke/<slug>")
    @protected
    def karaoke(slug):
        try:
            payload = ctx.karaoke.payload(g.user_id, slug, is_admin=g.is_admin)
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
    @not_blocked
    def create_setlist():
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.setlists.save(g.user_id, d.get("nome", "Novo setlist"),
                                             d.get("items", []))), 201
        except QuotaExceeded as e:
            return jsonify({"error": str(e)}), 402

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
        try:
            return jsonify(ctx.setlists.save(g.user_id, d.get("nome", setlist_id),
                                             d.get("items", []), setlist_id))
        except PermissionError:
            return jsonify({"error": "Só quem criou este setlist pode editá-lo."}), 403
        except QuotaExceeded as e:
            return jsonify({"error": str(e)}), 402

    @api.delete("/setlists/<setlist_id>")
    @protected
    def delete_setlist(setlist_id):
        try:
            ctx.setlists.delete(g.user_id, setlist_id)
        except PermissionError:
            return jsonify({"error": "Só quem criou este setlist pode excluí-lo."}), 403
        return "", 204

    @api.post("/setlists/<setlist_id>/share")
    @protected
    def share_setlist(setlist_id):
        d = request.get_json(force=True)
        try:
            return jsonify(ctx.setlists.set_shared(g.user_id, setlist_id, bool(d.get("value"))))
        except FileNotFoundError:
            return jsonify({"error": "Setlist não encontrado."}), 404
        except PermissionError:
            return jsonify({"error": "Só quem criou este setlist pode alterar o compartilhamento."}), 403

    @api.get("/setlists/<setlist_id>/export")
    @protected
    def export_setlist(setlist_id):
        txt = ctx.setlists.export_txt(g.user_id, setlist_id)
        return Response(txt, mimetype="text/plain; charset=utf-8", headers={
            "Content-Disposition": f'attachment; filename="{setlist_id}.txt"'})

    @api.post("/setlists/import")
    @protected
    @not_blocked
    def import_setlist():
        if "file" in request.files:
            content = request.files["file"].read().decode("utf-8", errors="replace")
        else:
            content = request.get_json(force=True).get("content", "")
        try:
            return jsonify(ctx.setlists.import_txt(g.user_id, content)), 201
        except QuotaExceeded as e:
            return jsonify({"error": str(e)}), 402

    # ---------------- uso do plano ----------------
    @api.get("/quota/usage")
    @protected
    def quota_usage():
        return jsonify(ctx.quota.usage(g.user_id) or {})

    # ---------------- configurações ----------------
    @api.get("/settings")
    @protected
    def get_settings():
        return jsonify(ctx.settings.get(g.user_id))

    @api.put("/settings")
    @protected
    def update_settings():
        d = request.get_json(force=True)
        return jsonify(ctx.settings.update(g.user_id, d.get("colors"), d.get("prefs")))

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
        # Nunca busca o acervo inteiro: total vem do count(*) da própria
        # busca, favoritas já filtra no SQL, e most_played/recent só
        # precisam resolver os poucos slugs que aparecem em `plays` — antes
        # isso vinha de escanear até 500 músicas "na sorte" (e podia até
        # perder favoritas/plays fora dessa amostra num acervo grande).
        plays = ctx.history.plays(g.user_id)
        total_songs = ctx.search.search(g.user_id, page_size=1, is_admin=g.is_admin)["total"]
        favorites = ctx.search.search(g.user_id, favoritas=True, page_size=8, is_admin=g.is_admin)["items"]

        top = sorted(plays.items(), key=lambda kv: -kv[1]["count"])[:8]
        recent = sorted(plays.items(), key=lambda kv: kv[1].get("last", ""), reverse=True)[:8]
        needed_slugs = list({s for s, _ in top} | {s for s, _ in recent})
        by_slug = {e["slug"]: e for e in ctx.search.get_by_slugs(g.user_id, needed_slugs, is_admin=g.is_admin)}

        return jsonify({
            "total_songs": total_songs,
            "total_setlists": len(ctx.setlists.list(g.user_id)),
            "favorites": favorites,
            "most_played": [by_slug[s] | {"plays": v["count"]} for s, v in top if s in by_slug],
            "recent": [by_slug[s] | {"last": v.get("last")} for s, v in recent if s in by_slug],
        })

    return api
