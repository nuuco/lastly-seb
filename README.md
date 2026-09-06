# Lastly

> 해야 할 일을 알려주는 앱이 아니라, **마지막으로 언제 했는지** 기억해주는 앱.

말 한마디를 남기면 AI가 항목·날짜·주기를 정리한다. 화면 설계 원본은 [docs/](docs/)에 있다.

## 구조

```
lastly/
├── apps/
│   ├── web/          Next.js 15 · App Router · PWA        :3000
│   ├── api/          NestJS · REST + 알림 배치             :4000
│   └── ai/           FastAPI · 자연어 해석 · 주기 추론      :8000
├── packages/
│   ├── contracts/    zod 스키마 — web ↔ api 공유 계약
│   └── design-tokens/ 설계 HTML에서 추출한 색·타이포
└── supabase/         Postgres 스키마 · RLS · 마이그레이션
```

### 의존 방향

```
web ──HTTP──> api ──HTTP──> ai
 │             │             │
 └─ contracts ─┘             └──> Supabase (pgvector)
                └──────────────────────┘
```

- `web`은 `ai`를 직접 부르지 않는다. 모든 AI 호출은 `api`가 오케스트레이션한다.
- `contracts`는 **타입과 zod 검증 스키마**를 담는다. `api`의 요청 검증과 `web`의 응답 타입이 같은 파일에서 나온다.
  스키마는 런타임 값이므로 `dist`로 빌드해서 내보낸다 — 소스(.ts)를 그대로 노출하면 빌드된 `api`가 실행 시 읽지 못한다.
  그래서 `api`·`web`을 돌리기 전에 `contracts` 빌드가 먼저 끝나야 하고, turbo가 그 순서를 보장한다.
- `ai`는 외부에 노출되지 않는다. `x-internal-token` 헤더로만 접근할 수 있다.

### 렌더링

홈(`/`)과 항목 상세(`/items/[id]`)는 **서버 컴포넌트가 초기 데이터를 가져와 내려보낸다.**
클라이언트는 그 데이터로 즉시 그리고 이후 갱신만 맡는다 (`useQuery`의 `initialData`).

- `lib/api/server.ts` — 쿠키에서 세션을 읽어 apps/api를 호출한다. 실패하면 `null`을 돌려주고,
  그 경우 클라이언트가 평소대로 다시 가져간다. 초기 데이터는 있으면 좋은 것이지 필수가 아니다.
- 로그인·온보딩·설정은 개인화된 초기 데이터가 없어 정적으로 남겨둔다.

`server-only` 패키지를 걸어뒀으므로 서버 전용 모듈이 클라이언트 번들에 섞이면 빌드가 깨진다.

## AI가 하는 일

| 기능 | 어디서 | 어떻게 |
|---|---|---|
| 자연어 → 항목 + 날짜 | `ai/services/normalizer.py` | 구조화 출력으로 항목명·상대날짜·기존항목 매칭을 한 번에 뽑는다 |
| 유사 표현을 같은 항목으로 | `supabase` `match_items` RPC | 임베딩 코사인 + 트라이그램 + **별칭 학습** 중 최대값 |
| 새 항목의 주기 제안 | `ai/services/cadence.py` | 주기 사전 조회 → 없으면 웹 검색으로 조사 후 사전에 캐시 |
| 내 주기 학습 | `ai/services/cadence.py` | 실제 수행 간격의 **중앙값**. 이상치는 2σ로 제거 |

**별칭 학습이 핵심이다.** 사용자가 "이불 빨았어"를 "이불 빨래" 항목에 붙이면 그 표현이 `item_aliases`에 쌓인다. 다음부터 같은 말은 LLM을 거치지 않고 바로 붙는다 — 쓸수록 빨라지고 싸진다.

### AI가 죽어도 앱은 돈다

`AiClient`의 모든 메서드는 실패 시 `null`을 반환하고 호출부가 규칙 기반으로 폴백한다.

- 해석 실패 → 트라이그램 검색 결과를 후보로 보여주고 사용자가 고름
- 주기 제안 실패 → 2주 기본값, 사용자가 저장 전에 수정 가능
- 임베딩 실패 → 임베딩 없이 저장, 트라이그램 매칭만 동작

## 시작하기

Supabase는 **Lastly 전용 프로젝트를 새로 만든다.** 절차는 [docs/SETUP.md](docs/SETUP.md)에 있다.

```bash
pnpm install
cp .env.example .env

pnpm exec supabase login
pnpm exec supabase link           # 새로 만든 lastly 프로젝트 선택
pnpm db:push                      # 마이그레이션 적용

cd apps/ai && pip install -e ".[dev]" && cd ../..

pnpm dev                          # web · api · ai 동시 실행
```

| 주소 | 무엇 |
|---|---|
| http://localhost:3000 | 웹앱 |
| http://localhost:4000/docs | API 문서 (Swagger) |
| http://localhost:8000/docs | AI 서비스 문서 |

### 필요한 외부 키

| 키 | 필수 | 없으면 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | 필수 | 웹앱이 인증 불가 |
| `SUPABASE_SERVICE_ROLE_KEY` | 필수 | API 기동 실패 |
| `DATABASE_URL` | 필수 | AI 서비스 기동 실패 |
| `ANTHROPIC_API_KEY` | 필수 | 자연어 해석·주기 제안이 전부 폴백으로 동작 |
| `VAPID_*` | 필수 | API 기동 실패 (`npx web-push generate-vapid-keys`) |
| `VOYAGE_API_KEY` | 선택 | 의미 기반 매칭 꺼짐, 트라이그램만 동작 |

## 주기 계산은 세 곳에 있다

같은 규칙이 세 곳에 구현돼 있고 **반드시 함께 고쳐야 한다.**

1. `supabase/migrations/…_functions_rls.sql` → `calc_next_due()` — 기록 저장 시 트리거
2. `apps/api/src/modules/cadence/cadence.service.ts` → `nextDueOn()` — API 응답
3. `apps/web/src/features/capture/components/cadence-sheet.tsx` → `previewNextDue()` — 시트 미리보기

DB에 둔 이유는 트리거가 캐시 컬럼을 갱신해야 해서고, 프론트에 둔 이유는 저장 전에 미리보기를 보여줘야 해서다. `cadence.service.spec.ts`가 규칙의 기준이다.

## 테스트

```bash
pnpm test                     # 전체
pnpm --filter @lastly/api test
cd apps/ai && pytest
```

## 배포 시 확인할 것

- `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회한다. `apps/api`에서만 쓰고 프론트에 절대 노출하지 않는다.
- `apps/ai`는 공개 주소를 갖지 않아야 한다. `INTERNAL_TOKEN`은 최소한의 방어선일 뿐이다.
- iOS 사파리는 홈 화면에 추가된 PWA에서만 푸시를 허용한다 (화면 02-A가 이 제약 때문에 존재한다).
- `notifications.dispatchDigests`는 매시 정각에 도는 단일 인스턴스 배치다. API를 여러 대로 늘리면 중복 발송을 막을 잠금이 필요하다.
