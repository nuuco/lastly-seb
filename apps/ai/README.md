# @lastly/ai

문장 해석과 주기 추천. FastAPI.

**AI는 거들 뿐이다.** 이 서비스가 죽어도 앱은 돌아야 한다.
모든 응답 실패는 `apps/api` 쪽에서 `null` 로 흡수되고, 규칙 기반으로 폴백한다.
그래서 여기 코드는 예외를 삼키고 `None` 을 돌려주는 자리가 많다 — 실수가 아니라 설계다.

```bash
pnpm --filter @lastly/ai dev      # :8000
```

http://localhost:8000/docs 에서 스펙을 볼 수 있다.

---

## 이 서비스가 하는 네 가지

설계상 AI가 맡기로 한 일은 이게 전부다.

| 하는 일 | 어디서 |
|---|---|
| 자연어 한 문장을 항목 + 날짜로 바꾼다 | `services/normalizer.py` |
| 표현이 달라도 같은 항목으로 묶는다 | `normalizer.py` + `services/embeddings.py` |
| 해온 기록에서 그 사람의 주기를 알아낸다 | `services/cadence.py` |
| 처음 보는 일은 남들이 얼마마다 하는지 찾아온다 | `cadence.py` 의 `_research` |

---

## 폴더

```
src/lastly_ai/
├── main.py              앱 조립. DB 없이도 뜬다
├── core/config.py       환경변수 (모노레포 루트 .env 공유)
├── api/
│   ├── deps.py          의존성 주입 + 내부 토큰 검사
│   └── v1/routes/       health.py, capture.py
├── schemas/capture.py   요청·응답 모델 (pydantic)
├── services/
│   ├── providers/       제공자 어댑터 (anthropic · openai · gemini)
│   ├── normalizer.py    문장 → 항목 + 날짜
│   ├── cadence.py       주기 계산·추천
│   └── embeddings.py    이름 임베딩
└── repositories/
    └── priors.py        커뮤니티 주기 사전 캐시
tests/test_cadence.py
```

---

## 엔드포인트

전부 `x-internal-token` 헤더를 요구한다. `apps/api` 만 부른다.

| | 하는 일 |
|---|---|
| `POST /v1/parse` | 문장 → 항목명, 며칠 전, 기존 항목 매칭, 확신도 |
| `POST /v1/cadence/suggest` | 이력 또는 커뮤니티 통계로 주기 제안 |
| `POST /v1/embed` | 항목 이름 임베딩 (1536차원) |
| `GET /healthz` | 살아 있는지 |
| `GET /readyz` | DB까지 붙었는지 |

`/healthz` 는 DB를 안 본다. DB가 없어도 파싱은 되기 때문이다.

---

## 0. 키는 요청에 실려 온다 — `providers/`

이 서비스는 **LLM 키를 보관하지 않는다.** 매 요청의 `caller` 에 제공자와 키가 실려 오고,
`build_provider()` 가 그것으로 클라이언트를 만들어 한 번 쓰고 버린다.
사용자가 각자 자기 키를 등록해 자기 몫만 쓰기 때문이다 (정책은 루트 README 참고).

제공자마다 다른 건 두 메서드뿐이라, 그 차이만 어댑터가 흡수한다.

| | 구조화 출력을 켜는 방법 | 웹 검색 |
|---|---|---|
| Anthropic | `output_config.format` | `web_search_20260209` 서버 툴 |
| OpenAI | `response_format.json_schema` (strict) | 없음 |
| Gemini | `generationConfig.responseSchema` | 안 켠다 |

Gemini 는 JSON Schema 를 그대로 받지 않아 `_to_gemini_schema()` 가 옮긴다 —
타입 이름이 대문자고, nullable 이 별도 필드고, `additionalProperties` 를 모른다.

Gemini 에 검색을 붙이지 않은 건 **검색과 `responseSchema` 를 동시에 켤 수 없어서**다.
스키마를 택했다. 형식이 깨진 응답은 기록 자체를 막지만, 검색이 없으면 주기 제안만 무뎌진다.

> OpenAI · Gemini 어댑터는 아직 실제 키로 검증되지 않았다. 등록 사용자가 생기면 확인할 것.

---

## 1. 문장 해석 — `normalizer.py`

입력은 문장 하나와 **그 사용자의 기존 항목 목록**이다. 목록을 같이 넘기는 게 핵심이다.
LLM이 "이불 세탁했어"를 보고 기존 `이불 빨래` 를 직접 골라주므로,
문자열이 달라도 같은 항목으로 들어간다.

구조화 출력(`output_config.format`)으로 JSON 스키마를 강제한다. 파싱 실패가 없다.
받는 값은 다섯 개다.

```
item_name       표준 이름 (명사구). 못 알아들으면 null
days_ago        기준일로부터 며칠 전. 오늘이면 0
matched_item_id 기존 항목과 같은 일이면 그 id
candidate_ids   확실하진 않지만 같을 수 있는 id들, 가능성 높은 순
confidence      0~1
```

`matched_item_id` 가 채워지면 확인 시트로, `candidate_ids` 만 있으면
"혹시 이건가요?" 화면으로 간다. **어느 화면으로 보낼지 정하는 건 여기가 아니라
`apps/api` 의 `capture.service.ts` 다.** 여기는 재료만 준다.

