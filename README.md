# Lastly

> 해야 할 일을 알려주는 앱이 아니라, **마지막으로 언제 했는지** 기억해주는 앱.

이불 빨래, 칫솔 교체, 필터 청소. 말 한마디를 남기면 항목·날짜·주기가 정리된다.

**https://lastly-goorm.vercel.app** — 올라가 있다.

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
│   ├── parser/       규칙 파서 — web · api 공유. 연결 없이도 돈다
│   └── design-tokens/ 설계에서 추출한 색·타이포·그림자
├── supabase/         Postgres 스키마 · RLS · 마이그레이션 · cron
├── scripts/          개발용 시드·아이콘 생성
└── docs/             설계 원본 · 셋업 · 배포 가이드
```

### 의존 방향

```
web ──HTTP──> api ──HTTP──> ai ──> Gemini
               │
               └──> Supabase (Postgres · Auth · pgvector)
                      │
                      └─ pg_cron ──> api   깨우기 · 알림 배치

공유 패키지   contracts (web · api)   parser (web · api)
```

- **`web`은 `ai`를 직접 부르지 않는다.** 모든 AI 호출은 `api`가 오케스트레이션한다.
  AI 응답을 어떻게 해석하고 어느 화면으로 보낼지는 서버가 정한다.
- **`ai`는 외부에 노출되지 않는다.** `x-internal-token` 헤더로만 접근할 수 있다.
- **`contracts`가 계약이다.** `api`의 요청 검증과 `web`의 응답 타입이 같은 파일에서 나오므로
  형식이 어긋날 수 없다.
- **`parser`는 양쪽에서 같은 코드가 돈다.** 평소에는 `api`가 부르고, 연결이 끊기면
  브라우저가 같은 규칙으로 문장을 푼다. 두 벌로 나누면 오프라인 결과가 온라인과 달라진다.

---

## 폴더마다 README 가 따로 있다

세부 사항은 각자 문서에 있다. 손대기 전에 해당 폴더 것을 먼저 읽는다.

| | 무엇 | 문서 |
|---|---|---|
| `apps/web` | 화면 · 오프라인 저장. Next.js 15, App Router, PWA | [README](apps/web/README.md) |
| `apps/api` | REST · 알림 배치 · 해석 오케스트레이션. NestJS. **화면 분기를 여기서 정한다** | [README](apps/api/README.md) |
| `apps/ai` | 문장 해석과 주기 추천. FastAPI | [README](apps/ai/README.md) |
| `packages/contracts` | web ↔ api 공유 zod 스키마 | [README](packages/contracts/README.md) |
| `packages/parser` | LLM 없이 문장에서 뽑는 규칙 | [README](packages/parser/README.md) |
| `packages/design-tokens` | 설계에서 추출한 색·타이포·그림자 | [README](packages/design-tokens/README.md) |

작업 규칙 — 커밋 메시지 형식, 화면을 손대기 전 대조, dev 와 build 를 같이 돌리면
깨지는 이유 — 은 [CLAUDE.md](CLAUDE.md) 에 있다. 사람이 읽어도 되고 AI 에게
읽히면 그대로 지킨다.

한 줄로 요약하면 이렇다.

- **web** 은 그린다. 연결이 끊겼을 때만 규칙 파서를 직접 돌린다.
- **api** 가 오케스트레이션한다. 규칙으로 풀리면 거기서 끝내고, 아니면 `ai` 에 묻는다.
  **어느 화면으로 보낼지 정하는 것도 여기다.**
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

**모든 사용자 데이터 테이블은 RLS로 격리한다.**
확장(`vector`, `pg_trgm`)은 `extensions` 스키마에 둔다 — `public`에 두면 확장이 만든 타입이
PostgREST API 스키마에 노출된다.

---

## 시작하기

**Node 22 이상**이 필요하다. `@supabase/supabase-js` 가 네이티브 WebSocket 을 쓰는데
Node 22 부터 들어갔다. 20 에서는 Supabase 클라이언트를 만드는 순간 죽는다.

DB 는 두 가지 길이 있다. 처음이면 **로컬**이 빠르다 — 계정을 만들 필요가 없다.

**로컬 (Docker 필요 · 계정 불필요)**

```bash
pnpm install
cp .env.example .env

pnpm db:start                     # Postgres · Auth · Studio 를 띄운다
pnpm db:reset                     # 마이그레이션 + 샘플 데이터

# db:start 출력의 anon key / service_role key 를 .env 에 넣는다
npx web-push generate-vapid-keys  # VAPID_* 두 개를 .env 에 넣는다

