# 인프라 정책

서버를 어디에 두고, 무엇을 서버에 남기고, 데이터가 어긋날 때 어느 쪽을 믿는지.
세 가지를 한곳에 적는다. 절차는 [`DEPLOY.md`](DEPLOY.md), 구조는
[루트 README](../README.md) 에 있고 여기는 **왜 그렇게 정했는가** 만 다룬다.

---

## 1. 백엔드 역할 분류

`apps/api` 의 엔드포인트를 **Supabase 로 직통 가능** 한 것과 **API 에 남겨야** 하는
것으로 나눈다. 기준은 하나다 — **DB 한 번으로 끝나면 직통, 여러 곳을 엮으면 API.**

### 직통 가능 — 21개 / 27개

PostgREST + RLS 로 대체된다. 테이블 8개 전부 RLS 가 걸려 있어
(`items` `item_logs` `item_aliases` `push_subscriptions` `profiles`
`notifications` `ai_credentials` `cadence_priors`) 클라이언트가 직접 불러도
남의 행에 닿지 않는다.

| 엔드포인트 | 대체 수단 |
|---|---|
| `GET/POST /v1/items` · `GET/PATCH/DELETE /v1/items/:id` | 테이블 직접 |
| `POST /v1/items/:id/restore` | `deleted_at = null` 한 줄 |
| `GET /v1/items/search` | `match_items` RPC — 이미 DB 함수다 |
| `GET/POST /v1/items/:itemId/logs` · `PATCH/DELETE /v1/logs/:id` | 테이블 직접 |
| `GET /v1/home/feed` · `GET /v1/home/calendar` | 뷰로 옮길 수 있다. 분류 기준(`UPCOMING_WINDOW_DAYS = 14`)과 다음 예정일(`calc_next_due`)이 이미 DB 에 있다 |
| `POST/DELETE /v1/notifications/subscribe` | 테이블 직접 |
| `GET /v1/me` · `GET/PATCH /v1/me/notification-settings` | `profiles` 직접 |
| `GET /v1/me/export` · `DELETE /v1/me` | RPC 하나로 |
| `POST /v1/me/signup-prompts` | `profiles` 직접 |

### API 에 남겨야 하는 것 — 6개 / 27개

| 엔드포인트 | 남기는 이유 |
|---|---|
| `POST /v1/capture/interpret` | **해석 오케스트레이션.** 규칙 → 온디바이스 → Gemini 순서를 정하고, 중간에 `cadence_priors` 를 찾고, 실패하면 경로를 갈아탄다. 915줄짜리 판단이 DB 함수에 들어갈 수 없다 |
| `POST /v1/capture/cadence` | 위와 같은 경로를 탄다 |
| `POST /v1/capture/commit` | 항목 생성·로그 적재·별칭 적립을 한 트랜잭션으로 묶는다 |
| `POST /v1/items/:id/complete` | 완료 + 다음 예정일 재계산 + 별칭 적립이 함께 일어난다 |
| `POST /v1/logs/undo` | 되돌리기는 로그 삭제와 항목 상태 복구가 짝이다 |

`POST /v1/notifications/items/:itemId/action` 은 잠금화면 버튼이 부른다.
완료 처리를 거치므로 위 묶음에 속한다.

`POST /v1/internal/dispatch-digests` 는 **이미 쓰이지 않는다.**
발송은 Edge Function 이 하고, 이 경로는 되돌릴 때를 위해 남겨둔 것이다.

### 결론

**사용자용 27개 중 21개가 직통 가능하다.** 남는 것은 해석과 트랜잭션 6개뿐이다.
(`GET /v1/health` 와 쓰이지 않는 `POST /v1/internal/dispatch-digests` 는 센 수에서 뺐다.)
`apps/ai` 를 `apps/api` 로 합치면(README 미구현 항목) Render 서비스가
하나로 줄고, 그 하나도 해석만 담당하게 된다.

---

## 2. 서버 위치

| 서비스 | 위치 | 고른 이유 |
|---|---|---|
| Supabase | **Northeast Asia (Seoul)** | 사용자가 한국이다. DB 왕복이 가장 잦으므로 여기를 먼저 맞춘다 |
| Render (`api` · `ai`) | **Singapore** | 무료 플랜에 서울이 없다. 선택지 중 한국에서 가장 가깝다 |

