# Lastly

> 해야 할 일을 알려주는 앱이 아니라, **마지막으로 언제 했는지** 기억해주는 앱.

이불 빨래, 칫솔 교체, 필터 청소. 말 한마디를 남기면 AI가 항목·날짜·주기를 정리한다.

화면 설계 원본은 [docs/design-reference/](docs/design-reference/)에 화면 26개로 쪼개 두었다.
디자인을 기억이나 추측이 아니라 **대조로** 맞추기 위한 것이니, UI를 손댈 때 먼저 열어볼 것.

---

## 구조

```
lastly/
├── apps/
│   ├── web/          Next.js 15 · App Router · PWA        :3000
│   ├── api/          NestJS · REST + 알림 배치             :4000
│   └── ai/           FastAPI · 자연어 해석 · 주기 추론      :8000
├── packages/
│   ├── contracts/    zod 스키마 — web ↔ api 공유 계약
│   └── design-tokens/ 설계에서 추출한 색·타이포·그림자
├── supabase/         Postgres 스키마 · RLS · 마이그레이션
├── scripts/          개발용 시드·아이콘 생성
└── docs/             설계 원본 · 셋업 가이드
```

### 의존 방향

```
web ──HTTP──> api ──HTTP──> ai
 │             │             │
 └─ contracts ─┘             └──> Supabase (pgvector)
                └──────────────────────┘
```

- **`web`은 `ai`를 직접 부르지 않는다.** 모든 AI 호출은 `api`가 오케스트레이션한다.
  AI 응답을 어떻게 해석하고 어느 화면으로 보낼지는 서버가 정한다.
- **`ai`는 외부에 노출되지 않는다.** `x-internal-token` 헤더로만 접근할 수 있다.
- **`contracts`가 계약이다.** `api`의 요청 검증과 `web`의 응답 타입이 같은 파일에서 나오므로
  형식이 어긋날 수 없다.

---

## 앱마다 README 가 따로 있다

세부 사항은 각자 문서에 있다. 손대기 전에 해당 앱 것을 먼저 읽는다.

| | 무엇 | 문서 |
|---|---|---|
| `apps/web` | 화면. Next.js 15, App Router, PWA | [README](apps/web/README.md) |
| `apps/api` | REST + 알림 배치. NestJS. **화면 분기를 여기서 정한다** | [README](apps/api/README.md) |
| `apps/ai` | 문장 해석과 주기 추천. FastAPI | [README](apps/ai/README.md) |

한 줄로 요약하면 이렇다.

- **web** 은 그리기만 한다. AI를 직접 부르지 않는다.
- **api** 가 오케스트레이션한다. AI 응답을 받아 **어느 화면으로 보낼지 정한다.**
- **ai** 는 재료만 준다. 죽어도 앱은 돌아야 한다 — 실패는 전부 `null` 로 흡수되고 규칙 기반으로 폴백한다.

마지막 항목이 이 프로젝트에서 제일 자주 오해받는 부분이다.
`ai` 코드에 예외를 삼키고 `None` 을 돌려주는 자리가 많은 건 실수가 아니라 설계다.

---

## 데이터 모델

| 테이블 | 무엇 |
|---|---|
| `profiles` | `auth.users` 확장 — 이름·타임존·알림 시간 |
| `items` | 관리 항목. 주기 규칙과 비정규화 캐시(마지막 수행일·다음 예정일·평균 간격) |
| `item_logs` | 수행 기록. 원본 발화도 남겨 AI 품질 개선에 쓴다 |
| `item_aliases` | "이불 빨래" ← "이불 세탁", "이불 빨았어" — 학습된 표현 |
| `cadence_priors` | "보통 사람들은 얼마마다 하는가" 공용 사전이자 AI 조사 결과 캐시 |
| `push_subscriptions` · `notifications` | 웹푸시 |
| `ai_credentials` | 사용자가 등록한 AI 키. 암호화 저장, 정책 없는 RLS 로 `service_role` 만 읽는다 |

**모든 사용자 데이터 테이블은 RLS로 격리한다.**
확장(`vector`, `pg_trgm`)은 `extensions` 스키마에 둔다 — `public`에 두면 확장이 만든 타입이
PostgREST API 스키마에 노출된다.

---

## 시작하기

**Node 22 이상**이 필요하다. `@supabase/supabase-js` 가 네이티브 WebSocket 을 쓰는데
Node 22 부터 들어갔다. 20 에서는 Supabase 클라이언트를 만드는 순간 죽는다.

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

