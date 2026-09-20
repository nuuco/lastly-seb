# @lastly/web

설계 26종 화면을 구현한 모바일 웹앱. Next.js 15 App Router · PWA.

설계 원본은 [`docs/design-reference/`](../../docs/design-reference/)에 화면별로 쪼개 두었다.
**UI를 손대기 전에 해당 화면 파일을 먼저 연다.** 기억이나 추측이 아니라 대조로 맞추기 위한 것이다.

```bash
pnpm --filter @lastly/web dev      # :3000
```

---

## 폴더

```
src/
├── app/              라우트만. 얇게 유지한다
│   ├── page.tsx          홈          설계 04 · 05 · 05-B · 05-C · 05-E
│   ├── search/           검색        설계 05-D
│   ├── items/[id]/       항목 상세    설계 11 · 11-B · 14-B
│   ├── onboarding/       온보딩      설계 01 · 02-A · 02-B · 03
│   ├── login/            로그인      설계 12
│   ├── settings/         설정        설계 13 · 13-B
│   ├── auth/callback/    OAuth 착지점
│   └── api/notifications/action/   서비스워커가 알림 액션을 중계하는 곳
│
├── features/         화면 알맹이는 전부 여기
│   ├── home/             홈 조립 + 카드·행·빈 상태·로딩/오류
│   ├── capture/          말하기 → 확인 → 저장, 그리고 조회
│   │                     설계 06 · 07 · 07-C · 08 · 08-B · 09 · 10 · 10-B
│   ├── calendar/         달력 뷰      설계 05-C
│   ├── search/           검색        설계 05-D
│   ├── items/            상세 + 기록 편집
│   ├── onboarding/       소개 · 설치 안내 · 알림 권한
│   ├── auth/             개발용 로그인 · 계정 연결 유도(설계 12-B)
│   └── notifications/    웹푸시 구독
│
├── components/ui/    Sheet, Toast
├── hooks/            서비스워커 등록
└── lib/
    ├── api/          api 호출 (client는 브라우저, server는 서버 컴포넌트용)
    ├── supabase/     브라우저·서버·미들웨어 클라이언트 · ensure-session
    ├── offline/      연결이 끊겼을 때의 저장과 대기열
    ├── date.ts       날짜 포맷 · 주기 문구 · nextDueAfter
    └── cn.ts
```

`app/`은 라우팅만 하고 보통 세 줄이면 끝난다. 화면 알맹이는 `features/`에 둔다.

---

## 렌더링

홈(`/`)과 항목 상세는 **서버 컴포넌트가 초기 데이터를 가져와 내려보낸다.**
클라이언트는 그 데이터로 즉시 그리고 이후 갱신만 맡는다 (`useQuery`의 `initialData`).

```tsx
// app/page.tsx
const initialFeed = await serverFetch<HomeFeed>('/home/feed');
return <HomeScreen initialFeed={initialFeed} />;
```

[`lib/api/server.ts`](src/lib/api/server.ts)는 쿠키에서 세션을 읽어 `api`를 호출하고,
**실패하면 던지지 않고 `null`을 돌려준다.** 그 경우 클라이언트가 평소대로 다시 가져간다.
초기 데이터는 있으면 좋은 것이지 없으면 안 되는 게 아니다.

로그인·온보딩·설정은 개인화된 초기 데이터가 없어 정적으로 남겨둔다.

`server-only` 패키지를 걸어뒀으므로 서버 전용 모듈이 클라이언트 번들에 섞이면 빌드가 깨진다.

> Next.js는 기본적으로 앱 디렉터리의 `.env`만 읽는다. 이 모노레포는 루트 `.env` 하나를
> 세 서비스가 공유하므로 [`next.config.mjs`](next.config.mjs)에서 `@next/env`로 직접 읽어들인다.

---

## 스타일

색·크기·그림자는 [`@lastly/design-tokens`](../../packages/design-tokens/)에서만 온다.
`tailwind.config.ts`는 그 CSS 변수를 가리킬 뿐 값을 복제하지 않는다.

**다음 두 가지를 자주 어긴다.**

### 강조색

```
accent      #4a433f   웜 그레이 — 기본 강조
accent-ink  #9a4f31   강조 글자
action      #a85f44   테라코타 — 주 액션 버튼과 임박 배지에만
danger      #b3402c   지난 항목(D+n)과 삭제
sage        #d4836a   보조 점·표식
```

주황을 전면에 깔면 화면 인상이 설계와 완전히 달라진다.

> 개정 설계에서 팔레트가 통째로 바뀌었다. 예전 값(`#b0552f`, `#5a6347`)은
> 지금 설계 파일에 **한 번도 나오지 않는다.** 옛 색이 보이면 개정 전 코드다.

### 소수점 크기와 음수 자간

`12.5px`, `15.5px`, `-.035em`, `-.055em` 같은 값이 이 디자인의 인상을 만든다.
Tailwind 기본 스케일로 뭉개면 다른 화면이 된다. 그래서 `text-12.5`, `tracking-t35`처럼
설계값을 그대로 등록해 두었다.

### 애니메이션

