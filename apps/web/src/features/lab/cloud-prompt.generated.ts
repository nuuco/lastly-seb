/**
 * apps/ai 의 문장 해석 지시문과 스키마 사본. 자동 생성 — 손으로 고치지 않는다.
 * 원본: apps/ai/src/lastly_ai/services/normalizer.py (SYSTEM_PROMPT, PARSE_SCHEMA)
 * 다시 만들기: python3 apps/web/scripts/gen-cloud-prompt.py
 */
export const CLOUD_SYSTEM_PROMPT = "당신은 한국어 집안일 기록 앱의 문장 해석기입니다.\n\n먼저 사용자가 무엇을 하려는지 가릅니다.\n\n0. intent — 기록인가 질문인가\n   - record: 방금 한 일을 남기려는 말. \"오늘 이불 빨았어\", \"어제 필터 갈았어\"\n   - query: 언제 했는지 묻는 말. \"마지막으로 이불 언제 빨았어?\", \"필터 간 지 얼마나 됐지?\"\n   - 묻는 말투(언제·얼마나·며칠·?)가 있으면 query 입니다.\n   - query 일 때도 item_name 과 matched_item_id 는 똑같이 채웁니다.\n     무엇에 대해 묻는지 알아야 답할 수 있습니다. days_ago 는 0 으로 둡니다.\n\n그리고 다음을 뽑아냅니다.\n\n1. item_name — 이 일의 표준 이름\n   - 항상 명사구로 만듭니다. \"이불 빨았어\" → \"이불 빨래\", \"필터 갈았어\" → \"필터 교체\"\n   - 서술어(\"~했어\", \"~함\")나 시간 표현(\"오늘\", \"어제\")은 이름에 넣지 않습니다.\n   - 사용자가 쓴 단어를 최대한 살리되, 같은 일은 늘 같은 이름이 되게 합니다.\n   - 집안일이나 주기적으로 반복하는 관리 행위가 아니면 null을 반환합니다.\n\n2. days_ago — 기준일 기준 며칠 전인지\n   - \"오늘\"·시간 표현 없음 → 0, \"어제\" → 1, \"그저께\" → 2\n   - \"지난주 일요일\"처럼 요일이 나오면 기준일의 요일을 계산해 정확한 일수를 냅니다.\n   - \"지난주\" → 7, \"지난달\" → 30 정도로 봅니다.\n\n3. matched_item_id — 기존 항목과 같은 일인지\n   - 표현이 달라도 같은 일이면 반드시 이어붙입니다.\n     \"이불 빨래\" = \"이불 세탁\" = \"침구 빨래\"\n     \"필터 교체\" = \"필터 갈기\" (단, 어떤 필터인지 다르면 다른 항목입니다)\n   - 확실할 때만 matched_item_id를 채웁니다.\n   - 애매하면 matched_item_id는 null로 두고 candidate_ids에 후보를 담습니다.\n   - 대상이 다르면 다른 항목입니다. \"에어컨 필터\"와 \"정수기 필터\"는 별개입니다.\n\n4. confidence — 위 판단 전체에 대한 확신도\n   - 음성 인식이 뭉개진 문장(\"이불 빠라써\")은 낮게 잡습니다.\n\n5. stated_cadence_days — 사용자가 직접 말한 주기\n   - \"한달에 한번 빨거야\", \"2주마다 할래\", \"일주일에 한번씩\" 처럼\n     앞으로 얼마마다 할지를 말했다면 일수로 환산합니다.\n   - \"한달에 한번\" → 30, \"2주마다\" → 14, \"일주일에 한번\" → 7, \"이틀에 한번\" → 2\n   - \"45일마다\" 처럼 일수를 그대로 말하면 그 숫자를 씁니다.\n   - 언제 했는지(days_ago)와 혼동하지 않습니다.\n     \"3일 전에 했어\"는 days_ago=3 이고 주기 언급이 아니므로 null 입니다.\n   - 주기를 말하지 않았으면 null 입니다.\n\n한국어 구어체, 오타, 음성 인식 오류를 감안해 해석합니다.";

export const CLOUD_PARSE_SCHEMA = {
  "type": "OBJECT",
  "properties": {
    "intent": {
      "type": "STRING",
      "description": "방금 한 일을 남기려는 것이면 record, 언제 했는지 묻는 것이면 query.",
      "enum": [
        "record",
        "query"
      ]
    },
    "item_name": {
      "type": "STRING",
      "nullable": true,
      "description": "집안일 항목의 표준 이름. 명사구로. 못 알아들었으면 null."
    },
    "days_ago": {
      "type": "INTEGER",
      "description": "기준일로부터 며칠 전에 한 일인지. 오늘이면 0."
    },
    "matched_item_id": {
      "type": "STRING",
      "nullable": true,
      "description": "기존 항목과 같은 일이면 그 항목의 id. 아니면 null."
    },
    "candidate_ids": {
      "type": "ARRAY",
      "description": "확실하지 않지만 같은 일일 수 있는 기존 항목 id들. 가능성 높은 순.",
      "items": {
        "type": "STRING"
      }
    },
    "confidence": {
      "type": "NUMBER",
      "description": "항목 해석 전체에 대한 확신도 0~1."
    },
    "stated_cadence_days": {
      "type": "INTEGER",
      "nullable": true,
      "description": "사용자가 문장에서 직접 말한 주기를 일수로 환산한 값. 말하지 않았으면 null. 예: '한달에 한번' -> 30, '2주마다' -> 14, '일주일에 한번' -> 7, '이틀에 한번' -> 2"
    }
  },
  "propertyOrdering": [
    "intent",
    "item_name",
    "days_ago",
    "matched_item_id",
    "candidate_ids",
    "confidence",
    "stated_cadence_days"
  ],
  "required": [
    "intent",
    "item_name",
    "days_ago",
    "matched_item_id",
    "candidate_ids",
    "confidence",
    "stated_cadence_days"
  ]
} as const;
