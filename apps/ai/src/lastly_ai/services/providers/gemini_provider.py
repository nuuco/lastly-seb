import json
from typing import Any

import httpx

from lastly_ai.services.providers.base import LlmError

DEFAULT_MODEL = "gemini-2.0-flash"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider:
    """
    Google Gemini generateContent.

    셋 중 유일하게 무료 등급이 있어, 카드 없이 키를 받을 수 있다.

    검색(google_search grounding)은 붙이지 않는다. Gemini 는 검색과
    responseSchema 를 동시에 켜는 것을 허용하지 않아, 둘 중 스키마를 택했다.
    형식이 깨진 응답은 기록 자체를 막지만 검색이 없는 것은 주기 제안만 무뎌진다.
    """

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL) -> None:
        self._api_key = api_key
        self._model = model

    async def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int = 2000,
    ) -> dict[str, Any]:
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json",
                "responseSchema": _to_gemini_schema(schema),
            },
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{BASE_URL}/{self._model}:generateContent",
                headers={"x-goog-api-key": self._api_key},
                json=payload,
            )

        if response.status_code != 200:
            raise LlmError(f"Gemini 오류 {response.status_code}: {response.text[:200]}")

        body = response.json()
        candidates = body.get("candidates") or []
        if not candidates:
            raise LlmError("모델이 빈 응답을 반환했습니다.")

        parts = candidates[0].get("content", {}).get("parts") or []
        text = "".join(part.get("text", "") for part in parts)

        if not text.strip():
            raise LlmError("모델이 빈 응답을 반환했습니다.")

        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise LlmError(f"JSON 파싱 실패: {text[:200]}") from exc

    async def complete_json_with_search(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int = 4000,
    ) -> tuple[dict[str, Any], list[str]]:
        return await self.complete_json(
            system=system, user=user, schema=schema, max_tokens=max_tokens
        ), []


def _to_gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """
    Gemini 는 JSON Schema 를 그대로 받지 않는다.

    타입 이름이 대문자이고, nullable 은 type 배열이 아니라 별도 필드다.
    additionalProperties 같은 검증 키워드는 아예 모른다.
    """
    types = schema.get("type")
    nullable = isinstance(types, list) and "null" in types
    primary = next((t for t in types if t != "null"), "string") if isinstance(types, list) else types

    out: dict[str, Any] = {"type": str(primary).upper()}
    if nullable:
        out["nullable"] = True
    if desc := schema.get("description"):
        out["description"] = desc
    if enum := schema.get("enum"):
        out["enum"] = enum

    if primary == "object":
        props = schema.get("properties", {})
        out["properties"] = {k: _to_gemini_schema(v) for k, v in props.items()}
        # 순서를 고정해야 모델이 필드를 빠뜨리지 않는다.
        out["propertyOrdering"] = list(props.keys())
        if required := schema.get("required"):
            out["required"] = required

    if primary == "array" and isinstance(schema.get("items"), dict):
        out["items"] = _to_gemini_schema(schema["items"])

    return out
