# @lastly/contracts

`web` 과 `api` 가 함께 쓰는 zod 스키마. **이 패키지가 계약이다.**

API 의 요청 검증과 웹의 응답 타입이 같은 파일에서 나오므로, 한쪽만 고쳐서
형식이 어긋나는 일이 생기지 않는다.

```
api   @Body(zodBody(interpretRequestSchema))   런타임 검증
web   InterpretResult                          컴파일 타임 타입
      ↑ 둘 다 schemas/capture.ts 하나에서 나온다
```

---

## 파일

|                   | 무엇                                                |
| ----------------- | --------------------------------------------------- |
| `common.ts`       | `isoDateSchema` · `uuidSchema` 같은 바닥 조각       |
| `item.ts`         | 항목. 홈 카드와 상세가 그대로 쓴다                  |
| `log.ts`          | 수행 기록                                           |
| `cadence.ts`      | 주기 규칙과 제안. `CadenceRule` 이 가장 널리 쓰인다 |
| `capture.ts`      | 한 문장 해석 — 요청 · 결과 · 저장                   |
| `notification.ts` | 웹푸시 구독과 알림 설정                             |

---

## 빌드해서 쓴다

zod 스키마는 타입이 아니라 **런타임 값**이다. 그래서 소스(`.ts`)가 아니라
`dist` 의 JS 를 내보낸다. 소스를 그대로 노출하면 빌드된 `api` 가 실행 시
이걸 읽지 못한다.

```bash
pnpm --filter @lastly/contracts build   # tsc -p tsconfig.build.json
```

`api` · `web` 을 돌리기 전에 이 빌드가 먼저 끝나야 하고, turbo 의 `dependsOn: ["^build"]`
가 그 순서를 보장한다. 스키마를 고쳤는데 반영이 안 되는 것 같으면 빌드부터 확인한다.

---

## 손댈 때

**스키마를 고치면 양쪽이 같이 움직인다.** 필드를 지우면 웹이 컴파일에서 걸리고,
필수로 바꾸면 API 가 기존 요청을 거절하기 시작한다. 이건 결함이 아니라 이 패키지를
둔 이유다 — 어긋남을 배포 전에 드러내려는 것이다.

`.default()` 를 붙인 필드는 요청에서 생략할 수 있다는 뜻이다. 응답 스키마에 붙이면
서버가 안 보낸 값을 클라이언트가 채우게 되므로, 정말 그걸 원할 때만 쓴다.

> **커스텀 파라미터 데코레이터로 만들지 말 것.**
> NestJS 는 데코레이터 인자에 `transform` 메서드가 있으면 파이프로 간주한다.
> zod 스키마에도 `.transform()` 이 있어서 스키마를 인자로 넘기면 파이프로 오인되고,
> 정작 데이터는 `undefined` 로 들어온다. 자세한 건 `apps/api/README.md` 참고.
