# Lastly

> 해야 할 일을 알려주는 앱이 아니라, **마지막으로 언제 했는지** 기억해주는 앱.

이불 빨래, 칫솔 교체, 필터 청소. 말 한마디를 남기면 AI가 항목·날짜·주기를 정리한다.

화면 설계 원본은 [docs/design-reference/](docs/design-reference/)에 화면 22개로 쪼개 두었다.
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

## apps/web — 화면

Next.js 15 App Router. 설계가 모바일 웹앱(390×844)이므로 PWA로 만든다.

### 폴더

```
src/
├── app/              라우트만. 얇게 유지한다
│   ├── page.tsx          홈          설계 04·05·05-B
│   ├── items/[id]/       항목 상세    설계 11·11-B·14-B
│   ├── onboarding/       온보딩      설계 01·02·03
│   ├── login/            로그인      설계 12·12-B
│   ├── settings/         설정        설계 13·13-B
│   ├── auth/callback/    OAuth 착지점
│   └── api/notifications/action/   서비스워커가 알림 액션을 중계하는 곳
│
├── features/         화면 알맹이는 전부 여기
│   ├── home/             홈 조립 + 카드·행·빈 상태·로딩/오류
│   ├── capture/          말하기 → 확인 → 저장   설계 06·07·07-B·08·09·10·10-B
│   ├── items/            상세 + 기록 편집
│   ├── onboarding/       소개·설치 안내·알림 권한
│   ├── auth/             개발용 로그인
│   └── notifications/    웹푸시 구독
│
├── components/ui/    Sheet, Toast, Button, Badge
└── lib/              api 클라이언트, Supabase, 날짜 포맷
```

`app/`은 라우팅만 하고 세 줄이면 끝난다. 화면 알맹이는 `features/`에 둔다.

### 렌더링

홈(`/`)과 항목 상세는 **서버 컴포넌트가 초기 데이터를 가져와 내려보낸다.**
클라이언트는 그 데이터로 즉시 그리고 이후 갱신만 맡는다 (`useQuery`의 `initialData`).

- [`lib/api/server.ts`](apps/web/src/lib/api/server.ts) — 쿠키에서 세션을 읽어 `api`를 호출한다.
  실패하면 `null`을 돌려주고 클라이언트가 평소대로 다시 가져간다.
  **초기 데이터는 있으면 좋은 것이지 필수가 아니다.**
- 로그인·온보딩·설정은 개인화된 초기 데이터가 없어 정적으로 남겨둔다.

`server-only` 패키지를 걸어뒀으므로 서버 전용 모듈이 클라이언트 번들에 섞이면 빌드가 깨진다.

### 스타일

색·크기·그림자는 [`packages/design-tokens`](packages/design-tokens/)에서만 온다.
Tailwind 설정은 그 CSS 변수를 가리킬 뿐 값을 복제하지 않는다.

주의할 두 가지:

- **`accent`(`#4A433F`)는 웜 그레이다.** 주황(`#B0552F`)은 별도의 `action` 색으로,
  주 액션 버튼과 임박 배지에만 쓴다. 이 둘을 섞으면 화면 인상이 완전히 달라진다.
- **소수점 크기와 음수 자간을 반올림하지 않는다.** `12.5px`, `-.035em` 같은 값이
  이 디자인의 인상을 만든다. Tailwind 기본 스케일로 뭉개면 다른 화면이 된다.

---

## apps/api — 서버

NestJS. 도메인마다 모듈 하나, 모듈 안은 controller / service / repository.

```
src/
├── common/
│   ├── guards/       SupabaseAuthGuard — Bearer 토큰 검증
│   ├── pipes/        ZodValidationPipe — contracts 스키마로 본문 검증
│   ├── filters/      모든 오류를 { error: { code, message } } 한 모양으로
│   └── decorators/   @CurrentUser
├── infra/
│   ├── supabase/     service_role 클라이언트
│   ├── ai/           apps/ai HTTP 클라이언트
│   └── push/         웹푸시 발송
└── modules/
    ├── items/        항목 + 기록 (한 모듈이다. 아래 설명 참고)
    ├── capture/      자연어 해석 오케스트레이션
    ├── cadence/      주기 계산 (전역)
    ├── notifications/ 구독·알림 액션·다이제스트 배치
    └── profile/      설정·내보내기·계정 삭제
```

