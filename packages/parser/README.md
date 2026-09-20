# @lastly/parser

한국어 한 문장에서 **LLM 없이** 뽑아내는 규칙. `web` 과 `api` 가 함께 쓴다.

해석에 필요한 다섯 가지 중 넷은 말의 형태만 보면 정해진다. 그 넷을 먼저 처리해 두면
LLM 까지 가는 문장이 크게 줄고, 무료 호스팅의 콜드 스타트도 타지 않는다.

---

## 뽑는 것

`readUtterance(text, reference)` 하나가 아래를 한 번에 돌려준다.

| 필드 | 예 |
|---|---|
| `intent` | "언제 빨았지?" → `query`, 그 밖 → `record` |
| `daysAgo` | "지난주 일요일" → 기준일 요일로 계산 |
| `statedCadenceDays` | "세달에 한번" → 90 · "이틀에 한번" → 2 |
| `name` | "수건 빨았어" → "수건 빨래" |
| `sawDate` · `sawAction` | 실제로 읽어냈는지. 확신도를 매길 때 쓴다 |

조각으로도 쓸 수 있다 — `readIntent` · `readDaysAgo` · `readCadenceDays` · `readName`.

**`sawAction` 이 false 면 `name` 을 믿지 않는다.** "음 그러니까 그거" 같은 문장도
지우고 나면 뭔가 남기 때문이다.

---

## 동사만 사전으로 바꾸고 대상은 그대로 둔다

대상("가습기 필터", "블라인드")은 끝이 없지만 행동("빨다", "갈다", "닦다")은 몇 개뿐이다.
그래서 처음 보는 물건이어도 사전에 없을 이유가 없고, 넓히려면 `ACTION_NOUNS` 에 한 줄 더한다.

평가셋 30문장에서 이름은 30개를 맞혔다 — 같은 문장에서 호스팅 LLM 은 25개였다.
정답이 하나로 정해진 문제라 규칙이 더 낫고, 틀리면 한 줄 고쳐 테스트로 고정할 수 있다.

---

## 왜 패키지로 나와 있나

예전에는 `apps/api/src/modules/capture/` 안에 있었다. 그러면 **연결이 끊긴 브라우저가
같은 규칙을 쓸 수 없다.** 오프라인에서도 항목·날짜·주기를 정하려면 같은 코드가 양쪽에서
돌아야 한다. 두 벌로 나누면 오프라인 결과가 온라인과 달라진다.

```
api   byRules()                    평소 경로. 규칙으로 풀리면 LLM 을 부르지 않는다
web   lib/offline/resolve-offline  연결이 없을 때만. 같은 함수를 브라우저에서 돌린다
```

---

## 빌드해서 쓴다

`@lastly/contracts` 와 같은 이유다. 런타임 값이라 소스가 아니라 `dist` 의 JS 를 내보낸다.

```bash
pnpm --filter @lastly/parser build   # tsc -p tsconfig.build.json
```

turbo 의 `dependsOn: ["^build"]` 가 `api` · `web` 보다 먼저 돌게 한다.

---

## 테스트는 여기에 없다

`apps/api/src/modules/capture/` 에 있다.

| | 무엇 |
|---|---|
| `utterance-rules.spec.ts` | 규칙 단위 |
| `utterance-rules.eval.spec.ts` | 평가셋 전체 정확도 |

파서를 고쳤으면 `pnpm --filter @lastly/api test` 를 돌린다.
이 패키지는 의존성이 없으므로 테스트도 DB·AI 없이 돈다.
