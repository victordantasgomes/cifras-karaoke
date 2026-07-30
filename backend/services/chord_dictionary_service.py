"""Dicionário de acordes (violão, ukulelê, teclado) — dados de referência
estáticos carregados uma vez na memória (ver resources/acordes/*.csv).

Origem dos dados (ver resources/acordes/README, se existir, ou a conversa que
trouxe este pacote): as digitações de cordas foram normalizadas por fórmula
harmônica + critérios automatizados de tocabilidade, não dedilhadas à mão por
um músico — tratar como material de referência a ser curado antes de virar
edição editorial definitiva. O banco de teclado deriva diretamente das
fórmulas intervalares e inversões, então é determinístico/verificável.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

from utils.transpose import transpose_chord

RESOURCES_DIR = Path(__file__).resolve().parent.parent / "resources" / "acordes"
MAX_PAGE_SIZE = 2000  # teclado sozinho tem 1260 registros

_YES = {"sim"}


def _split_dash(value: str) -> list[str]:
    return (value or "").split("-")


def _digit_or_none(token: str) -> int | None:
    """`casas`/`dedos` usam a mesma convenção: X = não toca, 0 = solta/sem
    dedo, número = casa pressionada ou dedo indicado (ver README anexado)."""
    token = token.strip()
    return None if token.upper() == "X" else int(token)


def _int_list(value: str) -> list[int]:
    return [int(x) for x in (value or "").split(",") if x.strip()]


def _pestana(value: str) -> dict:
    value = (value or "").strip()
    sim, _, detalhe = value.partition(";")
    return {"tem": sim.strip().lower() in _YES, "detalhe": detalhe.strip()}


def _string_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "instrumento": row["instrumento"],
        "acorde": row["acorde"],
        "acorde_enarmonico": row["acorde_enarmonico"] or None,
        "tonica": row["tonica"],
        "tonica_pt": row["tonica_pt"],
        "qualidade": row["qualidade"],
        "formula_intervalar": row["formula_intervalar"],
        "variacao": int(row["variacao"]),
        "afinacao": _split_dash(row["afinacao_grave_para_agudo"]),
        "casas": [_digit_or_none(x) for x in _split_dash(row["casas_grave_para_agudo"])],
        "dedos": [_digit_or_none(x) for x in _split_dash(row["dedos_grave_para_agudo"])],
        "notas": _split_dash(row["notas_resultantes"]),
        "casa_inicial": int(row["casa_inicial"]),
        "pestana": _pestana(row["pestana"]),
        "cordas_abafadas": _int_list(row["cordas_abafadas"]),
        "cordas_soltas": _int_list(row["cordas_soltas"]),
        "baixo": row["baixo"],
        "dificuldade": row["dificuldade"],
        "observacoes": row["observacoes"],
        "fonte": row["fonte"],
    }


def _piano_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "instrumento": row["instrumento"],
        "acorde": row["acorde"],
        "acorde_enarmonico": row["acorde_enarmonico"] or None,
        "tonica": row["tonica"],
        "tonica_pt": row["tonica_pt"],
        "qualidade": row["qualidade"],
        "formula_intervalar": row["formula_intervalar"],
        "inversao_numero": int(row["inversao_numero"]),
        "inversao_nome": row["inversao_nome"],
        "notas": _split_dash(row["notas_ordenadas"]),
        "baixo_sugerido": row["baixo_sugerido"],
        "mao_esquerda_sugerida": row["mao_esquerda_sugerida"],
        "mao_direita_sugerida": row["mao_direita_sugerida"],
        "oitava_referencia": row["oitava_referencia"],
        "observacoes": row["observacoes"],
        "fonte": row["fonte"],
    }


def _load_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


class ChordDictionaryService:
    """Carrega os três CSVs (violão/ukulelê/teclado) uma única vez e serve
    busca/filtros/detalhe/transposição sobre a lista em memória — mesmo
    padrão do IndexService para as cifras do usuário, só que aqui os dados
    são globais (não por usuário) e somente leitura."""

    def __init__(self, resources_dir: Path | None = None):
        base = resources_dir or RESOURCES_DIR
        self.qualidades: dict = json.loads((base / "schema.json").read_text(encoding="utf-8")).get("qualidades", {})

        self._por_instrumento: dict[str, list[dict]] = {
            "violao": [_string_row(r) for r in _load_csv(base / "acordes_violao.csv")],
            "ukulele": [_string_row(r) for r in _load_csv(base / "acordes_ukulele.csv")],
            "teclado": [_piano_row(r) for r in _load_csv(base / "acordes_teclado.csv")],
        }
        self._todos: list[dict] = [
            item for instrumento in self._por_instrumento.values() for item in instrumento
        ]
        self._por_id: dict[str, dict] = {item["id"]: item for item in self._todos}

    # ---------- leitura ----------
    def get(self, item_id: str) -> dict | None:
        return self._por_id.get(item_id)

    def list(
        self,
        instrumento: str = "",
        acorde: str = "",
        tonica: str = "",
        qualidade: str = "",
        dificuldade: str = "",
        pestana: str = "",
        page: int = 1,
        page_size: int = 50,
    ) -> dict:
        items = self._todos
        if instrumento:
            items = [i for i in items if i["instrumento"] == instrumento]
        if acorde:
            alvo = acorde.strip().lower()
            items = [i for i in items if i["acorde"].lower() == alvo or (i["acorde_enarmonico"] or "").lower() == alvo]
        if tonica:
            items = [i for i in items if i["tonica"].lower() == tonica.strip().lower()]
        if qualidade:
            items = [i for i in items if i["qualidade"] == qualidade]
        if dificuldade:
            items = [i for i in items if i.get("dificuldade") == dificuldade]
        if pestana == "1":
            items = [i for i in items if i.get("pestana", {}).get("tem")]
        elif pestana == "0":
            items = [i for i in items if not i.get("pestana", {}).get("tem", False)]

        page = max(1, page)
        # o maior instrumento (teclado) tem 1260 registros — o teto existe só
        # pra evitar um page_size absurdo, não pra forçar paginação real; o
        # frontend busca tudo de um instrumento de uma vez (ver ChordDictionary.jsx)
        page_size = max(1, min(page_size, MAX_PAGE_SIZE))
        total = len(items)
        start = (page - 1) * page_size
        return {
            "items": items[start : start + page_size],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, -(-total // page_size)),
        }

    def buscar(self, q: str, instrumento: str = "") -> list[dict]:
        alvo = (q or "").strip().lower()
        if not alvo:
            return []
        items = self._todos if not instrumento else self._por_instrumento.get(instrumento, [])
        exatos = [i for i in items if i["acorde"].lower() == alvo or (i["acorde_enarmonico"] or "").lower() == alvo]
        if exatos:
            return exatos
        return [
            i for i in items
            if alvo in i["acorde"].lower() or alvo in (i["acorde_enarmonico"] or "").lower()
        ]

    def variacoes(self, acorde: str, instrumento: str) -> list[dict]:
        alvo = (acorde or "").strip().lower()
        items = self._por_instrumento.get(instrumento, [])
        results = [i for i in items if i["acorde"].lower() == alvo or (i["acorde_enarmonico"] or "").lower() == alvo]
        key = "variacao" if instrumento != "teclado" else "inversao_numero"
        return sorted(results, key=lambda i: i[key])

    def facetas(self, instrumento: str = "") -> dict:
        items = self._todos if not instrumento else self._por_instrumento.get(instrumento, [])
        facetas = {
            "tonicas": sorted({i["tonica"] for i in items}),
            "qualidades": sorted({i["qualidade"] for i in items}),
            "acordes": sorted({i["acorde"] for i in items}),
        }
        if instrumento != "teclado":
            facetas["dificuldades"] = sorted({i.get("dificuldade", "") for i in items if i.get("dificuldade")})
        return facetas

    # ---------- transposição ----------
    def transpor(self, acorde: str, semitons: int, instrumento: str = "") -> dict:
        """Transpõe o SÍMBOLO do acorde (reaproveita utils/transpose.py, a
        mesma lógica usada nas cifras) e busca de novo no dicionário — nunca
        soma casas direto numa digitação existente (cordas soltas mudam de
        nota ao transpor; ver README anexado)."""
        novo_simbolo = transpose_chord(acorde, semitons)
        novo_simbolo_bemol = transpose_chord(acorde, semitons, prefer_flats=True)
        variacoes = self.variacoes(novo_simbolo, instrumento) if instrumento else []
        if not variacoes and not instrumento:
            variacoes = [i for i in self._todos if i["acorde"].lower() == novo_simbolo.lower()]
        return {
            "original": acorde,
            "semitons": semitons,
            "transposto": novo_simbolo,
            "transposto_enarmonico": novo_simbolo_bemol if novo_simbolo_bemol != novo_simbolo else None,
            "variacoes": variacoes,
        }
