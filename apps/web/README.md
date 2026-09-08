# @lastly/web

설계 22종 화면을 구현한 모바일 웹앱. Next.js 15 App Router · PWA.

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
│   ├── page.tsx          홈          설계 04 · 05 · 05-B
│   ├── items/[id]/       항목 상세    설계 11 · 11-B · 14-B
│   ├── onboarding/       온보딩      설계 01 · 02-A · 02-B · 03
│   ├── login/            로그인      설계 12 · 12-B
│   ├── settings/         설정        설계 13 · 13-B
│   ├── auth/callback/    OAuth 착지점
│   └── api/notifications/action/   서비스워커가 알림 액션을 중계하는 곳
│
├── features/         화면 알맹이는 전부 여기
│   ├── home/             홈 조립 + 카드·행·빈 상태·로딩/오류
│   ├── capture/          말하기 → 확인 → 저장
│   │                     설계 06 · 07 · 07-B · 08 · 09 · 10 · 10-B
│   ├── items/            상세 + 기록 편집
│   ├── onboarding/       소개 · 설치 안내 · 알림 권한
│   ├── auth/             개발용 로그인
│   └── notifications/    웹푸시 구독
│
├── components/ui/    Sheet, Toast, Button, Badge
├── hooks/            서비스워커 등록
└── lib/
    ├── api/          api 호출 (client는 브라우저, server는 서버 컴포넌트용)
    ├── supabase/     브라우저·서버·미들웨어 클라이언트
    ├── date.ts       날짜 포맷과 주기 문구
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

**두 가지를 틀리기 쉽다. 실제로 틀렸던 것들이다.**

### accent는 주황이 아니다

```
accent  #4A433F   웜 그레이 — 기본 강조
action  #B0552F   주황 — 주 액션 버튼과 임박 배지에만
sage    #5A6347   안심 신호 ("백업됨", 다음 예정일)
```

주황을 전면에 깔면 화면 인상이 설계와 완전히 달라진다.

### 소수점 크기와 음수 자간을 반올림하지 않는다

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
| `ambiguous` · `unrecognized` | 재확인 시트 (설계 07-B) |

---

## 주의

- **주기 미리보기**(`cadence-sheet.tsx`의 `previewNextDue`)는 서버·DB와 같은 규칙이어야 한다.
  자세한 건 [루트 README](../../README.md#주기-계산은-세-곳에-있다--반드시-함께-고친다) 참고.
- **단위를 바꿀 때 숫자를 그대로 두면 안 된다.** 45일이 45주가 된다.
  일수로 환산한 뒤 새 단위로 다시 나눈다.
- 입력창 글자는 **16px 이상**이어야 한다. 그 미만이면 iOS가 포커스 시 화면을 확대한다.
