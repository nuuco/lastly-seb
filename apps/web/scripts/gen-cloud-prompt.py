#!/usr/bin/env python3
"""
apps/ai 의 문장 해석 지시문·스키마를 실험실용 TS 로 옮긴다.

    python3 apps/web/scripts/gen-cloud-prompt.py

normalizer.py 의 SYSTEM_PROMPT·PARSE_SCHEMA 를 바꿨으면 다시 돌린다.
스키마는 gemini_provider.py 의 _to_gemini_schema 와 같은 규칙으로 바꾼다.
"""
import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "apps/ai/src/lastly_ai/services/normalizer.py"
TARGET = ROOT / "apps/web/src/features/lab/cloud-prompt.generated.ts"


def to_gemini(schema):
    types = schema.get("type")
    nullable = isinstance(types, list) and "null" in types
    primary = next((t for t in types if t != "null"), "string") if isinstance(types, list) else types
    out = {"type": str(primary).upper()}
    if nullable:
        out["nullable"] = True
    if schema.get("description"):
        out["description"] = schema["description"]
    if schema.get("enum"):
        out["enum"] = schema["enum"]
    if primary == "object":
        props = schema.get("properties", {})
        out["properties"] = {k: to_gemini(v) for k, v in props.items()}
        out["propertyOrdering"] = list(props.keys())
        if schema.get("required"):
            out["required"] = schema["required"]
    if primary == "array" and isinstance(schema.get("items"), dict):
        out["items"] = to_gemini(schema["items"])
    return out


values = {}
for node in ast.parse(SOURCE.read_text()).body:
    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
        name = node.targets[0].id
        if name in ("SYSTEM_PROMPT", "PARSE_SCHEMA"):
            values[name] = ast.literal_eval(node.value)

TARGET.write_text(
    f"""/**
 * apps/ai 의 문장 해석 지시문과 스키마 사본. 자동 생성 — 손으로 고치지 않는다.
 * 원본: apps/ai/src/lastly_ai/services/normalizer.py (SYSTEM_PROMPT, PARSE_SCHEMA)
 * 다시 만들기: python3 apps/web/scripts/gen-cloud-prompt.py
 */
export const CLOUD_SYSTEM_PROMPT = {json.dumps(values["SYSTEM_PROMPT"], ensure_ascii=False)};

export const CLOUD_PARSE_SCHEMA = {json.dumps(to_gemini(values["PARSE_SCHEMA"]), ensure_ascii=False, indent=2)} as const;
"""
)
print(f"wrote {TARGET.relative_to(ROOT)}")
