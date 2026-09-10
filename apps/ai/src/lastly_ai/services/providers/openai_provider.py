import json
from typing import Any

import httpx

from lastly_ai.services.providers.base import LlmError

DEFAULT_MODEL = "gpt-4o-mini"
BASE_URL = "https://api.openai.com/v1/chat/completions"


class OpenAiProvider:
    """
    OpenAI Chat Completions.

    SDK 를 쓰지 않고 HTTP 로 직접 부른다. 쓰는 기능이 "스키마를 강제한 JSON 하나"
    뿐이라, 의존성을 하나 더 들이는 값이 그만큼 되지 않는다.

    웹 검색은 붙이지 않는다. Chat Completions 에는 서버 검색 도구가 없고,
    주기 조사는 사전과 기본값으로 대신할 수 있는 부가 기능이다.
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
            "model": self._model,
            "max_completion_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "result",
                    "strict": True,
                    "schema": _strictify(schema),
                },
            },
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                BASE_URL,
                headers={"authorization": f"Bearer {self._api_key}"},
                json=payload,
            )

        if response.status_code != 200:
            raise LlmError(f"OpenAI 오류 {response.status_code}: {response.text[:200]}")

        body = response.json()
        text = body["choices"][0]["message"].get("content") or ""

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
        # 검색 없이 모델이 아는 범위에서 답한다. 참고 주소는 없다.
        return await self.complete_json(
            system=system, user=user, schema=schema, max_tokens=max_tokens
        ), []


def _strictify(schema: dict[str, Any]) -> dict[str, Any]:
    """
    strict 모드는 모든 객체에 additionalProperties: false 와 required 전부를 요구한다.
    우리 스키마는 nullable 을 type 배열로 쓰고 있어 그대로 통과한다.
    """
    out = dict(schema)
    if out.get("type") == "object":
        out["additionalProperties"] = False
        props = out.get("properties", {})
        out["required"] = list(props.keys())
        out["properties"] = {k: _strictify(v) for k, v in props.items()}
    if out.get("type") == "array" and isinstance(out.get("items"), dict):
        out["items"] = _strictify(out["items"])
    return out
