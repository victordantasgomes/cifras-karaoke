from utils.song_normalizer import normalize_song
from utils.song_title import apply_edited_suffix, apply_original_suffix, clean_title, strip_title_suffix


def test_normalize_fills_missing_header_fields():
    header, _ = normalize_song({"titulo": "Rio de Lágrimas"}, "corpo")
    for f in ("autor", "ritmomusical", "introdução", "tags", "nota", "bpm"):
        assert header[f] == ""


def test_normalize_sets_tom_original_once():
    header, _ = normalize_song({"tom": "G"}, "corpo")
    assert header["tom_original"] == "G"
    assert header["tom_da_cifra"] == "G"

    # rodando de novo com tom diferente (ex.: música transposta depois),
    # tom_original não deve ser sobrescrito
    header2, _ = normalize_song({**header, "tom": "A"}, "corpo")
    assert header2["tom_original"] == "G"
    assert header2["tom_da_cifra"] == "A"


def test_normalize_sets_normalizada_flag():
    header, _ = normalize_song({}, "corpo")
    assert header["normalizada"] == "sim"


def test_normalize_applies_title_suffix():
    header, _ = normalize_song({"titulo": "Trem Bala", "intérprete": "Ana Vilela"}, "corpo")
    assert header["titulo"] == "Trem Bala - Ana Vilela"


def test_normalize_title_suffix_is_idempotent():
    header, _ = normalize_song({"titulo": "Trem Bala", "intérprete": "Ana Vilela"}, "corpo")
    header2, _ = normalize_song(header, "corpo")
    assert header2["titulo"] == "Trem Bala - Ana Vilela"


def test_normalize_strips_legacy_cifra_original_suffix():
    # migração: normalizar de novo uma música que ainda carregava o antigo
    # marcador "- cifra original" (removido a pedido do usuário) não deve
    # deixar o marcador nem duplicar o intérprete.
    header, _ = normalize_song({"titulo": "Trem Bala - Ana Vilela - cifra original", "intérprete": "Ana Vilela"}, "corpo")
    assert header["titulo"] == "Trem Bala - Ana Vilela"


def test_normalize_never_moves_chord_columns():
    # "Db"/"Ab" mudam de grafia (viram "C#"/"G#") — o ponto do teste é que a
    # REESCRITA do texto do acorde não pode deslocar nenhum espaço em volta.
    body = "   Db          Ab          Em\nÉ preciso saber viver"
    _, new_body = normalize_song({"tom": "G"}, body)
    old_lines = body.splitlines()
    new_lines = new_body.splitlines()
    assert len(old_lines) == len(new_lines)
    for old, new in zip(old_lines, new_lines):
        old_ws = [i for i, c in enumerate(old) if c == " "]
        new_ws = [i for i, c in enumerate(new) if c == " "]
        assert old_ws == new_ws, "posição dos espaços mudou"


def test_normalize_canonicalizes_chord_spelling():
    # sem @tom (logo sem preferência por bemóis), acordes convergem pra grafia
    # com sustenido — mesma tabela que utils/transpose.py já usa em produção.
    _, body = normalize_song({}, "Db        Ab\nletra aqui")
    assert body.splitlines()[0] == "C#        G#"


def test_normalize_canonicalizes_section_labels():
    _, body = normalize_song({}, "[ solo ]\nletra")
    assert body.splitlines()[0] == "[Solo]"

    _, body2 = normalize_song({}, "[REFRAO]\nletra")
    assert body2.splitlines()[0] == "[Refrão]"


def test_normalize_leaves_unknown_labels_untouched():
    _, body = normalize_song({}, "[Riff 1]\nletra")
    assert body.splitlines()[0] == "[Riff 1]"


def test_normalize_cleans_slug_style_title_before_suffix():
    # título herdado de nome de arquivo (import antigo) — minúsculo,
    # hífen separando palavra por palavra.
    header, _ = normalize_song({"titulo": "a-alegria", "intérprete": "Zeca Pagodinho"}, "corpo")
    assert header["titulo"] == "A Alegria - Zeca Pagodinho"