설계에 있는 것은 둘뿐이다. 임의로 늘리지 않는다.

| | |
|---|---|
| `animate-wv` | 음성 파형 막대. 10개가 각각 다른 지연으로 어긋나게 움직인다 |
| `animate-caret` | 입력 커서 깜빡임 |

전환(시트 등장, 토스트, 누름 반응)은 `prefers-reduced-motion`에서 꺼진다.

---

## 입력 흐름

이 앱의 핵심 인터랙션이다. [`features/capture/`](src/features/capture/)에 모여 있다.

```
마이크 탭
  → 입력창 자리에 파형이 뜨고 실시간 인식 문장이 흐른다
  → 말이 끝나면 그 문장이 입력창에 채워진다 (바로 보내지 않는다)
  → 사용자가 확인·수정 후 [기록]
  → 서버가 해석하는 동안 문장을 남겨두고 진행 표시
  → outcome에 따라 시트가 갈린다
```

**알약의 모양·색·크기는 어떤 상태에서도 바뀌지 않는다.** 같은 자리에 같은 형태로 있어야
사용자가 흔들리지 않는다. 상태는 안쪽 내용과 오른쪽 버튼으로만 알린다.

어느 시트를 띄울지는 프론트가 판단하지 않는다. 서버가 준 `outcome`을 그대로 따른다:

| outcome | 화면 |
|---|---|
| `matched_existing` | 확인 시트 (설계 08) |
| `new_item` | 확인 시트 (설계 09) |
| `ambiguous` · `unrecognized` | 재확인 시트 (설계 07 안) |

---

## 오프라인 처리

[`lib/offline/`](src/lib/offline/) 이 맡는다. **화면은 평소 저장과 똑같이 보인다** —
언제 서버에 올라가는지 사용자에게 말하지 않는다.

```
interpret 실패 + navigator.onLine === false
  → resolveOffline(text, mode)      @lastly/parser 를 브라우저에서 돌린다
      saved   이름이 기존 항목과 일치. 바로 저장하고 피드 캐시를 갱신한다
      ask     비슷한 이름(겹침 0.6↑) 또는 새 항목. 확인 시트를 띄운다
      queued  이름을 못 뽑음. 문장만 적어 두고 연결됐을 때 서버가 해석한다
  → 저장은 pending-captures 대기열로
  → use-pending 이 온라인이 되면 순서대로 올린다
```

| | 무엇 |
|---|---|
| `resolve-offline.ts` | 규칙 파서를 돌려 셋 중 하나로 정한다 |
| `pending-captures.ts` | 대기열. `resolved`(기존 항목 기록) · `item`(새 항목) · `raw`(원문) |
| `use-pending.ts` | 업로드 루프. 화면에 아무 말도 하지 않는다 |
| `feed-cache.ts` | 마지막 홈 피드 사본. `applyLocalLog` 로 다음 예정일까지 다시 계산한다 |
| `use-online.ts` | 연결 상태 |

**다음 세 가지를 자주 어긴다.**

- 저장 요청은 `networkMode: 'always'` 여야 한다. React Query 기본값(`'online'`)은
  오프라인에서 요청을 붙들고 기다려서 **오류가 나지 않는다.** 그러면 위 분기로
  못 들어가고 화면이 "살펴보고 있어요" 인 채로 멈춘다.
- 오프라인 배너를 `query.isError` 로 판단하지 않는다. 캐시된 데이터가 있으면 계속
  false 다. `failureCount` 와 `useOnline()` 을 쓴다.
- [`public/sw.js`](public/sw.js) 는 **network-first** 다. cache-first 로 두면 개발 중에
  옛 번들이 계속 뜬다. 배포마다 `CACHE` 이름을 올린다.

---

## 계정 생성 시점

[`lib/supabase/ensure-session.ts`](src/lib/supabase/ensure-session.ts) 를 쓰기 요청 직전에
부른다. 둘러보기만 하는 사람에게는 계정을 만들지 않는다.

그래서 **홈이 계정 없이도 그려져야 한다.** 서버 컴포넌트는 `user` 가 없으면 API 를
부르지 않고 빈 홈을 내려보낸다. 첫 저장으로 계정이 생기면
[`use-signed-in.ts`](src/lib/supabase/use-signed-in.ts) 의 `onAuthStateChange` 가
홈 질의를 활성화한다. **이 구독이 없으면 첫 기록이 목록에 나타나지 않는다** —
질의가 `enabled: false` 인 채로 남기 때문이다.

---

## 주의

- **주기 계산**(`lib/date.ts` 의 `nextDueAfter`)은 서버·DB와 같은 규칙이어야 한다.
  주기 시트의 미리보기와 오프라인 목록 갱신이 둘 다 이걸 쓴다.
  자세한 건 [루트 README](../../README.md#주기-계산) 참고.
- **단위를 바꿀 때 숫자를 그대로 두면 안 된다.** 45일이 45주가 된다.
  일수로 환산한 뒤 새 단위로 다시 나눈다.
- 입력창 글자는 **16px 이상**이어야 한다. 그 미만이면 iOS가 포커스 시 화면을 확대한다.
