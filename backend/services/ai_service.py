"""Sugestão de campos do cabeçalho via IA (ChatGPT) — só sob demanda, uma
música por vez (nunca em lote: gastar tokens nas ~24 mil músicas do acervo
de uma vez não faz sentido pra um preenchimento que ninguém pediu ainda).
Só pergunta pelos campos que estão de fato vazios — nunca reenvia o que já
está preenchido, e manda só um trecho da cifra (não a letra inteira) pra
economizar token."""
from __future__ import annotations

import json

import openai
from openai import OpenAI

from config import Config

_MODEL = "gpt-4o-mini"
_SUGGESTABLE_FIELDS = ("intérprete", "tom", "ritmomusical", "tags", "autor", "bpm")
_BODY_LINES = 40


class AIError(Exception):
    pass


# o modelo às vezes ecoa a instrução do prompt ("deixe como string vazia")
# em vez de seguir ela — filtro defensivo pra não gravar esse texto como se
# fosse um valor de verdade (bug relatado, viu 13 músicas com isso no banco).
_ECHOED_INSTRUCTION = {"string vazia", "vazio", "string em branco", "vazia"}


def _as_text(value) -> str:
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value)


class AIService:
    def _client(self) -> OpenAI:
        if not Config.OPENAI_API_KEY:
            raise AIError("OPENAI_API_KEY não configurada no servidor.")
        return OpenAI(api_key=Config.OPENAI_API_KEY)

    def suggest_header(self, header: dict, body: str) -> dict:
        """Devolve só os campos sugeridos (pode ser um dict vazio, se nada
        estiver faltando ou a IA não souber preencher nada)."""
        missing = [f for f in _SUGGESTABLE_FIELDS if not (header.get(f) or "").strip()]
        if not missing:
            return {}

        known = {f: header[f] for f in _SUGGESTABLE_FIELDS if f not in missing}
        excerpt = "\n".join(body.splitlines()[:_BODY_LINES])
        prompt = (
            "Você preenche metadados de cifras musicais brasileiras. Com base "
            "no título e no trecho de letra/cifra abaixo, sugira valores para "
            f"os campos faltantes: {', '.join(missing)}.\n"
            f"Título: {header.get('titulo', '')}\n"
            f"Campos já conhecidos: {json.dumps(known, ensure_ascii=False)}\n"
            f"Trecho da cifra:\n{excerpt}\n\n"
            f"Responda só um JSON com exatamente estas chaves: {json.dumps(missing)}. "
            "Sem texto fora do JSON. Campo que você não souber, retorne com o valor \"\" "
            "(uma string JSON vazia de verdade) — nunca escreva as palavras \"string vazia\" "
            "ou qualquer outro texto no lugar do valor."
        )
        try:
            resp = self._client().chat.completions.create(
                model=_MODEL,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0,
            )
        except openai.OpenAIError as e:
            raise AIError(f"Falha ao consultar a IA: {e}") from e
        try:
            data = json.loads(resp.choices[0].message.content)
        except (json.JSONDecodeError, IndexError, AttributeError, TypeError):
            return {}
        result = {}
        for f in missing:
            if not data.get(f):
                continue
            text = _as_text(data[f]).strip()
            if text.lower() in _ECHOED_INSTRUCTION:
                continue
            result[f] = text
        return result
