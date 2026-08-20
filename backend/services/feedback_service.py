"""Feedback da plateia via QR code — ver schema.sql::setlist_feedback_sessions/
feedback_ratings e SetlistDetail.jsx (botão "Ativar feedback").

Sessão de feedback = uma ativação: gera um token curto e imprevisível que
vira a URL do formulário público sem login (`/feedback/<token>`, ver
PublicFeedback.jsx). Só o dono do setlist ativa/desativa/vê o relatório;
qualquer um com o link vota, sem autenticação — por isso os métodos deste
service se dividem em dois grupos: autenticados (dono) e públicos (token).

`current_song_slug` é a fonte de verdade de "qual música está tocando
agora" — atualizado só pelo player (ScrollPlayer.jsx/KaraokeStage.jsx,
autenticado) a cada troca de música durante a reprodução, nunca pelo
formulário público, pra uma nota não poder ser atribuída a outra música por
dessincronia ou de propósito.

Uma setlist pode ter várias sessões ao longo do tempo (cada "Ativar
feedback" cria uma nova; a anterior vira active=false mas as notas já
coletadas continuam no banco) — o relatório sempre soma o histórico inteiro
da setlist, não só a sessão mais recente."""
from __future__ import annotations

import secrets

import db

# mesma convenção de setlist_service.py: FileNotFoundError/PermissionError
# em vez de exceções próprias — os dois services compartilham o mesmo
# conceito de "setlist não encontrado"/"não é dono" e as rotas já sabem
# mapear esses builtins pra 404/403 (ver api_routes.py).


class NoActiveSession(Exception):
    """Token sem sessão ativa, ou sessão ativa mas sem música tocando agora
    — nos dois casos o formulário público não tem pra onde mandar a nota."""
    pass


