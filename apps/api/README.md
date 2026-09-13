# @lastly/api

REST API와 알림 배치. NestJS.

AI는 문장을 해석만 하고, **사용자를 어느 화면으로 보낼지는 여기서 정한다.**

```bash
pnpm --filter @lastly/api dev      # :4000
```

개발 중에는 http://localhost:4000/docs 에서 Swagger로 전체 스펙을 볼 수 있다.

---

## 폴더

```
src/
├── common/
│   ├── guards/       SupabaseAuthGuard — Bearer 토큰 검증
│   ├── pipes/        ZodValidationPipe — contracts 스키마로 본문 검증
│   ├── filters/      모든 오류를 { error: { code, message } } 한 모양으로
│   └── decorators/   @CurrentUser
├── config/           env.schema.ts — 기동 시 환경변수를 zod로 검증한다
├── infra/
│   ├── supabase/     service_role 클라이언트
│   ├── ai/           apps/ai HTTP 클라이언트
│   └── push/         웹푸시 발송
└── modules/
    ├── items/        항목 + 기록
    ├── capture/      자연어 해석 오케스트레이션 + 규칙 파서
    ├── cadence/      주기 계산 (전역)
    ├── notifications/ 구독 · 알림 액션 · 다이제스트 배치
    ├── profile/      설정 · 내보내기 · 계정 삭제
    └── health/       기동 확인 · 외부 연동 진단
```

**`items`와 `logs`가 한 모듈인 이유**: 기록은 항목 없이 존재할 수 없고 서로를 참조한다.
모듈을 쪼개면 `forwardRef` 없이는 순환 의존을 풀 수 없다.

---

## 엔드포인트

### 기록하기 — 이 앱의 핵심

| | |
|---|---|
| `POST /v1/capture/interpret` | 자연어 한 문장 → 항목 · 날짜 · 주기 제안 |
| `POST /v1/capture/commit` | 확인 시트의 "이대로 저장하기" |

`interpret`은 재해석 없이 저장할 수 있도록 **서명된 초안 토큰**을 함께 준다.
`commit`이 그 토큰을 검증하므로 AI를 두 번 부르지 않는다 (유효기간 10분).

### 항목과 기록

| | |
|---|---|
| `GET /v1/home/feed` | 홈 한 번에 (요약 + due · upcoming · later 세 섹션) |
| `GET · POST /v1/items` | 목록 · 생성 |
| `GET · PATCH · DELETE /v1/items/:id` | 상세 · 수정 · 삭제 |
| `POST /v1/items/:id/complete` | "오늘 했어요" — 되돌리기 토큰 포함 |
| `GET · POST /v1/items/:id/logs` | 지난 기록 · 추가 (과거 날짜 지정 가능) |
| `PATCH · DELETE /v1/logs/:id` | 기록 수정 · 삭제 |
| `POST /v1/logs/undo` | 완료 토스트의 되돌리기 |

### 알림과 프로필

| | |
|---|---|
| `POST · DELETE /v1/notifications/subscribe` | 웹푸시 구독 |
| `POST /v1/notifications/items/:id/action` | 잠금화면 액션 (완료 · 3일 뒤 · 주말에) |
| `GET /v1/me` · `GET · PATCH /v1/me/notification-settings` | 프로필 · 알림 설정 |
| `GET /v1/me/export` · `DELETE /v1/me` | 내보내기 · 계정 삭제 |

---

## 해석 오케스트레이션

[`capture.service.ts`](src/modules/capture/capture.service.ts)가 이 앱에서 가장 중요한 파일이다.

```
사용자 문장
  → 이름이 기존 항목과 똑같은가?   → 예: 바로 확인 시트
  → 규칙으로 풀리는가?            → 예: 바로 확인 시트 (LLM 안 부름)
  → apps/ai 에 해석 요청 (사용자의 기존 항목 목록을 함께 넘긴다)
  → outcome 판정
  → 기존 항목이면 그 항목의 주기를, 새 항목이면 AI 제안을 붙인다
  → 서명된 초안 토큰과 함께 응답
```

**outcome 판정 순서가 중요하다.** AI가 특정 항목을 지목했으면(`matched_item_id`)
그게 가장 강한 신호다. 후보 목록(`candidates`)은 확신이 없을 때만 채워지므로,
그것만 보면 확정 매칭을 놓친다.

임계값은 파일 상단에 상수로 모아 두었다 (`MATCH_THRESHOLD` 등).
**이 값을 바꾸면 사용자가 보는 화면이 바뀐다.** `capture.service.spec.ts`가 그 경계를 검증한다.

저장할 때 입력 표현을 **별칭으로 학습**시켜, 다음부터는 AI를 거치지 않고 붙게 한다.

---

## 규칙 파서 — LLM 을 부르지 않고 끝내는 길

[`utterance-rules.ts`](src/modules/capture/utterance-rules.ts) 가 문장에서 네 가지를
말의 형태만 보고 뽑는다.

| 뽑는 것 | 예 |
|---|---|
| `intent` | "언제 빨았지?" → 조회 |
| `daysAgo` | "지난주 일요일" → 기준일 요일로 계산 |
| `statedCadenceDays` | "세달에 한번" → 90 · "이틀에 한번" → 2 |
| `name` | "빨았어" → "빨래" |

