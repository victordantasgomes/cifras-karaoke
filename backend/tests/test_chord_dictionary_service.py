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