| 키 | | 없으면 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | 필수 | 웹앱이 인증 불가 |
| `SUPABASE_SERVICE_ROLE_KEY` | 필수 | API 기동 실패 |
| `CREDENTIALS_SECRET` | 필수 | API 기동 실패. base64 32바이트 |
| `VAPID_*` | 필수 | API 기동 실패 (`npx web-push generate-vapid-keys`) |
| `ANTHROPIC_API_KEY` | 선택 | 무료 체험 꺼짐. 첫 화면부터 키 등록을 요구한다 |
| `DATABASE_URL` | 권장 | AI는 뜨지만 주기 사전 캐시가 꺼져 매번 조사한다 |
| `VOYAGE_API_KEY` | 선택 | 의미 기반 매칭 꺼짐, 트라이그램만 동작 |

`CREDENTIALS_SECRET` 은 **한 번 정하면 바꾸지 않는다.** 이 값으로 사용자 키를 봉인하므로,
잃거나 바꾸면 저장된 키를 아무도 풀 수 없고 전원이 다시 등록해야 한다.

### 계정이 있어야 쓸 수 있다

로그인 없이 쓰게 두면 그 기록은 계정에 묶이지 않아, 폰을 바꾸거나 브라우저를
비우는 순간 주인을 잃는다. 마지막으로 언제 했는지 기억해주는 앱에서 그건
존재 이유가 무너지는 일이라, 미들웨어가 세션 없는 요청을 로그인으로 돌려보낸다.

온보딩과 `/auth` 만 열려 있다. 막으면 로그인 자체를 할 수 없다.

구글 로그인만 붙어 있다. 카카오는 콘솔 등록 전이라 버튼을 아예 내렸다 —
등록 없이 누르면 Supabase 가 `provider is not enabled` 를 그대로 내려보내
앱이 아닌 원시 JSON 화면이 뜬다. 로그인 없이 확인하려면:

```bash
node scripts/seed-dev-user.mjs    # 테스트 계정 + 샘플 항목 6개
```

`/login` 아래쪽 점선 박스에 비밀번호를 넣으면 된다.
[`dev-sign-in.tsx`](apps/web/src/features/auth/dev-sign-in.tsx)는
`NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` 일 때만 렌더된다.

### AI 키는 각자 등록한다

수익이 없는 앱이라 서버가 모든 사용자의 AI 비용을 대신 낼 수 없다.
그래서 **각자 자기 키를 등록해 자기 몫만 쓴다.** Claude · GPT · Gemini 중 하나면 된다.

키부터 만들어 오라고 하면 대부분 그 자리에서 떠나므로, 등록 전 **3번은 서버 키로 돌려준다.**
`ANTHROPIC_API_KEY` 가 그 체험용이고, 비워두면 체험 없이 등록부터 요구한다.

셋 중 Gemini 만 무료 등급이 있어 카드 없이 키를 받을 수 있다. 화면 기본값이 Gemini 인 이유다.

| | 저장 | 노출 |
|---|---|---|
| 원문 키 | AES-256-GCM 으로 봉인해 `ai_credentials` 에 둔다 | 어떤 응답에도 담기지 않는다 |
| 가림 문자열 | `sk-ant-…4f2a` 형태로 함께 둔다 | 사용자 본인에게만 |

키를 꺼내는 곳은 AI 를 실제로 부르는 자리 하나뿐이고, 로그에 남기지 않는다.
`ai_credentials` 는 **정책을 하나도 두지 않은 RLS** 로 막아 `service_role` 외에는 읽지 못한다.

제공자마다 다른 건 두 메서드(`complete_json`, `complete_json_with_search`)뿐이라
[`apps/ai/…/providers/`](apps/ai/src/lastly_ai/services/providers/) 에 어댑터로 갈라 두었다.
구조화 출력을 켜는 방법이 셋 다 달라서(Anthropic `output_config`, OpenAI `response_format`,
Gemini `responseSchema`) 그 차이만 어댑터가 흡수한다.

---

## 손대기 전에 알아둘 것

### 주기 계산은 세 곳에 있다 — 반드시 함께 고친다

1. [`supabase/migrations/…_functions_rls.sql`](supabase/migrations/) → `calc_next_due()` — 기록 저장 시 트리거
2. [`apps/api/…/cadence.service.ts`](apps/api/src/modules/cadence/cadence.service.ts) → `nextDueOn()` — API 응답
3. [`apps/web/…/cadence-sheet.tsx`](apps/web/src/features/capture/components/cadence-sheet.tsx) → `previewNextDue()` — 저장 전 미리보기

