# Lastly 로컬 실행

- 로컬 기동: Docker·Node 22·pnpm·Python 3.12·Supabase 로컬 DB로 세 서비스 실행
- Docker Desktop 실행: 데몬 기동 대기
- 의존성 설치: 루트 `pnpm install` 진행
- 환경파일: `.env.example`을 `.env`로 복사 후 키 채움
- Docker 디스크 부족: 실행 중 컨테이너는 유지하고 빌드 캐시만 정리
- 로컬 DB: `pnpm db:start` 재시도 후 기동 성공
- 익명 로그인: `supabase/config.toml`에 `enable_anonymous_sign_ins` 추가
- AI 포트: 호스트 8000·8002가 다른 컨테이너와 겹쳐 로컬만 8003 사용
- 테스트 계정: `dev@lastly.local` / `lastly-dev-1234` 시드
- 개발 서버: web :3000 · api :4000 · ai :8003 기동

## 다시 실행

Docker Desktop을 먼저 켠다. Ready 뒤에 아래를 실행한다.

```bash
nvm use 22
cd /Users/yoong/Desktop/nuuco/project/lastly-seb
pnpm db:start
```

터미널을 두 개 연다.

```bash
# 터미널 1 — AI
cd /Users/yoong/Desktop/nuuco/project/lastly-seb
source apps/ai/.venv/bin/activate
cd apps/ai
uvicorn lastly_ai.main:app --reload --port 8003 --app-dir src
```

```bash
# 터미널 2 — 웹 + API
nvm use 22
cd /Users/yoong/Desktop/nuuco/project/lastly-seb
pnpm --filter @lastly/contracts build
pnpm --filter @lastly/web --filter @lastly/api dev
```

- 웹: http://localhost:3000
- API: http://localhost:4000/docs
- AI: http://localhost:8003/docs
- Studio: http://localhost:54323
- 로그인: `dev@lastly.local` / `lastly-dev-1234`

끌 때: 두 터미널에서 `Ctrl+C`. DB까지 내리면 `pnpm db:stop` (데이터는 남음).

- AI를 8003으로 두는 이유: 이 맥에서 8000·8002가 다른 Docker 컨테이너가 사용 중
- `.env`의 `AI_SERVICE_URL`은 `http://localhost:8003`
- DB는 Docker 볼륨 `supabase_db_lastly`. `pnpm db:reset`만 데이터를 초기화함
