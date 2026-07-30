import pytest
from utils.transpose import (is_chord, is_chord_line, transpose_body,
                             transpose_chord, semitones_between)


@pytest.mark.parametrize("chord,semi,expected", [
    ("C", 2, "D"), ("Cm", 2, "Dm"), ("C7", 1, "C#7"), ("Cm7", 3, "D#m7"),
    ("Cmaj7", 2, "Dmaj7"), ("C#", 1, "D"), ("Bb", 2, "C"),
    ("G/B", 2, "A/C#"), ("F#", 6, "C"), ("Ab", 4, "C"),
])
def test_transpose_chord(chord, semi, expected):
    assert transpose_chord(chord, semi) == expected


def test_prefer_flats():
    assert transpose_chord("C", 1, prefer_flats=True) == "Db"


def test_is_chord():
    assert is_chord("Cmaj7") and is_chord("G/B") and is_chord("F#m7")
    assert not is_chord("casa") and not is_chord("Hoje")


def test_chord_line_detection():
    assert is_chord_line("C   G   Am   F")
    assert not is_chord_line("Amanhã vai ser outro dia")


def test_transpose_body_keeps_lyrics():
    body = "C        G\nMinha canção começa"
    out = transpose_body(body, 2)
    assert out.splitlines()[0].split() == ["D", "A"]
    assert out.splitlines()[1] == "Minha canção começa"


def test_semitones_between():
    assert semitones_between("C", "D") == 2
    assert semitones_between("Em", "Gm") == 3
    assert semitones_between("B", "C") == 1