**`items`와 `logs`가 한 모듈인 이유**: 기록은 항목 없이 존재할 수 없고 서로를 참조한다.
모듈을 쪼개면 `forwardRef` 없이는 순환 의존을 풀 수 없다.

### 엔드포인트

| | |
|---|---|
| `POST /v1/capture/interpret` | 자연어 한 문장 해석 → 항목·날짜·주기 제안 |
| `POST /v1/capture/commit` | 확인 시트의 "이대로 저장하기" |
| `GET /v1/home/feed` | 홈 한 번에 (요약 + 3개 섹션) |
| `GET·POST /v1/items` · `GET·PATCH·DELETE /v1/items/:id` | 항목 CRUD |
| `POST /v1/items/:id/complete` | "오늘 했어요" — 되돌리기 토큰 포함 |
| `GET·POST /v1/items/:id/logs` · `PATCH·DELETE /v1/logs/:id` | 기록 |
| `POST /v1/logs/undo` | 완료 토스트의 되돌리기 |
| `POST·DELETE /v1/notifications/subscribe` | 웹푸시 구독 |
| `POST /v1/notifications/items/:id/action` | 잠금화면 액션 (완료·3일 뒤·주말에) |
| `GET·DELETE /v1/me`, `/me/notification-settings`, `/me/export` | 프로필·설정 |

개발 중에는 http://localhost:4000/docs 에서 Swagger로 볼 수 있다.

### 인증과 검증

- **인증** — `Authorization: Bearer <supabase access token>`을 Supabase에 위임해 검증하고,
  이후 레이어는 `req.user.id`만 신뢰한다.
- **검증** — `@Body(zodBody(schema))`. `contracts`의 zod 스키마를 그대로 쓴다.

  > 커스텀 파라미터 데코레이터로 만들지 말 것. NestJS는 데코레이터 인자에 `transform`
  > 메서드가 있으면 파이프로 간주하는데, zod 스키마에도 `.transform()`이 있어서
  > 스키마가 파이프로 오인되고 데이터는 `undefined`로 들어온다.

- **RLS 우회** — `service_role` 키는 RLS를 무시한다. 따라서 **모든 쿼리에 `user_id` 조건을
  거는 책임이 레포지토리 레이어에 있다.**

### 알림 배치

`notifications.dispatchDigests`가 매시 정각에 돌면서, 그 시각이 알림 시간인 사용자에게만 보낸다.
사용자마다 타임존이 다르므로 비교는 각자의 로컬 시각 기준(`users_due_for_digest` RPC)으로 한다.

---

## apps/ai — 해석과 추론

FastAPI. `apps/api` 뒤에만 있다.

```
src/lastly_ai/
├── api/v1/routes/    parse · cadence/suggest · embed
├── services/
│   ├── normalizer.py   자연어 → 항목명 + 날짜 + 기존항목 매칭
│   ├── cadence.py      주기 추론
│   ├── llm.py          Anthropic 클라이언트 (claude-opus-5)
│   └── embeddings.py   임베딩 (선택)
└── repositories/priors.py   주기 사전
```

### 하는 일

| 기능 | 어디서 | 어떻게 |
|---|---|---|
| 자연어 → 항목 + 날짜 | `normalizer.py` | 구조화 출력으로 항목명·상대날짜·기존항목 매칭을 한 번에 |
| 유사 표현을 같은 항목으로 | `match_items` RPC | 임베딩 코사인 + 트라이그램 + **별칭 학습** 중 최대값 |
| 새 항목의 주기 제안 | `cadence.py` | 사전 조회 → 없으면 웹 검색으로 조사 후 사전에 캐시 |
| 내 주기 학습 | `cadence.py` | 실제 수행 간격의 **중앙값**. 이상치는 2σ로 제거 |