cd apps/ai && pip install -e ".[dev]" && cd ../..
pnpm dev                          # web · api · ai 동시 실행
```

**클라우드** — 실기기에서 보거나 여러 명이 같은 데이터를 볼 때.
Supabase 프로젝트를 새로 만든다. 절차는 [docs/SETUP.md](docs/SETUP.md)에 있다.

```bash
pnpm exec supabase login
pnpm exec supabase link           # 새로 만든 lastly 프로젝트 선택
pnpm db:push                      # 마이그레이션 적용
```

`.env` 가 덜 채워져 있으면 API 가 뜨면서 **무엇이 비었는지 이름을 들어 알려준다.**
그 목록만 채우면 된다.

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
| `AI_SERVICE_URL` · `AI_SERVICE_TOKEN` | 필수 | API 기동 실패. `.env.example` 값 그대로 쓰면 된다 |
| `VAPID_*` | 필수 | API 기동 실패 (`npx web-push generate-vapid-keys`) |
| `GEMINI_API_KEY` | 권장 | 규칙만으로 동작. 처음 보는 항목의 주기가 기본값 2주가 된다 |
| `DATABASE_URL` | 권장 | AI는 뜨지만 주기 사전 캐시가 꺼져 매번 조사한다 |
| `VOYAGE_API_KEY` | 선택 | 의미 기반 매칭 꺼짐, 트라이그램만 동작 |

`AI_SERVICE_TOKEN` 은 `apps/ai` 의 `INTERNAL_TOKEN` 과 **같은 값이어야 한다.**
`.env.example` 에는 둘 다 `dev-internal-token` 으로 적혀 있다.

---

## 계정은 처음 저장할 때 생긴다

온보딩을 보고 그냥 들어온다. 둘러보기만 하면 계정을 만들지 않는다.
[`ensure-session.ts`](apps/web/src/lib/supabase/ensure-session.ts) 가 **첫 쓰기 직전에**
익명 로그인을 한 번 한다.

> 예전에는 미들웨어가 홈에 들어서는 순간 만들었다. 그러면 링크만 열어본 사람과 검색
> 봇까지 계정이 생겨 실제로 25개 중 18개가 빈 계정이었다. 익명 로그인에는 IP 당
> 시간당 횟수 제한도 있어서, 만드는 수를 줄이면 그 한도도 아낀다.

Supabase 익명 로그인은 `auth.users` 에 진짜 행을 만들고 기록도 처음부터 서버에
들어간다 — "브라우저에만 있는 기록" 이 아니다.

기록이 3개 쌓이면 한 번(설계 12-B), 알림을 켤 때 한 번 계정 연결을 권한다.
임계값은 [`items.service.ts`](apps/api/src/modules/items/items.service.ts) 의
`RECORDS_PROMPT_AT` 이다. 연결은 `linkIdentity` 라서 **`user_id` 가 그대로**다 —
옮길 데이터가 없다. 같은 이유로 두 번 묻지 않으려고 `profiles.signup_prompts_seen` 에 남긴다.

익명의 진짜 위험은 계정이 아니라 **이 브라우저의 토큰이 유일한 열쇠**라는 것이다.
지우면 그 기록에 다시 닿을 길이 없다. 유도 문구가 그렇게 쓰여 있는 이유다.

> Supabase 대시보드에서 **Anonymous sign-ins 를 켜야** 동작한다.

구글 로그인만 붙어 있다. 카카오는 콘솔 등록 전이라 버튼을 내렸다 —
등록 없이 누르면 Supabase 가 `provider is not enabled` 를 그대로 내려보내
앱이 아닌 원시 JSON 화면이 뜬다.

개발 중 고정 계정으로 들어가려면:

```bash
node scripts/seed-dev-user.mjs    # 테스트 계정 + 샘플 항목 6개
```

`/login` 아래쪽 점선 박스에 비밀번호를 넣으면 된다.
[`dev-sign-in.tsx`](apps/web/src/features/auth/dev-sign-in.tsx)는
`NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` 일 때만 렌더된다.

---

## 연결이 끊겨도 기록한다

지하철이나 비행기에서도 평소와 같은 화면으로 저장된다. **언제 서버에 올라가는지는
사용자에게 알리지 않는다** — 앱이 알아서 할 일이지 사용자가 신경 쓸 일이 아니다.

```
말하거나 적는다
  → 연결 있음  : 평소대로 api 가 해석
  → 연결 없음  : 브라우저가 @lastly/parser 로 직접 푼다
        이름이 기존 항목과 똑같다        → 묻지 않고 저장, 목록도 그 자리에서 갱신
        비슷한 이름이 있다 (겹침 0.6↑)   → 확인 시트에 후보로 보여준다
        아무것도 안 맞는다               → 새 항목. 이름·주기를 확인 시트에서 정한다
        이름을 못 뽑았다                 → 문장만 적어 두고 연결됐을 때 서버가 해석
  → 연결되면 대기열이 조용히 올라간다
