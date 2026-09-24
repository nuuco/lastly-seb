# 온디바이스 실험실 (`/dev/on-device`)

개발용 화면. 앱 화면은 이 폴더를 부르지 않는다.
dev 서버이거나 `NEXT_PUBLIC_ENABLE_LAB=true` 일 때만 열린다.

## 측정 방식 두 가지

| 방식 | 보내는 지시문 | 규칙 | 무엇을 재나 |
| --- | --- | --- | --- |
| 앱 경로 | `on-device/parse-prompt.ts` (앱과 같음) | 먼저 돈다. 규칙이 못 끝낸 문장만 모델 | 사용자가 실제로 겪는 결과 |
| 실험 지시문 | `lab/prompt-experiment.ts` (앱 미사용) | 없음 | 모델 자체 실력. status 와 미래 날짜까지 모델이 판단 |

- 앱 경로는 캡처 화면과 같은 `interpretLocally()` 를 부른다. 서버로 보내기 직전까지 같다.
- 앱 경로에서는 했는지 여부를 규칙이 정한다. 그래서 엔진이 달라도 Status·False Completion 이 같다.
- 엔진끼리 Status·False Completion 을 비교하려면 실험 지시문 줄을 본다.
- 실험 지시문을 고쳐도 앱 지시문은 바뀌지 않는다.

## 표

- 표 1: 엔진별 정확도·속도·다운로드·메모리·준비 시간·지원 환경·비용
- 표 2: 같은 골든셋에서 Intent / Status / Activity / Date 정답률, False Completion(저장하면 안 되는 문장을 저장한 비율, 낮을수록 좋음)
- 앱 경로에서 저장하지 않는 게 맞는 문장(못 한 일·예정·애매)을 저장하지 않았으면 Activity·Date 는 채점하지 않는다. 앱이 그 값을 쓰지 않기 때문이다.
- 규칙이나 실험 지시문을 고쳐 돌린 결과는 `#해시` 가 붙은 별도 줄로 남는다.

## 파일

- `golden/` 골든셋 (JSON · CSV)
- `evaluate.ts` 실행·채점
- `prompt-experiment.ts` 실험 지시문
- `rules-lab.ts` 규칙 고쳐 보기
- `cloud-gemini.ts` Cloud LLM 줄 (apps/ai 와 같은 지시문)
- `lab-store.ts` 결과를 이 브라우저에 저장
