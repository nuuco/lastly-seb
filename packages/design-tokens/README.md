# @lastly/design-tokens

`docs/design-reference/` 에서 추출한 색·타이포·그림자. **CSS 변수 하나가 유일한 출처다.**

```css
@import '@lastly/design-tokens/css';
```

`apps/web/src/app/globals.css` 가 이렇게 한 번 불러오고,
`tailwind.config.ts` 는 값을 복제하지 않고 이 변수를 가리키기만 한다.

## 값을 손대기 전에

설계 파일을 열어 대조한다. 기억으로 고치지 않는다.

TypeScript 로도 같은 값을 내보내던 `index.ts` 가 있었는데 지웠다.
아무도 import 하지 않는 사이 개정 전 색(`#b0552f`, `#5a6347`)이 그대로 남아,
읽는 사람을 틀린 값으로 이끄는 상태였다. 출처는 하나만 둔다.