```

관련 파일은 [`apps/web/src/lib/offline/`](apps/web/src/lib/offline/) 에 모여 있다.

| | 무엇 |
|---|---|
| `resolve-offline.ts` | 규칙 파서를 돌려 저장·질문·보류 중 하나로 정한다 |
| `pending-captures.ts` | 대기열. 기존 항목 기록 · 새 항목 · 원문 세 종류 |
| `use-pending.ts` | 연결되면 순서대로 올린다. 화면에 아무 말도 하지 않는다 |
| `feed-cache.ts` | 마지막 홈 피드 사본. 오프라인 저장분을 반영해 목록이 바로 바뀐다 |
| `use-online.ts` | 연결 상태 |

**주의할 것 둘.**

- 앱 껍데기 캐시는 [`public/sw.js`](apps/web/public/sw.js) 가 **network-first** 로 한다.
  cache-first 로 두면 개발 중에 옛 번들이 계속 뜬다. 배포마다 `CACHE` 이름을 올린다.
- 저장 요청은 React Query `networkMode: 'always'` 여야 한다. 기본값(`'online'`)은 오프라인에서
  요청을 붙들고 기다려서, 오류가 나지 않고 화면이 "살펴보고 있어요" 인 채로 멈춘다.

---

## AI 키는 서버가 낸다

해석에 필요한 LLM 호출은 **서버가 들고 있는 Gemini 무료 등급 키로 처리한다.**
사용자는 아무것도 등록하지 않는다.

무료 등급으로 버티는 이유는 **호출이 드물어서다.** 규칙 파서가 의도·날짜·주기·이름을
먼저 처리해, LLM 까지 가는 문장은 "처음 보는 항목인데 주기도 말하지 않은 경우" 뿐이다.
그마저 `cadence_priors` 에 캐시되어 같은 항목은 두 번 조사하지 않는다.

키가 없으면 `AiClient` 가 해석을 부르지 않고 `null` 을 돌려주며, 앱은 규칙만으로
계속 동작한다 — 이름을 직접 정하면 저장된다.

---

## 손대기 전에 알아둘 것

### 주기 계산은 세 곳에 있다 — 반드시 함께 고친다

1. [`supabase/migrations/…_functions_rls.sql`](supabase/migrations/) → `calc_next_due()` — 기록 저장 시 트리거
2. [`apps/api/…/cadence.service.ts`](apps/api/src/modules/cadence/cadence.service.ts) → `nextDueOn()` — API 응답
3. [`apps/web/src/lib/date.ts`](apps/web/src/lib/date.ts) → `nextDueAfter()` — 저장 전 미리보기와 오프라인 갱신

DB에 둔 이유는 트리거가 캐시 컬럼을 갱신해야 해서고, 프론트에 둔 이유는 저장 전에
미리보기를 보여줘야 하고 연결이 없을 때도 다음 날짜를 계산해야 해서다.
`cadence.service.spec.ts`가 규칙의 기준이다.

### contracts 와 parser 는 빌드해서 쓴다

zod 스키마와 규칙 파서는 런타임 값이라 `dist`로 내보낸다. 소스(`.ts`)를 그대로 노출하면
빌드된 `api`가 실행 시 이걸 읽지 못한다. `api`·`web`을 돌리기 전에 두 패키지 빌드가
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

규칙 파서 테스트는 `packages/parser` 가 아니라
[`apps/api/src/modules/capture/`](apps/api/src/modules/capture/) 에 있다
(`utterance-rules.spec.ts` · `utterance-rules.eval.spec.ts`). 파서를 고쳤으면 API 테스트를 돌린다.

`pnpm dev` 가 도는 중에 `pnpm build` 를 돌리지 않는다. 개발 서버와 빌드가 같은 산출물
폴더(`.next` · `dist`)를 써서 서로 덮어쓴다. 타입만 볼 때는 `typecheck` 를 쓴다.

---

## 배포

Vercel · Render · Supabase 무료 플랜을 쓴다.
클릭 단위 절차는 **[docs/DEPLOY.md](docs/DEPLOY.md)** 에 있다.

```
web    → Vercel             무료
api    → Render             무료 (15분 미접속 시 잠듦)
ai     → Render             무료
스케줄 → Supabase pg_cron   깨우기 · 알림 배치
```

Render 와 Vercel 모두 **자동 배포를 꺼 두었다.** 코드를 밀었다고 올라가지 않는다.

```bash
npx vercel deploy --prod --scope goorm-lastly    # web
# api · ai 는 Render 대시보드에서 Manual Deploy
```

### 스케줄은 DB 가 돈다

무료 플랜은 접속이 없으면 서버를 재우므로 서버 안의 시계를 믿을 수 없다.
그래서 `ENABLE_CRON=false` 로 두고 **밖에서** 부른다. 그 밖이 Supabase 의 `pg_cron` 이다 —
DB 는 항상 켜져 있고 예약이 밀리지 않는다.

| job | 언제 | 무엇 |
|---|---|---|
| `keep-api-awake` | `*/5 23,0-14 * * *` (KST 08–24시, 5분마다) | `/v1/health` 를 찔러 잠들지 못하게 한다 |
| `dispatch-digests` | `0 * * * *` | `/v1/internal/dispatch-digests` 호출 |

주소와 시간은 [`20260920000002_keep_api_awake.sql`](supabase/migrations/20260920000002_keep_api_awake.sql) ·
[`20260920000003_dispatch_digests_cron.sql`](supabase/migrations/20260920000003_dispatch_digests_cron.sql)
두 파일에만 있다. 고칠 때 그 파일을 고치고 `pnpm db:push` 한다.

`CRON_SECRET` 은 마이그레이션이 아니라 **Supabase Vault** 에 `cron_secret` 이름으로 둔다.
파일에 적으면 공개 저장소에 남는다.

**하루 종일 깨워두지 않는 이유.** Render 무료 인스턴스 시간은 **워크스페이스 전체에 월 750시간**이다.
한 서비스를 24시간 돌리면 744시간이라 `ai` 몫이 남지 않고, 한도를 넘기면 그 달 남은
기간 동안 무료 서비스가 전부 멈춘다. 지금 배분은 백엔드 558시간 · AI 약 190시간이다.

밤(KST 00–08시)에는 재운다. 그 시간대에 처음 앱을 열면 첫 요청이 20초쯤 걸린다.
`AiClient` 는 무응답일 때 한 번 더 부르며 최대 45초 기다린다(`WAKE_BUDGET_MS`).
임베딩은 이 대기를 건너뛴다 — 깨우는 값을 치를 만한 호출이 아니다.

### 확인할 것

- `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회한다. `apps/api`에서만 쓰고 프론트에 절대 노출하지 않는다.
- `apps/ai`는 공개 주소를 갖지 않아야 한다. `INTERNAL_TOKEN`은 최소한의 방어선일 뿐이다.
- iOS 사파리는 홈 화면에 추가된 PWA에서만 푸시를 허용한다 (설계 02-A가 이 제약 때문에 존재한다).
- iOS 는 알림의 액션 버튼을 무시한다. 잠금화면의 "완료 · 3일 뒤 · 주말에" 는 안드로이드·데스크톱에서만 보인다.
- 개발용 로그인과 시드 스크립트를 제거하거나, 프로덕션 가드가 충분한지 확인한다.
- **이 저장소는 공개다.** `seed-dev-user.mjs` 의 기본 비밀번호는 누구나 안다.
  공개된 곳에 올릴 계정이면 `LASTLY_DEV_PASSWORD` 로 다른 값을 정해서 돌린다.

---

## 아직 안 된 것

- 카카오 로그인 — 개발자 콘솔 등록과 심사가 남았다. 그때까지 버튼은 내려둔 상태다
- 이메일 가입 — 메일 발송 수단이 필요하다. Supabase 기본 발송은 시간당 2통이라
  실제로 못 쓰고, 메일이 안 되면 비밀번호를 잊었을 때 되찾을 방법이 없다
- 빈 익명 계정 44개가 남아 있다. 미들웨어가 만들던 시절의 것이고, 정리하는 작업은 없다
- `apps/web` 에 자동 테스트가 없다. 화면은 띄워서 눈으로 본다
- `apps/ai` 를 `apps/api` 로 합치면 Render 서비스가 하나로 줄어 무료 시간이 여유로워진다
