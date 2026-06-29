# 🚗 차량 운행기록부 PWA

국세청 양식 맞춤형 차량 운행 기록부 모바일 앱

## 📱 핸드폰에 설치하기 (오프라인 배포)

### 방법 1: 같은 WiFi에서 로컬 서버로 설치 (추천)

이 방법은 외부 서비스 없이 자신의 컴퓨터에서 핸드폰으로 직접 앱을 전달합니다.

#### 1단계: 빌드
```bash
npm run build
```

#### 2단계: HTTPS 서버 실행
```bash
npm run serve:https
```

터미널에 표시되는 `https://192.168.x.x:8443` 주소를 확인합니다.

#### 3단계: 핸드폰에서 접속 & 설치

1. **핸드폰과 컴퓨터가 같은 WiFi**에 연결되어 있는지 확인
2. 핸드폰 브라우저(Chrome 추천)에서 터미널에 표시된 HTTPS 주소 입력
3. **"안전하지 않음" 경고**가 나오면:
   - "고급" 또는 "상세정보" 클릭
   - "안전하지 않은 사이트로 이동" 클릭
4. 앱이 로드되면 설치:
   - **Android**: 브라우저 상단 또는 메뉴 → **"홈 화면에 추가"** 또는 **"앱 설치"**
   - **iPhone**: 하단 **공유 버튼(□↑)** → **"홈 화면에 추가"**
5. 홈 화면에 추가된 앱 아이콘으로 실행

#### 4단계: 오프라인 사용

한 번 설치하면 **인터넷 연결 없이도** 앱을 사용할 수 있습니다!
서버를 종료해도 핸드폰의 앱은 계속 작동합니다.

---

### 방법 2: GitHub Pages에 무료 배포

인터넷을 통해 어디서나 접속할 수 있도록 배포합니다.

#### 1단계: GitHub 저장소 생성
1. [github.com](https://github.com)에서 새 저장소 생성
2. 저장소 이름 예: `car-log-app`

#### 2단계: 코드 업로드
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/car-log-app.git
git push -u origin main
```

#### 3단계: GitHub Pages 설정
1. 저장소 → Settings → Pages
2. Source: "GitHub Actions" 선택
3. `.github/workflows/deploy.yml` 파일이 자동으로 배포합니다

#### 4단계: 핸드폰에서 접속
- `https://YOUR_USERNAME.github.io/car-log-app/` 주소로 접속
- 위 3단계와 동일하게 "홈 화면에 추가"

---

## 🛠 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 미리보기 (HTTP)
npm run preview

# HTTPS 로컬 서버 (PWA 설치 가능)
npm run serve:https
```

## 📋 주요 기능

- 📱 PWA - 핸드폰 홈 화면에 설치 가능
- 🔌 오프라인 지원 - 인터넷 없이 사용 가능
- 📊 국세청 운행일지 양식 다운로드 (Excel)
- 📝 CSV 내보내기
- 🗓 월별 필터링 및 관리
- 🏷 템플릿 기반 빠른 기록 입력
- 📍 방문지 기록 관리