**별칭 학습이 핵심이다.** 사용자가 "이불 빨았어"를 "이불 빨래" 항목에 붙이면 그 표현이
`item_aliases`에 쌓인다. 다음부터 같은 말은 LLM을 거치지 않고 바로 붙는다 — 쓸수록 빨라지고 싸진다.

**중앙값을 쓰는 이유**는 한 번 오래 건너뛴 기록이 전체 주기를 밀어버리지 않게 하기 위해서다.

**일수를 사람이 세는 단위로 옮긴다.** 딱 떨어질 때만 개월·주로 바꾼다.
`45일`은 그대로 두고(`2달`로 뭉개면 보름이 밀린다) `216일`은 `7달`로 바꾼다.

### AI가 죽어도 앱은 돈다

`AiClient`의 모든 메서드는 실패 시 `null`을 반환하고 호출부가 규칙 기반으로 폴백한다.

- 해석 실패 → 트라이그램 검색 결과를 후보로 보여주고 사용자가 고름
- 주기 제안 실패 → 2주 기본값, 사용자가 저장 전에 수정 가능
- 임베딩 실패 → 임베딩 없이 저장, 트라이그램 매칭만 동작
- **DB 연결 실패 → 주기 사전 캐시만 꺼진다.** 해석과 제안은 LLM만으로 되므로 기동을 막지 않는다

### 응답 시간

새 항목은 **해석 2~3초 + 주기 조사 3~4초**가 순차로 붙는다. 주기 조사가 항목명을 알아야
시작되기 때문이다. 조사 결과는 `cadence_priors`에 캐시되므로 **같은 항목은 두 번째부터 즉시**
응답한다. `DATABASE_URL`이 없으면 캐시가 꺼져 매번 다 겪는다.

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
| `VAPID_*` | 필수 | API 기동 실패 (`npx web-push generate-vapid-keys`) |
| `ANTHROPIC_API_KEY` | 필수 | 자연어 해석·주기 제안이 전부 폴백으로 동작 |
| `DATABASE_URL` | 권장 | AI는 뜨지만 주기 사전 캐시가 꺼져 매번 조사한다 |
| `VOYAGE_API_KEY` | 선택 | 의미 기반 매칭 꺼짐, 트라이그램만 동작 |

### OAuth 없이 화면 보기

카카오·구글은 각 개발자 콘솔에 앱을 등록해야 쓸 수 있다. 그 전에 확인하려면:

```bash
node scripts/seed-dev-user.mjs    # 테스트 계정 + 샘플 항목 5개
```

`/login` 아래쪽 점선 박스의 **"개발 계정으로 들어가기"** 를 누르면 된다.
[`dev-sign-in.tsx`](apps/web/src/features/auth/dev-sign-in.tsx)는 프로덕션 빌드에서 렌더되지 않는다.

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

## 테스트

```bash
pnpm test                     # 전체
pnpm --filter @lastly/api test
cd apps/ai && pytest
```

## 배포 시 확인할 것

- `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회한다. `apps/api`에서만 쓰고 프론트에 절대 노출하지 않는다.
- `apps/ai`는 공개 주소를 갖지 않아야 한다. `INTERNAL_TOKEN`은 최소한의 방어선일 뿐이다.
- iOS 사파리는 홈 화면에 추가된 PWA에서만 푸시를 허용한다 (설계 02-A가 이 제약 때문에 존재한다).
- `dispatchDigests`는 단일 인스턴스 배치다. API를 여러 대로 늘리면 중복 발송을 막을 잠금이 필요하다.
- 개발용 로그인과 시드 스크립트를 제거하거나, 프로덕션 가드가 충분한지 확인한다.

## 아직 안 된 것

- 카카오·구글 OAuth 등록
- 푸시 알림 실제 발송 검증
- 설계 06(자주 쓰는 문장 칩)·12-B(기록 3개 시점 로그인 유도) 화면
- 배포 설정