class FeedbackService:
    def _setlist_row(self, conn, setlist_id: str):
        return conn.execute(
            "select id, user_id, nome from setlists where slug=%s and not deleted",
            (setlist_id,),
        ).fetchone()

    def _require_owner(self, conn, user_id: str, setlist_id: str, is_admin: bool = False):
        row = self._setlist_row(conn, setlist_id)
        if not row:
            raise FileNotFoundError(setlist_id)
        if row["user_id"] is not None and row["user_id"] != user_id and not is_admin:
            raise PermissionError(setlist_id)
        return row

    # ---------- lado autenticado (dono do setlist) ----------
    def activate(self, user_id: str, setlist_id: str, is_admin: bool = False) -> dict:
        with db.get_pool().connection() as conn:
            row = self._require_owner(conn, user_id, setlist_id, is_admin)
            existing = conn.execute(
                "select token from setlist_feedback_sessions where setlist_id=%s and active=true",
                (row["id"],),
            ).fetchone()
            if existing:
                return {"token": existing["token"]}
            token = secrets.token_urlsafe(9)
            conn.execute(
                "insert into setlist_feedback_sessions (setlist_id, token) values (%s, %s)",
                (row["id"], token),
            )
        return {"token": token}

    def deactivate(self, user_id: str, setlist_id: str, is_admin: bool = False) -> None:
        with db.get_pool().connection() as conn:
            row = self._require_owner(conn, user_id, setlist_id, is_admin)
            conn.execute(
                "update setlist_feedback_sessions set active=false where setlist_id=%s and active=true",
                (row["id"],),
            )

    def status(self, user_id: str, setlist_id: str, is_admin: bool = False) -> dict | None:
        with db.get_pool().connection() as conn:
            row = self._require_owner(conn, user_id, setlist_id, is_admin)
            session = conn.execute(
                """select token, current_song_slug from setlist_feedback_sessions
                   where setlist_id=%s and active=true""",
                (row["id"],),
            ).fetchone()
        if not session:
            return None
        return {"token": session["token"], "current_song_slug": session["current_song_slug"]}

    def set_current_song(self, setlist_id: str, slug: str) -> None:
        """Chamado pelo player a cada troca de música dentro de uma setlist —
        sem checar dono de propósito: quem está TOCANDO uma setlist
        compartilhada (não só o dono original) pode ser quem ativou o
        feedback pra própria apresentação, mesma visibilidade de leitura já
        usada pra tocar a playlist. No-op silencioso se a setlist sumiu ou
        não há sessão ativa — nunca deve travar a troca de música."""
        with db.get_pool().connection() as conn:
            row = self._setlist_row(conn, setlist_id)
            if not row:
                return
            conn.execute(
                """update setlist_feedback_sessions set current_song_slug=%s
                   where setlist_id=%s and active=true""",
                (slug, row["id"]),
            )

    def report(self, user_id: str, setlist_id: str, is_admin: bool = False) -> list[dict]:
        with db.get_pool().connection() as conn:
            row = self._require_owner(conn, user_id, setlist_id, is_admin)
            ratings = conn.execute(
                # left join: uma música pode ter sido excluída da biblioteca
                # depois de avaliada — o relatório mostra o slug puro nesse
                # caso raro, em vez de sumir com o histórico.
                """select r.song_slug, r.nota, r.nome, r.observacoes, r.created_at,
                          songs.titulo, songs.interprete
                   from feedback_ratings r
                   join setlist_feedback_sessions s on s.id = r.session_id
                   left join songs on songs.slug = r.song_slug
                   where s.setlist_id = %s
                   order by r.song_slug, r.created_at""",
                (row["id"],),
            ).fetchall()
        by_song: dict[str, dict] = {}
        for r in ratings:
            group = by_song.setdefault(r["song_slug"], {
                "song_slug": r["song_slug"], "titulo": r["titulo"] or r["song_slug"],
                "interprete": r["interprete"] or "", "notas": [], "avaliacoes": [],
            })
            group["notas"].append(r["nota"])
            group["avaliacoes"].append({
                "nome": r["nome"], "nota": r["nota"], "observacoes": r["observacoes"],
                "created_at": r["created_at"].isoformat(),
            })
        result = [
            {
                "song_slug": g["song_slug"], "titulo": g["titulo"], "interprete": g["interprete"],
                "media": round(sum(g["notas"]) / len(g["notas"]), 1),
                "count": len(g["notas"]),
                "avaliacoes": g["avaliacoes"],
            }
            for g in by_song.values()
        ]
        result.sort(key=lambda x: -x["media"])
        return result

    # ---------- lado público (sem auth, token da URL) ----------
    def public_status(self, token: str) -> dict:
        with db.get_pool().connection() as conn:
            session = conn.execute(
                """select s.active, s.current_song_slug, sl.nome as setlist_nome
                   from setlist_feedback_sessions s join setlists sl on sl.id = s.setlist_id
                   where s.token=%s""",
                (token,),
            ).fetchone()
            if not session:
                raise FileNotFoundError(token)
            current_song = None
            if session["current_song_slug"]:
                song = conn.execute(
                    "select titulo, interprete from songs where slug=%s",
                    (session["current_song_slug"],),
                ).fetchone()
                if song:
                    current_song = {"titulo": song["titulo"], "interprete": song["interprete"]}
        return {"setlist_nome": session["setlist_nome"], "active": session["active"], "current_song": current_song}

    def submit_rating(self, token: str, nota: int, nome: str = "", observacoes: str = "") -> None:
        nota = max(1, min(10, int(nota)))
        with db.get_pool().connection() as conn:
            session = conn.execute(
                "select id, active, current_song_slug from setlist_feedback_sessions where token=%s",
                (token,),
            ).fetchone()
            if not session:
                raise FileNotFoundError(token)
            if not session["active"] or not session["current_song_slug"]:
                raise NoActiveSession(token)
            conn.execute(
                """insert into feedback_ratings (session_id, song_slug, nota, nome, observacoes)
                   values (%s, %s, %s, %s, %s)""",
                (session["id"], session["current_song_slug"], nota,
                 (nome or "").strip()[:100], (observacoes or "").strip()[:1000]),
            )
