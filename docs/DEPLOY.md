# 배포하기

돈 안 드는 조합으로 올린다.

| 무엇 | 어디에 | 비용 |
|---|---|---|
| 웹앱 | Vercel | 무료 (Hobby) |
| API · AI | Render | 무료 (Free) |
| 알림 스케줄러 | GitHub Actions | 무료 (공개 저장소) |
| 데이터베이스 | Supabase | 무료 |

> **무료 플랜의 대가**: Render 무료 서비스는 15분간 접속이 없으면 잠든다.
> 그 뒤 첫 요청은 깨어나는 데 **30초쯤** 걸린다. 개인 프로젝트로는 견딜 만하고,
> 알림 배치는 밖에서 두드리는 구조라 자고 있어도 놓치지 않는다.
>
> 무료 한도는 바뀔 수 있으니 가입할 때 현재 조건을 한 번 확인할 것.

전체 순서는 이렇다. **위에서부터 차례로** 하면 된다.

```
1. 비밀 값 만들기        (5분)
2. AI 서비스 올리기       (10분)
3. API 올리기            (10분)
4. 웹앱 올리기           (10분)
5. 서로 연결하기          (5분)
6. 알림 스케줄러 켜기      (5분)
7. 로그인 붙이기          (2분 또는 15분)
```

7번은 두 갈래다. **테스트 계정으로 먼저 확인**하고 소셜 로그인은 나중에 붙여도 된다.

---

## 1. 비밀 값 만들기

나중에 여러 곳에 붙여넣을 값들을 먼저 만들어 **메모장에 적어둔다.**

### 1-1. 랜덤 문자열 세 개

터미널에 그대로 붙여넣는다.

```bash
node -e "for(const k of ['INTERNAL_TOKEN','DRAFT_TOKEN_SECRET','CRON_SECRET']) console.log(k+'='+require('crypto').randomBytes(24).toString('base64url'))"
```

세 줄이 나온다. 통째로 메모해둔다.

| 이름 | 무엇에 쓰나 |
|---|---|
| `INTERNAL_TOKEN` | API가 AI를 부를 때 쓰는 암호 |
| `DRAFT_TOKEN_SECRET` | 해석 결과를 위조 못 하게 서명하는 키 |
| `CRON_SECRET` | 알림 배치 문을 지키는 암호 |

### 1-2. 웹푸시 키

```bash
npx web-push generate-vapid-keys
```

`Public Key`와 `Private Key` 두 줄이 나온다. 이것도 메모.

### 1-3. Supabase 값

https://supabase.com/dashboard → `lastly` 프로젝트 →
왼쪽 아래 **Settings** → **API**

| 화면에 있는 이름 | 메모할 이름 |
|---|---|
| Project URL | `SUPABASE_URL` |
| `anon` `public` | `SUPABASE_ANON_KEY` |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

> `service_role`은 **모든 데이터에 접근할 수 있는 열쇠**다. 서버에만 넣고
> 웹앱 쪽에는 절대 넣지 않는다.

**Settings** → **Database** → **Connection string** → **URI** 탭
→ 나온 주소의 `[YOUR-PASSWORD]` 자리에 프로젝트 만들 때 정한 비밀번호를 넣는다.
이게 `DATABASE_URL`이다. 비밀번호를 잊었으면 같은 화면에서 **Reset database password**.

### 1-4. Anthropic 키

https://console.anthropic.com → **API Keys** → **Create Key**
→ `ANTHROPIC_API_KEY`로 메모. (한 번만 보여주니 꼭 복사할 것)

---

## 2. AI 서비스 올리기

AI를 먼저 올린다. API가 AI 주소를 알아야 하기 때문이다.

1. https://render.com 가입 → **GitHub로 로그인**
2. 대시보드에서 **New +** → **Web Service**
3. **Build and deploy from a Git repository** → `seb0070/lastly` 선택
   - 저장소가 안 보이면 **Configure account**로 권한을 준다
4. 설정을 이렇게 채운다

   | 항목 | 값 |
   |---|---|
   | Name | `lastly-ai` |
   | Region | `Singapore` |
   | Root Directory | `apps/ai` |
   | Language | `Docker` |
   | Instance Type | **Free** |

5. **Environment Variables** 에서 **Add Environment Variable**을 눌러 하나씩 넣는다

   | Key | Value |
   |---|---|
   | `AI_MODEL` | `claude-opus-5` |
   | `ANTHROPIC_API_KEY` | 1-4에서 메모한 값 |
   | `DATABASE_URL` | 1-3에서 만든 주소 |
   | `INTERNAL_TOKEN` | 1-1에서 메모한 값 |

6. **Deploy Web Service** 클릭. 3~5분 걸린다.
7. 다 되면 위쪽에 주소가 뜬다 (`https://lastly-ai-xxxx.onrender.com`).
   **이 주소를 메모한다.**