> LLM이 없는 id를 지어낼 수 있다. `apps/api` 가 받은 id를 실제 목록과 대조해서 거른다.

## 2. 같은 항목으로 묶기 — `embeddings.py`

이름을 1536차원 벡터로 만들어 `items.name_embedding` 에 저장한다.
Postgres `match_items` RPC가 이 벡터의 코사인 유사도로 후보를 찾는다.

`VOYAGE_API_KEY` 가 비어 있으면 임베딩 없이 뜬다. 이때는 트라이그램(`pg_trgm`)
유사도만 쓴다. `이불 빨래` / `이불빨래` 같은 표기 흔들림은 잡히지만,
`이불 세탁` 처럼 글자가 다르면 LLM 매칭에만 기대게 된다.

> 차원은 `embedding_dim` 과 Supabase 마이그레이션의 `vector(N)` 이 **반드시** 같아야 한다.

## 3. 내 주기 알아내기 — `cadence.py`

기록이 4개 이상 쌓이면(`personal_history_threshold` + 1) 개인 이력을 쓴다.

간격의 **중앙값**을 쓴다. 평균이 아니다 — 한 번 길게 건너뛴 기록이
전체 주기를 밀어버리면 안 되기 때문이다. 이상치를 걸러낸 뒤 중앙값을 잡고,
간격이 들쭉날쭉할수록(표준편차/중앙값) 확신도를 낮춘다.

`_to_unit` 이 일수를 사람이 읽는 단위로 바꾼다. 여기 규칙이 은근히 중요하다.

```
45일  → 45일    (30의 배수 근처가 아니면 일 단위 그대로)
216일 → 7달     (달로 떨어지면 달로)
14일  → 2주
```

"216일마다"는 아무도 그렇게 말하지 않는다. 반대로 45일을 억지로 "1.5달"로
만들면 원래 리듬이 뭉개진다. 그래서 **오차가 8% 안쪽일 때만** 큰 단위로 올린다.

> 예전에 "이 사람은 늘 늦으니 주기를 늘려주자"는 보정이 있었는데 뺐다.
> 미루는 걸 정상으로 굳혀버려서, 주기가 회를 거듭할수록 늘어나기만 했다.

## 4. 처음 보는 일 — `_research`

기록이 없는 새 항목은 개인 이력이 없다. 이때 순서는 이렇다.

```
priors 테이블에 있나?  →  있으면 그거
       ↓ 없으면
웹 검색해서 조사        →  결과를 priors 에 캐시
       ↓ 실패하면
None (apps/api 가 기본값으로 폴백)
```

`web_search_20260209` 서버 툴을 최대 3회까지 쓴다. 제조사 권장 주기, 위생 기준,
생활 관행을 근거로 삼게 하고, 사람마다 편차가 크면 확신도를 낮추게 했다.

`rationale` 은 확인 시트에 **그대로 한 줄로 노출된다.** 존댓말, 40자 안팎.
길면 잘라서 `…` 를 붙인다. 조건을 나열하지 말라고 프롬프트에 박아뒀다.

한 번 조사한 항목은 `priors` 에 남아 다음 사용자에게 바로 쓰인다.
실제 사용 기록이 30건 이상 쌓이면 조사값 대신 관측 중앙값을 쓴다.

---

## 환경변수

전부 모노레포 루트 `.env` 를 공유한다.

| | 없으면 |
|---|---|
| `VOYAGE_API_KEY` | 임베딩 없이 트라이그램만 |
| `DATABASE_URL` | `priors` 캐시를 못 읽고 못 쓴다. 매번 새로 조사 |
| `INTERNAL_TOKEN` | 기본값으로 뜬다 — 배포에선 반드시 정한다 |
| `AI_MODEL` | `claude-opus-5` (Anthropic 어댑터에만 쓴다) |

**LLM 키는 여기 없다.** 요청의 `caller` 로 온다. 무료 체험용 서버 키를 두는 곳은
`apps/api` 의 `ANTHROPIC_API_KEY` 다.

---

## 테스트

```bash
pnpm --filter @lastly/ai test
```

`test_cadence.py` 는 LLM을 안 부른다. 중앙값·이상치 제거·단위 변환처럼
**틀리면 사용자가 바로 알아채는 계산**만 본다. 45일이 45주가 되는 종류의 사고다.

제공자 어댑터는 아직 덮이지 않았다. 요청 형태와 스키마 변환이 검증 대상이다.

---

## 알아둘 것

**공개 주소를 주지 않는다.** `INTERNAL_TOKEN` 은 최소한의 빗장일 뿐이다.
`apps/api` 만 이 서비스를 부른다.

**무료 호스팅은 15분 놀면 잠든다.** 다시 깨는 데 20초쯤 걸린다. 대응이 두 겹이다.

1. **미리 깨운다.** 홈 피드를 부를 때 `AiClient.warmUp()` 이 `/healthz` 를 두드리고
   응답을 기다리지 않는다. 사용자가 문장을 말하고 누르기까지의 몇 초 동안 컨테이너가 뜬다.
   5분에 한 번만 두드린다.
2. **그래도 못 깼으면 기다린다.** 첫 호출이 무응답이면 30초 예산으로 한 번 더 부른다
   (`COLD_START_TIMEOUT_MS`).

1번이 대개 먹기 때문에 2번까지 가는 일은 드물다.
