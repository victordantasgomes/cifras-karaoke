from utils.song_normalizer import normalize_song
from utils.song_title import apply_edited_suffix, apply_original_suffix, strip_title_suffix


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
    assert header["titulo"] == "Trem Bala - Ana Vilela - cifra original"


def test_normalize_title_suffix_is_idempotent():
    header, _ = normalize_song({"titulo": "Trem Bala", "intérprete": "Ana Vilela"}, "corpo")
    header2, _ = normalize_song(header, "corpo")
    assert header2["titulo"] == "Trem Bala - Ana Vilela - cifra original"


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


# ---------- utils/song_title.py ----------

def test_strip_title_suffix_removes_original():
    assert strip_title_suffix("Trem Bala - Ana Vilela - cifra original") == "Trem Bala"


def test_strip_title_suffix_removes_edited():
    titulo = "Trem Bala - Ana Vilela - cifra editada por: Victor"
    assert strip_title_suffix(titulo) == "Trem Bala"


def test_strip_title_suffix_noop_on_clean_title():
    assert strip_title_suffix("Trem Bala") == "Trem Bala"


def test_apply_original_suffix_idempotent():
    once = apply_original_suffix("Trem Bala", "Ana Vilela")
    twice = apply_original_suffix(once, "Ana Vilela")
    assert once == twice == "Trem Bala - Ana Vilela - cifra original"


def test_apply_edited_suffix_replaces_original():
    original = apply_original_suffix("Trem Bala", "Ana Vilela")
    edited = apply_edited_suffix(original, "Ana Vilela", "Victor")
    assert edited == "Trem Bala - Ana Vilela - cifra editada por: Victor"
