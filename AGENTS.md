# 작업 기록

- 로컬 AI 캡처: 규칙이 못 끝낸 문장만 기기 Gemma, 서버 Gemini는 주기만
- 브랜치 feat/local-ai: 업스트림 02c62da 기준, 533bd1d는 참고만
- 모델 인프라: gitignore·다운로드 스크립트·워커·미들웨어·env 예시
- contracts slots: interpret 요청에 clientParseSlots, 있으면 문장 재해석 안 함
- API interpret: parseUtterance 제거, fromClientSlots·decideOutcome 유지
- 웹 파서: @lastly/parser overlay + parse-local, 홈 knownItems·예정 토스트
- 동의·음성: 첫 방문 670MB 시트, 설정 행, 조회 TTS, 확인 응/아니
- 약관: Gemma 이용약관 고지, 개인정보 문장 LLM 미전송으로 개정
- 확인: API capture 스펙 28개 통과, web·api typecheck 통과. 브라우저 도구 없음 — 화면은 로컬 서버 HTML로만 확인
- 음성: 침묵 1.4초 후 바로 interpret·확인 시트. 입력창만 채우던 경로 제거
- 음성 effect: shown은 ref로만 읽어 목록 갱신과 듣기 끝이 겹치지 않게 함