def test_normalize_cleans_all_caps_title_before_suffix():
    header, _ = normalize_song({"titulo": "A DESCONHECIDA", "intérprete": "Zeca Pagodinho"}, "corpo")
    assert header["titulo"] == "A Desconhecida - Zeca Pagodinho"


def test_normalize_reruns_cleanly_on_already_normalized_title():
    # renormalizar não deve tentar limpar o sufixo em si nem duplicar nada.
    header, _ = normalize_song({"titulo": "a-alegria", "intérprete": "Zeca Pagodinho"}, "corpo")
    header2, _ = normalize_song(header, "corpo")
    assert header2["titulo"] == "A Alegria - Zeca Pagodinho"


# ---------- utils/song_title.py ----------

def test_strip_title_suffix_removes_legacy_original():
    # legado: "- cifra original" não é mais gerado (ver apply_original_suffix),
    # mas ainda precisa ser reconhecido/removido de títulos antigos.
    assert strip_title_suffix("Trem Bala - Ana Vilela - cifra original") == "Trem Bala"


def test_strip_title_suffix_removes_edited():
    titulo = "Trem Bala - Ana Vilela - cifra editada por: Victor"
    assert strip_title_suffix(titulo) == "Trem Bala"


def test_strip_title_suffix_removes_bare_interprete_when_given():
    assert strip_title_suffix("Trem Bala - Ana Vilela", "Ana Vilela") == "Trem Bala"


def test_strip_title_suffix_leaves_bare_interprete_untouched_without_interprete_arg():
    # sem saber o intérprete, não dá pra distinguir "- Fulano" que é um
    # sufixo de "- Fulano" que faz parte do título de verdade — só remove
    # os sufixos com marcador reconhecível (cifra original/editada por).
    assert strip_title_suffix("Trem Bala - Ana Vilela") == "Trem Bala - Ana Vilela"


def test_strip_title_suffix_noop_on_clean_title():
    assert strip_title_suffix("Trem Bala") == "Trem Bala"


def test_apply_original_suffix_idempotent():
    once = apply_original_suffix("Trem Bala", "Ana Vilela")
    twice = apply_original_suffix(once, "Ana Vilela")
    assert once == twice == "Trem Bala - Ana Vilela"


def test_apply_edited_suffix_replaces_original():
    original = apply_original_suffix("Trem Bala", "Ana Vilela")
    edited = apply_edited_suffix(original, "Ana Vilela", "Victor")
    assert edited == "Trem Bala - Ana Vilela - cifra editada por: Victor"


def test_clean_title_converts_lowercase_slug_to_title_case():
    assert clean_title("a-alegria") == "A Alegria"


def test_clean_title_converts_all_caps_to_title_case():
    assert clean_title("A DESCONHECIDA") == "A Desconhecida"
    assert clean_title("BORBOLETAS") == "Borboletas"


def test_clean_title_lowercases_connector_words_except_first():
    assert clean_title("o-vento-e-o-mar") == "O Vento e o Mar"


def test_clean_title_preserves_parenthetical_version_marker():
    assert clean_title("abre-o-coracao(versão 2)") == "Abre o Coracao (Versão 2)"


def test_clean_title_preserves_numeric_reference():
    # não dá pra recuperar acento/pontuação já perdidos na importação
    # original — só deixa o resultado legível (hífen vira espaço, palavras
    # capitalizadas), não tenta "adivinhar" "Timóteo 3:16" de volta.
    assert clean_title("1-timoteo-3-16") == "1 Timoteo 3 16"


def test_clean_title_leaves_mixed_case_title_untouched():
    assert clean_title("Bohemian Rhapsody") == "Bohemian Rhapsody"


def test_clean_title_leaves_empty_title_untouched():
    assert clean_title("") == ""
    assert clean_title(None) == ""


def test_clean_title_is_idempotent():
    once = clean_title("a-alegria")
    twice = clean_title(once)
    assert once == twice == "A Alegria"
