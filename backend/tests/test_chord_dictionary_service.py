import pytest

from services.chord_dictionary_service import ChordDictionaryService


@pytest.fixture(scope="module")
def dic():
    return ChordDictionaryService()


def test_loads_all_instruments(dic):
    facetas = dic.facetas()
    assert set(facetas["tonicas"]) == {
        "A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#",
    }


def test_list_filters_by_instrumento(dic):
    page = dic.list(instrumento="violao", page_size=1000)
    assert page["total"] == 540
    assert len(page["items"]) == 540  # regressão: um teto de page_size baixo demais truncava items sem truncar total
    assert any(i["acorde"] == "Bmaj7" for i in page["items"])  # B é a última tônica no CSV — a mais fácil de cortar


def test_list_teclado_returns_all_1260_rows(dic):
    page = dic.list(instrumento="teclado", page_size=2000)
    assert page["total"] == 1260
    assert len(page["items"]) == 1260


def test_list_filters_by_acorde_and_tonica(dic):
    page = dic.list(instrumento="violao", acorde="Cmaj7")
    assert page["total"] == 3  # 3 variações por acorde
    assert all(i["acorde"] == "Cmaj7" for i in page["items"])


def test_list_filters_by_dificuldade(dic):
    page = dic.list(instrumento="violao", dificuldade="iniciante", page_size=1000)
    assert page["total"] > 0
    assert all(i["dificuldade"] == "iniciante" for i in page["items"])


def test_list_filters_by_pestana(dic):
    page = dic.list(instrumento="violao", pestana="1", page_size=1000)
    assert page["total"] > 0
    assert all(i["pestana"]["tem"] for i in page["items"])


def test_string_row_parses_casas_and_dedos(dic):
    page = dic.list(instrumento="violao", acorde="C")
    row = next(i for i in page["items"] if i["variacao"] == 2)
    assert row["casas"] == [None, 3, 2, 0, 1, 0]
    assert row["dedos"] == [None, 3, 2, 0, 1, 0]
    assert row["casa_inicial"] == 1
    assert row["pestana"]["tem"] is False


@pytest.mark.parametrize("instrumento", ["violao", "ukulele"])
def test_dedos_nunca_repete_um_dedo_em_casas_diferentes(dic, instrumento):
    """Regressão: um dedo em duas casas ao mesmo tempo é fisicamente
    impossível (não é pestana, já que pestana exige a MESMA casa) — ver
    bug reportado no diagrama do dicionário de acordes."""
    page = dic.list(instrumento=instrumento, page_size=2000)
    for item in page["items"]:
        casas_por_dedo = {}
        for casa, dedo in zip(item["casas"], item["dedos"]):
            if not dedo:
                continue
            casas_por_dedo.setdefault(dedo, set()).add(casa)
        for dedo, casas in casas_por_dedo.items():
            assert len(casas) == 1, (
                f"{item['id']}: dedo {dedo} aparece nas casas {casas}"
            )


@pytest.mark.parametrize("instrumento", ["violao", "ukulele"])
def test_pestana_nunca_atropela_uma_casa_pressionada_menor(dic, instrumento):
    """Regressão: uma pestana (mesmo dedo em 2+ cordas na MESMA casa)
    bloqueia fisicamente qualquer acesso a uma casa mais baixa em QUALQUER
    corda entre a mais grave e a mais aguda que ela cobre — um dedo "antes"
    da pestana (casa menor, dentro do alcance dela) é fisicamente
    impossível, só depois (casa igual ou maior) faz sentido."""
    page = dic.list(instrumento=instrumento, page_size=2000)
    for item in page["items"]:
        cordas_por_dedo = {}
        for i, dedo in enumerate(item["dedos"]):
            if dedo:
                cordas_por_dedo.setdefault(dedo, []).append(i)
        for dedo, idxs in cordas_por_dedo.items():
            if len(idxs) < 2:
                continue
            lo, hi = min(idxs), max(idxs)
            pestana_casa = item["casas"][idxs[0]]
            for i in range(lo, hi + 1):
                casa = item["casas"][i]
                assert not (casa and casa < pestana_casa), (
                    f"{item['id']}: pestana do dedo {dedo} na casa {pestana_casa} "
                    f"(cordas {lo + 1} a {hi + 1}) atropela a corda {i + 1}, que "
                    f"precisa da casa {casa}"
                )


@pytest.mark.parametrize("instrumento", ["violao", "ukulele"])
def test_nenhum_acorde_exige_mais_de_4_dedos(dic, instrumento):
    """Regressão: uma mão tem 4 dedos de trastear — se uma digitação
    precisar de mais posições simultâneas que isso (mesmo sem repetir
    dedo em casas diferentes), ela não é tocável como está."""
    page = dic.list(instrumento=instrumento, page_size=2000)
    for item in page["items"]:
        dedos_usados = {d for d in item["dedos"] if d}
        assert not dedos_usados or max(dedos_usados) <= 4, (
            f"{item['id']}: precisa do dedo {max(dedos_usados)}"
        )


def test_f_sustenido_pestana_corrigida(dic):
    item = dic.get("violao-F#-1")
    assert item["casas"] == [2, 1, None, 3, 2, 2]
    assert item["dedos"] == [2, 1, None, 4, 3, 3]
    assert item["pestana"]["tem"] is True
    assert item["pestana"]["detalhe"] == "dedo 3 na casa 2, cordas 5 a 6"


def test_piano_row_parses_notas_e_inversao(dic):
    page = dic.list(instrumento="teclado", acorde="C")
    fundamental = next(i for i in page["items"] if i["inversao_numero"] == 0)
    assert fundamental["notas"] == ["C", "E", "G"]
    primeira_inversao = next(i for i in page["items"] if i["inversao_numero"] == 1)
    assert primeira_inversao["notas"] == ["E", "G", "C"]


def test_buscar_por_simbolo_exato(dic):
    resultado = dic.buscar("Cmaj7", "violao")
    assert len(resultado) == 3
    assert all(i["acorde"] == "Cmaj7" for i in resultado)


def test_buscar_por_enarmonico(dic):
    resultado = dic.buscar("Db", "violao")
    assert resultado
    assert all(i["acorde"] == "C#" for i in resultado)


def test_variacoes_ordenadas(dic):
    variacoes = dic.variacoes("C", "violao")
    assert [v["variacao"] for v in variacoes] == [1, 2, 3]


def test_variacoes_teclado_ordenadas_por_inversao(dic):
    variacoes = dic.variacoes("Cmaj7", "teclado")
    assert [v["inversao_numero"] for v in variacoes] == [0, 1, 2, 3]


def test_get_by_id(dic):
    item = dic.get("violao-C-2")
    assert item is not None
    assert item["acorde"] == "C" and item["variacao"] == 2


def test_get_unknown_id_returns_none(dic):
    assert dic.get("nao-existe") is None


def test_transpor_busca_o_acorde_de_destino(dic):
    resultado = dic.transpor("C", 2, "violao")
    assert resultado["transposto"] == "D"
    assert len(resultado["variacoes"]) == 3
    assert all(v["acorde"] == "D" for v in resultado["variacoes"])


def test_transpor_preserva_qualidade(dic):
    resultado = dic.transpor("Cm7", 3, "violao")
    assert resultado["transposto"] == "D#m7"


def test_qualidades_expoe_formulas(dic):
    assert dic.qualidades["maj7"]["formula"] == "1 3 5 7"
    assert dic.qualidades["maj7"]["intervals"] == [0, 4, 7, 11]
