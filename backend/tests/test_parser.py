from utils.parser import (
    HEADER_FIELDS,
    classify_line,
    parse_body,
    parse_line_timing,
    parse_song,
    serialize_song,
)


def test_parse_header_and_body():
    txt = "@titulo: Yellow\n@tom: B\n\nB\nLook at the stars\n"
    s = parse_song(txt)
    assert s.header["titulo"] == "Yellow"
    assert s.header["tom"] == "B"
    assert s.body.startswith("B\nLook")


def test_parse_without_header():
    s = parse_song("C  G  Am\nletra da música")
    assert s.header == {}
    assert "letra" in s.body


def test_serialize_creates_all_fields():
    s = parse_song("@titulo: X\n\ncorpo")
    out = serialize_song(s)
    for f in HEADER_FIELDS:
        assert f"@{f}:" in out
    assert out.rstrip().endswith("corpo")


def test_roundtrip_preserves_body():
    txt = "@titulo: A\n@tom: C\n\nC   G\nlinha 1\n\nAm  F\nlinha 2"
    s1 = parse_song(txt)
    s2 = parse_song(serialize_song(s1))
    assert s1.body == s2.body


def test_line_timing_future():
    t, text = parse_line_timing("[t=15.2] Refrão começa aqui")
    assert t == 15.2 and text == "Refrão começa aqui"
    t, text = parse_line_timing("linha normal")
    assert t is None and text == "linha normal"


def test_classify_line_acorde():
    assert classify_line("Gm7          C7") == "acorde"
    assert classify_line("Bb7   Eb   F#m") == "acorde"


def test_classify_line_observacao():
    assert classify_line("Intro:") == "observacao"
    assert classify_line("(repete 2x)") == "observacao"
    assert classify_line("[Solo de guitarra]") == "observacao"
    assert classify_line("Ponte") == "observacao"


def test_classify_line_letra():
    assert classify_line("Is this the real life?") == "letra"
    assert classify_line("Todos os dias quando acordo") == "letra"
    assert classify_line("") == "letra"
    assert classify_line("   ") == "letra"


def test_parse_body_section_label_convention():
    """Convenção já usada no acervo original: [Refrão], [Solo], [Riff 1]..."""
    body = "[Refrão]\nToda vez que eu te vejo\n[Riff 1]\nGm7  C7"
    entries = parse_body(body)
    assert entries == [
        {"text": "Refrão", "t": None, "tipo": "secao", "visivel": True},
        {"text": "Toda vez que eu te vejo", "t": None, "tipo": "letra", "visivel": True},
        {"text": "Riff 1", "t": None, "tipo": "secao", "visivel": True},
        {"text": "Gm7  C7", "t": None, "tipo": "acorde", "visivel": True},
    ]


def test_parse_body_explicit_inline_tag():
    body = "[@observacao] Toque suave aqui\nLetra normal"
    entries = parse_body(body)
    assert entries[0] == {"text": "Toque suave aqui", "t": None, "tipo": "observacao", "visivel": True}
    assert entries[1]["tipo"] == "letra"


def test_parse_body_explicit_block():
    body = "[@tab]\ne|--0--1--|\nB|--0--3--|\n[@/tab]\nLetra depois"
    entries = parse_body(body)
    assert [e["tipo"] for e in entries] == ["tab", "tab", "letra"]
    assert entries[0]["text"] == "e|--0--1--|"
    assert entries[2]["text"] == "Letra depois"


def test_parse_body_oculta_modifier_hides_from_karaoke():
    body = "[@observacao:oculta] nota só para mim\nLetra visível"
    entries = parse_body(body)
    assert entries[0]["visivel"] is False
    assert entries[0]["tipo"] == "observacao"
    assert entries[1]["visivel"] is True


def test_parse_body_custom_type():
    body = "[@ponte] Aqui muda o clima"
    entries = parse_body(body)
    assert entries[0]["tipo"] == "ponte"


def test_parse_body_unclosed_block_does_not_crash():
    body = "[@solo]\nGm7\nAm7"
    entries = parse_body(body)
    assert [e["tipo"] for e in entries] == ["solo", "solo"]


def test_parse_body_sample_tag():
    body = "[@sample] Nome do Solo"
    entries = parse_body(body)
    assert entries[0] == {"text": "Nome do Solo", "t": None, "tipo": "sample", "visivel": True}


def test_parse_body_sample_with_explicit_time():
    body = "[t=12.5] [@sample] Nome do Solo"
    entries = parse_body(body)
    assert entries[0] == {"text": "Nome do Solo", "t": 12.5, "tipo": "sample", "visivel": True}