평가셋 15문장에서 의도·날짜·주기는 규칙이 전부 맞혔고, 이름은 30문장 중 30개를
맞혔다 — 같은 30문장에서 호스팅 LLM 은 25개였다. 정답이 하나로 정해진 문제라
규칙이 더 낫고, 틀리면 한 줄 고쳐 테스트로 고정할 수 있다.

**동사만 사전으로 바꾸고 대상은 사용자가 말한 그대로 둔다.** 대상("가습기 필터",
"블라인드")은 끝이 없지만 행동("빨다", "갈다", "닦다")은 몇 개뿐이다. 그래서 처음
보는 물건이어도 사전에 없을 이유가 없고, 넓히려면 `ACTION_NOUNS` 에 한 줄 더한다.

`byRules()` 가 LLM 으로 넘기는 경우는 둘뿐이다.

```
이름을 못 뽑음
새 항목인데 주기도 말하지 않음   ← "얼마마다 하는 일인가" 는 세상 지식이 필요하다
```

자주 하던 일을 다시 남기는, 앱에서 제일 흔한 경우가 여기서 끝난다.
`apps/ai` 를 깨우지 않으므로 무료 호스팅의 콜드 스타트도 타지 않는다.

---

## 실제 리듬과 어긋난 주기

항목 상세(`GET /v1/items/:id`)에서만 계산한다. 저장된 주기와 실제 간격이 30% 이상
벌어지면 `cadenceDrift` 를 함께 내려보낸다.

**자동으로 바꾸지 않는다.** 사용자가 정해둔 주기를 서버가 말없이 고치면 다음
예정일이 왜 달라졌는지 알 수 없게 된다. 알려만 주고 결정은 화면에서 한다.

간격은 **평균이 아니라 중앙값**을 쓴다. 두 달 여행을 다녀온 한 번이 2주 주기를
3주로 밀어버리면 안 된다. (`items.average_interval_days` 는 평균이라 "평균 N일마다
하셨어요" 로 보여주는 용도로만 쓴다.)

`cadence_source` 가 `user` 면 제안하지 않는다. 목록에서 계산하지 않는 이유는 항목마다
기록을 따로 읽어야 해서다.

---

## 인증과 검증

**인증** — `Authorization: Bearer <supabase access token>`을 Supabase에 위임해 검증하고,
이후 레이어는 `req.user.id`만 신뢰한다.

**검증** — `@Body(zodBody(schema))`. `@lastly/contracts`의 zod 스키마를 그대로 쓴다.

> **커스텀 파라미터 데코레이터로 만들지 말 것.**
> NestJS는 데코레이터 인자에 `transform` 메서드가 있으면 그걸 파이프로 간주한다.
> zod 스키마에도 `.transform()`이 있어서, 스키마를 인자로 넘기면 파이프로 오인되고
> 정작 데이터는 `undefined`로 들어온다. 본문을 받는 모든 엔드포인트가 조용히 500을 낸다.

**RLS 우회** — `service_role` 키는 RLS를 무시한다. 따라서 **모든 쿼리에 `user_id` 조건을
거는 책임이 레포지토리 레이어에 있다.** 이걸 빠뜨리면 남의 데이터가 새어 나간다.

---

## AI가 죽어도 멈추지 않는다

[`AiClient`](src/infra/ai/ai.client.ts)의 모든 메서드는 실패 시 `null`을 반환하고
(타임아웃 8초) 호출부가 규칙 기반으로 폴백한다.

- 해석 실패 → 트라이그램 검색 결과를 후보로 보여주고 사용자가 고름
- 주기 제안 실패 → 2주 기본값, 사용자가 저장 전에 수정 가능
- 임베딩 실패 → 임베딩 없이 저장, 트라이그램 매칭만 동작
- **서버에 AI 키가 없음** → `AiClient` 가 부르지 않고 `null` 을 돌려 같은 폴백으로 간다

어느 경우에도 사용자가 적은 문장은 그대로 저장된다. 해석이 안 됐다고 입력을 버리지 않는다.

`capture.service.spec.ts`의 "AI 장애 시" 블록이 이 경로를 검증한다.

---

## 알림 배치

`notifications.dispatchDigests`가 **매시 정각**에 돌면서, 그 시각이 알림 시간인
사용자에게만 보낸다. 사용자마다 타임존이 다르므로 비교는 각자의 로컬 시각
기준(`users_due_for_digest` RPC)으로 한다.

같은 날 이미 보냈으면 건너뛰고, 주말 알림을 껐으면 토·일에는 보내지 않는다.
만료된 푸시 구독(404·410)은 조용히 정리한다.

> 단일 인스턴스 배치다. API를 여러 대로 늘리면 중복 발송을 막을 잠금이 필요하다.

---

## 테스트

```bash
pnpm --filter @lastly/api test
```

주기 계산(`cadence.service.spec.ts`)과 해석 분기(`capture.service.spec.ts`)를 덮는다.
둘 다 순수 함수·모의 객체로 돌아 DB나 AI 없이 실행된다.
