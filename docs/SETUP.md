# Supabase 셋업

Lastly **전용 프로젝트를 새로 만든다.** 다른 프로젝트의 DB에 이 마이그레이션을 밀면
`items` / `profiles` 같은 흔한 이름의 테이블이 그쪽 스키마와 충돌한다.

CLI는 레포에 devDependency로 들어 있다. 전역 설치는 필요 없고 `pnpm exec supabase ...`로 쓴다.

---

## 1. 프로젝트 만들기

https://supabase.com/dashboard → **New project**

| 항목 | 값 |
|---|---|
| Name | `lastly` |
| Region | **Northeast Asia (Seoul)** — 사용자가 한국이므로 지연시간이 크게 줄어든다 |
| Database Password | 생성해서 **따로 저장** (`db:push`에 매번 필요하다) |

프로비저닝에 1~2분 걸린다.

> 무료 티어는 **일주일 미사용 시 자동 일시정지**된다. 재개는 대시보드에서 한 번 누르면 되지만,
> 그동안 DB 연결이 타임아웃으로 실패한다. 개발이 뜸해질 시기라면 이 점을 기억해둘 것.

## 2. 레포와 연결

```bash
pnpm exec supabase login          # 브라우저로 토큰 발급
pnpm exec supabase link           # 목록에서 방금 만든 lastly 선택
```

`supabase/.temp/`에 프로젝트 ref가 저장된다 (gitignore 처리돼 있다).

## 3. 스키마 적용

```bash
pnpm db:push                      # 마이그레이션 4개 적용
psql "<Connection string>" -f supabase/seed.sql   # 주기 사전 초기값
```

`psql`이 없으면 대시보드 **SQL Editor**에 `supabase/seed.sql` 내용을 붙여넣어도 된다.

적용되는 것:

| 마이그레이션 | 내용 |
|---|---|
| `…0001_init` | 테이블 7개 + `vector` / `pg_trgm` 확장 |
| `…0002_functions_rls` | 주기 계산 함수, 통계 트리거, `match_items`, RLS 정책 |
| `…0003_alias_rpc` | 별칭 학습 RPC |
| `…0004_digest_rpc` | 알림 배치 대상 조회 RPC |

확인:

```bash
pnpm exec supabase db lint        # 스키마 이상 여부
```

대시보드 **Table Editor**에 `items`, `item_logs`, `cadence_priors` 등이 보이면 성공이다.

## 4. 키를 `.env`에

대시보드 **Project Settings → API**:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
```

**Project Settings → Database → Connection string → URI** (AI 서비스가 직접 붙는다):

```bash
DATABASE_URL=postgresql://postgres.<ref>:<비밀번호>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

> `service_role` 키는 RLS를 **우회한다.** `apps/api`에서만 쓰고 절대 프론트로 내보내지 않는다.
> `NEXT_PUBLIC_` 접두사를 붙이는 순간 브라우저 번들에 들어간다.

나머지 키:

```bash
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

`ANTHROPIC_API_KEY`는 https://console.anthropic.com 에서 발급한다.
`DRAFT_TOKEN_SECRET`은 아무 랜덤 문자열이면 된다 (16자 이상).

## 5. 소셜 로그인

화면 12가 카카오·구글 두 가지를 쓴다. **Authentication → Providers**에서 켠다.

콜백 URL은 두 곳 모두 동일하다:

```
https://<ref>.supabase.co/auth/v1/callback
```

### 카카오

1. https://developers.kakao.com → 애플리케이션 추가
2. **제품 설정 → 카카오 로그인** 활성화 → Redirect URI에 위 주소 등록
3. **동의항목**에서 `profile_nickname` 필수 동의로 설정
   (없으면 `profiles.display_name`이 비어 홈의 "지현님" 인사가 안 나온다)
4. **앱 키 → REST API 키** → Supabase의 Kakao `Client ID`
5. **보안 → Client Secret** 생성 후 활성화 → Supabase의 `Client Secret`

### 구글

1. https://console.cloud.google.com → **API 및 서비스 → 사용자 인증 정보**
2. OAuth 클라이언트 ID (웹 애플리케이션) 생성
3. 승인된 리디렉션 URI에 위 주소 등록

### 사이트 URL

**Authentication → URL Configuration**:

- Site URL: `http://localhost:3000` (배포 후 실제 도메인으로 교체)
- Redirect URLs에 `http://localhost:3000/auth/callback` 추가

## 6. 확인

```bash
pnpm dev
```

http://localhost:3000 에서 홈이 뜨고, http://localhost:4000/docs 의 `GET /v1/home/feed`가
401이 아니라 빈 피드를 돌려주면 연결이 된 것이다.

---

## 로컬 DB로 개발하려면 (선택)

클라우드 대신 로컬에서 돌릴 수 있다. **Docker Desktop이 실행 중이어야 한다.**

```bash
pnpm db:start                     # Postgres + Auth + Studio 기동
pnpm db:reset                     # 마이그레이션 + seed 한 번에 적용
```

| 주소 | 무엇 |
|---|---|
| http://localhost:54323 | Studio |
| `postgresql://postgres:postgres@localhost:54322/postgres` | `DATABASE_URL` |

`supabase start` 출력에 나오는 `anon key` / `service_role key`를 `.env`에 넣는다.
로컬은 고정 키라 커밋해도 무방하지만, 클라우드 키와 섞이지 않게 `.env.local`로 분리하는 편이 낫다.

소셜 로그인은 로컬에서 별도 설정이 필요하므로(`supabase/config.toml`의 `KAKAO_CLIENT_ID` 등),
로그인 흐름을 만질 게 아니라면 클라우드 쪽이 편하다.

---

## 자주 막히는 곳

| 증상 | 원인 |
|---|---|
| `Connection terminated due to connection timeout` | 프로젝트 일시정지. 대시보드에서 재개 |
| `type "vector" does not exist` | 확장이 `extensions` 스키마에 안 깔림. `db:push`를 처음부터 다시 |
| 로그인 후 `/login?error=auth`로 튕김 | Redirect URLs에 `/auth/callback`이 없음 |
| 홈이 401 | `.env`의 키가 다른 프로젝트 것이거나 `NEXT_PUBLIC_SUPABASE_URL` 오타 |
| 홈 인사에 이름이 없음 | 카카오 동의항목에 `profile_nickname`이 빠짐 |