**확인**: 주소 뒤에 `/healthz`를 붙여 브라우저로 연다.
`{"status":"ok"}`가 나오면 성공이다. (자고 있었다면 30초쯤 걸린다)

---

## 3. API 올리기

1. Render 대시보드 → **New +** → **Web Service** → 같은 저장소 선택
2. 설정

   | 항목 | 값 |
   |---|---|
   | Name | `lastly-api` |
   | Region | `Singapore` |
   | Root Directory | **비워둔다** (모노레포 루트를 써야 한다) |
   | Language | `Docker` |
   | Dockerfile Path | `./apps/api/Dockerfile` |
   | Instance Type | **Free** |

3. **Health Check Path** (Advanced 안에 있다) → `/v1/health`
4. 환경변수

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `ENABLE_CRON` | `false` |
   | `AI_SERVICE_URL` | 2번에서 메모한 AI 주소 |
   | `AI_SERVICE_TOKEN` | `INTERNAL_TOKEN`과 **같은 값** |
   | `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_URL` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 |
   | `CRON_SECRET` | 1-1에서 메모한 값 |
   | `DRAFT_TOKEN_SECRET` | 1-1에서 메모한 값 |
   | `VAPID_PUBLIC_KEY` | 1-2의 Public Key |
   | `VAPID_PRIVATE_KEY` | 1-2의 Private Key |
   | `VAPID_SUBJECT` | `mailto:본인이메일` |
   | `CORS_ORIGIN` | 일단 `http://localhost:3000` (4번 뒤에 고친다) |

   > `AI_SERVICE_TOKEN`과 AI의 `INTERNAL_TOKEN`은 **반드시 같은 값**이어야 한다.
   > 둘이 다르면 API가 AI를 못 부르고, 앱은 조용히 폴백으로 동작한다.

5. **Deploy Web Service**. 5~8분 걸린다 (빌드가 무겁다).
6. 나온 주소를 메모한다 (`https://lastly-api-xxxx.onrender.com`).

**확인**: 주소 뒤에 `/v1/health` → `{"status":"ok","uptime":...}`

---

## 4. 웹앱 올리기

1. https://vercel.com 가입 → **GitHub로 로그인**
2. **Add New** → **Project** → `seb0070/lastly` **Import**
3. 설정

   | 항목 | 값 |
   |---|---|
   | Framework Preset | `Next.js` (자동으로 잡힌다) |
   | Root Directory | **`apps/web`** ← 반드시 바꾼다 |

4. **Environment Variables** 를 펼쳐서 넣는다

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_URL` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` 키 |
   | `NEXT_PUBLIC_API_URL` | 3번에서 메모한 API 주소 |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 1-2의 Public Key |
   | `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | `true` (테스트 계정으로 쓸 거면. 7번 참고) |

   > 여기 넣는 값은 전부 `NEXT_PUBLIC_`으로 시작한다. **브라우저에 그대로 노출되는 값**이라는 뜻이다.
   > `service_role`이나 `PRIVATE_KEY`는 절대 넣지 않는다.

5. **Deploy**. 2~3분.
6. 나온 주소를 메모한다 (`https://lastly-xxxx.vercel.app`).

---

## 5. 서로 연결하기

지금은 API가 웹앱을 모르는 상태다. 브라우저가 막는다.

1. **Render** → `lastly-api` → **Environment** → `CORS_ORIGIN`을
   4번에서 받은 Vercel 주소로 바꾼다 (끝에 `/` 없이)

   ```
   https://lastly-xxxx.vercel.app
   ```

2. **Save** 하면 자동으로 다시 배포된다.

3. **Supabase** → **Authentication** → **URL Configuration**
   - **Site URL**: Vercel 주소
   - **Redirect URLs**: `https://lastly-xxxx.vercel.app/auth/callback` 추가

---

## 6. 알림 스케줄러 켜기

서버가 자고 있어도 알림을 놓치지 않게, GitHub이 매시 정각에 두드린다.

1. https://github.com/seb0070/lastly → **Settings**
2. 왼쪽 **Secrets and variables** → **Actions**
3. **New repository secret** 으로 둘을 추가

   | Name | Secret |
   |---|---|
   | `API_URL` | 3번의 API 주소 |
   | `CRON_SECRET` | 1-1의 값 |

4. **Actions** 탭 → 왼쪽 **알림 다이제스트 발송** → **Run workflow**
   로 눌러서 지금 바로 확인해본다.

초록 체크가 뜨고 `{"candidates":0,...}` 같은 응답이 보이면 성공이다.

---

## 7. 로그인 붙이기

여기까지 하면 앱은 뜨지만 **로그인할 방법이 필요하다.**
급하지 않으면 7-A만 하고 7-B는 나중에 해도 된다.

---

### 7-A. 테스트 계정으로 (2분)

소셜 로그인 없이 바로 써 본다.

1. 비밀번호를 정해서 계정을 만든다. **기본값을 쓰지 않는다** — 저장소가 공개라
   `lastly-dev-1234`는 누구나 아는 값이다.

   ```bash
   LASTLY_DEV_PASSWORD=원하는비밀번호 node scripts/seed-dev-user.mjs
   ```

