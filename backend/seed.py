"""Cria um usuário demo com músicas de exemplo. Uso: python seed.py"""
import db
from app import Services

DEMO_SONGS = [
    ("Rock", "Queen", "Bohemian Rhapsody", "Bb", 40, "balada",
     "Gm7          C7\nIs this the real life?\nGm7            C7\nIs this just fantasy?\nBb7                Eb\nCaught in a landslide\n"),
    ("Pop", "Coldplay", "Yellow", "B", 55, "pop rock",
     "B\nLook at the stars\nF#\nLook how they shine for you\nE                    B\nAnd everything you do\n"),
    ("MPB", "Legião Urbana", "Tempo Perdido", "Em", 60, "rock nacional",
     "Em          C\nTodos os dias quando acordo\nG              D\nNão tenho mais o tempo que passou\n"),
    ("Louvor", "Fernandinho", "Grandes Coisas", "G", 50, "adoração",
     "G           D/F#\nGrandes coisas fez o Senhor\nEm7           C\nPor isso estamos alegres\n"),
]

if __name__ == "__main__":
    db.init_schema()  # idempotente — garante as tabelas mesmo rodando antes de app.py
    ctx = Services()
    try:
        user = ctx.auth.register("demo", "demo123", "Usuário Demo")
        print("Usuário criado:", user)
    except Exception as e:
        print("Usuário demo já existe?", e)
        raise SystemExit(0)

    for genero, artista, titulo, tom, vel, ritmo, corpo in DEMO_SONGS:
        content = (f"@titulo: {titulo}\n@intérprete: {artista}\n@tom: {tom}\n"
                   f"@velocidade: {vel}\n@ritmomusical: {ritmo}\n\n{corpo}")
        ctx.songs.create(user["id"], genero, artista, titulo, content)
        print("  +", genero, "/", artista, "/", titulo)

    ctx.setlists.save(user["id"], "Ensaio de Quinta", [
        "Legião Urbana/Tempo Perdido", "Coldplay/Yellow", "Queen/Bohemian Rhapsody",
    ])
    print("Setlist criado. Login: demo / demo123")