DB에 둔 이유는 트리거가 캐시 컬럼을 갱신해야 해서고, 프론트에 둔 이유는 저장 전에
미리보기를 보여줘야 해서다. `cadence.service.spec.ts`가 규칙의 기준이다.

### contracts는 빌드해서 쓴다

zod 스키마는 런타임 값이라 `dist`로 내보낸다. 소스(`.ts`)를 그대로 노출하면
빌드된 `api`가 실행 시 이걸 읽지 못한다. `api`·`web`을 돌리기 전에 `contracts` 빌드가
먼저 끝나야 하고, turbo가 그 순서를 보장한다.

### 주기 수정과 쉬어가기는 다르다

- **주기 수정** — 리듬 자체를 바꾼다 (`cadence`). 영구적이다.
- **쉬어가기** — 리듬은 두고 다음 차례만 미룬다 (`snoozed_until`). 기록이 새로 쌓이면 자동 해제된다.

겨울에 에어컨 필터를 4개월 쉬려고 주기를 4개월로 바꾸면, 돌아온 여름의 리듬까지 망가진다.

---

## 검사

```bash
pnpm typecheck                # tsc --noEmit · mypy strict
pnpm lint                     # eslint · ruff
pnpm test                     # jest · pytest
```

앱 하나만 보려면 `pnpm --filter @lastly/api test` 처럼 필터를 준다.
Python 도구는 `cd apps/ai && pip install -e ".[dev]"` 로 들어온다.

`pnpm dev` 가 도는 중에 `pnpm build` 를 돌리지 않는다. 개발 서버와 빌드가 같은 산출물
폴더(`.next` · `dist`)를 써서 서로 덮어쓴다. 타입만 볼 때는 `typecheck` 를 쓴다.

## 배포

**https://lastly-goorm.vercel.app** — 올라가 있다.

Vercel · Render · GitHub Actions · Supabase 무료 플랜을 쓴다.
클릭 단위 절차는 **[docs/DEPLOY.md](docs/DEPLOY.md)** 에 있다.

```
web   → Vercel          무료
api   → Render          무료 (15분 미접속 시 잠듦)
ai    → Render          무료
알림  → GitHub Actions   매시 정각에 api를 두드린다
```

무료 플랜은 접속이 없으면 서버를 재우므로 서버 안의 시계를 믿을 수 없다.
그래서 `ENABLE_CRON=false`로 두고 밖에서 `/v1/internal/dispatch-digests`를 부른다.
인스턴스를 여러 대로 늘려도 중복 발송이 생기지 않는 이점도 있다.

같은 이유로 **오랜만에 앱을 열면 첫 기록이 30초쯤 걸린다.** 잠든 `ai` 를 깨우는 시간이다.
`AiClient` 가 무응답일 때 한 번 더 부르며 기다린다. 그 뒤로는 빠르다.
계속 깨워두는 방법도 있지만 무료 인스턴스 시간(월 750시간)을 두 서비스가 나눠 쓰는 구조라
오히려 월말에 멈춘다.

### 확인할 것

- `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회한다. `apps/api`에서만 쓰고 프론트에 절대 노출하지 않는다.
- `apps/ai`는 공개 주소를 갖지 않아야 한다. `INTERNAL_TOKEN`은 최소한의 방어선일 뿐이다.
- iOS 사파리는 홈 화면에 추가된 PWA에서만 푸시를 허용한다 (설계 02-A가 이 제약 때문에 존재한다).
- 개발용 로그인과 시드 스크립트를 제거하거나, 프로덕션 가드가 충분한지 확인한다.
- **이 저장소는 공개다.** `seed-dev-user.mjs` 의 기본 비밀번호는 누구나 안다.
  공개된 곳에 올릴 계정이면 `LASTLY_DEV_PASSWORD` 로 다른 값을 정해서 돌린다.

## 아직 안 된 것

- 카카오 로그인 — 개발자 콘솔 등록과 심사가 남았다. 그때까지 버튼은 내려둔 상태다
- 푸시 알림 실제 발송 검증
- 이메일 가입 — 메일 발송 수단이 필요하다. Supabase 기본 발송은 시간당 2통이라
  실제로 못 쓰고, 메일이 안 되면 비밀번호를 잊었을 때 되찾을 방법이 없다

설계 12-B(기록 3개 시점 로그인 유도)는 만들지 않는다.
계정 없이 쓰는 길을 없앴으므로 권할 자리가 사라졌다.