2. Vercel → 프로젝트 → **Settings** → **Environment Variables** 에
   `NEXT_PUBLIC_ENABLE_DEV_LOGIN` = `true` 가 있는지 확인한다. 없으면 추가하고
   **Deployments** → 최신 배포 → **Redeploy**.

3. Vercel 주소 → `/login` → 아래쪽 점선 박스에 이메일·비밀번호를 넣고 들어간다.

> **알아둘 것**: 이 통로가 열려 있으면 주소를 아는 사람은 누구나
> 그 계정으로 들어올 수 있다. RLS가 다른 데이터는 막아주지만,
> 그 계정의 기록은 지우거나 더럽힐 수 있다. 데모용으로만 쓰고,
> 실제 사용자를 받기 전에 `NEXT_PUBLIC_ENABLE_DEV_LOGIN` 을 지운다.

---

### 7-B. 소셜 로그인 (15분)

카카오나 구글 중 하나만 해도 된다.

콜백 주소는 둘 다 같다. Supabase → **Authentication** → **Providers** 에서
각 항목을 펼치면 화면에 적혀 있다.

```
https://<프로젝트ref>.supabase.co/auth/v1/callback
```

### 카카오

1. https://developers.kakao.com → **내 애플리케이션** → **애플리케이션 추가하기**
2. **앱 설정** → **플랫폼** → **Web 플랫폼 등록** → Vercel 주소 입력
3. **제품 설정** → **카카오 로그인** → **활성화 설정 ON**
4. 같은 화면의 **Redirect URI 등록** → 위 콜백 주소
5. **제품 설정** → **카카오 로그인** → **동의항목** →
   **닉네임**을 **필수 동의**로 설정

   > 이걸 빼면 홈 화면의 "지현님" 인사에 이름이 안 나온다.

6. **앱 설정** → **앱 키** → **REST API 키** 복사
7. **제품 설정** → **카카오 로그인** → **보안** → **Client Secret** 생성 후 **활성화**
8. Supabase → **Authentication** → **Providers** → **Kakao** →
   Enable 켜고 위 둘을 붙여넣기 → **Save**

### 구글

1. https://console.cloud.google.com → 프로젝트 만들기
2. **API 및 서비스** → **OAuth 동의 화면** → 외부 → 앱 이름만 채우고 저장
3. **사용자 인증 정보** → **사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**
   - 유형: **웹 애플리케이션**
   - **승인된 리디렉션 URI**: 위 콜백 주소
4. 나온 **클라이언트 ID**와 **보안 비밀번호**를
   Supabase → **Providers** → **Google** 에 붙여넣기 → **Save**

---

## 다 됐는지 확인하기

Vercel 주소를 폰 브라우저로 연다.

- [ ] 온보딩 화면이 뜬다
- [ ] 로그인된다 (테스트 계정 또는 카카오·구글)
- [ ] 홈에 "아직 기록이 없어요"가 뜬다
- [ ] 아래 입력창에 "이불 빨았어"를 적고 **기록**을 누르면
      몇 초 뒤 확인 시트가 올라온다
- [ ] 저장하면 홈에 항목이 생긴다
- [ ] 사파리 공유 버튼 → **홈 화면에 추가** → 아이콘이 보인다

---

## 안 될 때

| 증상 | 원인 |
|---|---|
| 첫 접속이 30초 넘게 걸린다 | Render 무료 플랜이 자고 있었다. 정상이다 |
| 홈이 "목록을 못 가져왔어요" | `CORS_ORIGIN`이 Vercel 주소와 다르거나 끝에 `/`가 붙었다 |
| 로그인 후 `/login?error=auth`로 튕긴다 | Supabase Redirect URLs에 `/auth/callback`이 없다 |
| 기록해도 AI가 못 알아듣는다 | `AI_SERVICE_TOKEN`과 `INTERNAL_TOKEN`이 다르다 |
| 인사에 이름이 없다 | 카카오 동의항목에 **닉네임**이 빠졌다 |
| Actions가 빨간 X | `API_URL` 끝에 `/`가 붙었거나 `CRON_SECRET`이 다르다 |

Render는 **Logs** 탭에서, Vercel은 **Deployments** → 해당 배포 → **Logs**에서
실제 오류를 볼 수 있다.

---

## 배포 후에 볼 것

- **개발용 로그인**은 `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` 일 때만 뜬다.
  소셜 로그인을 붙인 뒤에는 이 변수를 지운다. 변수를 지우면 화면에서 사라지고,
  계정 자체는 Supabase → **Authentication** → **Users** 에서 지운다.
- Render 무료 플랜은 **월 750시간**을 공유한다. 서비스 둘을 항상 깨워두면 모자란다.
- 사람이 늘면 API를 유료로 올려 잠들지 않게 하는 것이 첫 번째 개선이다.