Render 가 싱가포르인 것은 **고른 결과가 아니라 남은 결과다.** 무료 플랜의
지역은 Oregon · Frankfurt · Singapore · Ohio · Virginia 뿐이다.
1번의 직통 전환을 끝내면 왕복의 대부분이 Seoul 안에서 끝나므로 이 거리는 사라진다.

---

## 3. 무료 서버 슬립 대응

무료 인스턴스는 **15분 동안 요청이 없으면 잠든다.** 깨어나는 데 20초쯤 걸린다.

### 지금 하는 것

| 수단 | 내용 |
|---|---|
| `keep-api-awake` | `pg_cron` 이 KST 08–24시에 5분마다 `/v1/health` 를 찌른다 |
| `WAKE_BUDGET_MS` | 무응답이면 `AiClient` 가 한 번 더 부르며 최대 45초 기다린다 |
| 알림 분리 | 발송을 Edge Function 으로 옮겼다. 서버가 자고 있어도 정시에 나간다 |

### 하루 종일 깨우지 않는 이유

무료 인스턴스 시간은 **워크스페이스 전체에 월 750시간**이다. 한 서비스를
24시간 돌리면 744시간이라 `ai` 몫이 남지 않고, 넘기면 그 달 남은 기간 동안
무료 서비스가 **전부** 멈춘다. 지금 배분은 백엔드 558시간 · AI 약 190시간이다.

밤(KST 00–08시)에 처음 앱을 열면 첫 요청이 20초 걸린다. 이것이 현재 남은 비용이다.

### 장기 대응

1번의 직통 전환을 끝내면 **깨울 서버 자체가 없어진다.** 읽기·쓰기는 PostgREST 가
받고, 알림은 이미 Edge Function 이 한다. 해석만 남는데 그마저 규칙 파서가
대부분을 먼저 끝내므로 호출이 드물다.

순서는 이렇다.

```
1  알림 발송 → Edge Function          ← 완료
2  읽기(목록·달력·검색) → PostgREST
3  쓰기(생성·수정·로그) → PostgREST
4  해석만 남은 api 를 Edge Function 으로
```

2·3 을 끝내면 깨우기 작업(`keep-api-awake`)을 끌 수 있다.

---

## 4. 저장 정책 — 서버가 정본

같은 기록이 두 곳에 있다.

```
Supabase (서버 DB)   정본. 진짜는 이쪽이다
localStorage (브라우저)  사본. 빨리 보여주려고 베껴둔 것
```

**둘이 어긋나면 서버 값으로 덮어쓴다.** 예외는 없다.

### 왜 사본을 두는가

이 앱은 집 밖에서 문득 떠올라 여는 일이 많다 — 지하철, 엘리베이터, 지하 주차장.
그때 "목록을 못 가져왔어요" 만 뜨면 쓸 수 없다. 적어도 무엇이 밀렸는지는 보여야 한다.

### 사본에 담는 것

| 키 | 내용 | 수명 |
|---|---|---|
| `lastly.home-feed` | 마지막으로 받은 홈 목록 + 받은 시각 | 서버에서 새로 받을 때까지 |
| 대기열 | 연결이 끊긴 자리에서 남긴 기록 | 올라갈 때까지 |

끊긴 자리에서 남긴 기록은 브라우저가 `@lastly/parser` 로 직접 풀어 사본에 먼저
반영하고, 연결되면 대기열이 올라간 뒤 **서버가 계산한 값으로 덮어써진다.**
다음 예정일과 분류를 서버와 같은 규칙으로 계산하는 이유가 이것이다
(`lib/date.ts`, `UPCOMING_WINDOW_DAYS`).

`parser` 를 패키지로 뺀 이유도 같다. 같은 규칙이 서버와 브라우저에서 돌지 않으면
오프라인 결과가 온라인과 갈린다.

### 사본을 믿지 않는 자리

- **주기와 다음 예정일** — 서버가 계산한 것만 쓴다
- **항목 매칭** — 오프라인에서는 겹침 0.6 이상만 자동 매칭하고, 애매하면 사용자에게 묻는다
- **저장 공간이 막힌 브라우저** — 사본 없이도 앱은 그대로 돈다

구현은 [`apps/web/src/lib/offline/feed-cache.ts`](../apps/web/src/lib/offline/feed-cache.ts) ·
[`pending-captures.ts`](../apps/web/src/lib/offline/pending-captures.ts) 에 있다.
