# 2026_P.U.B.G._by_Craft_On

# 📦 PUBG 게임 제출 가이드 📦

### "내가 만든 게임, 어떻게 제출하나요?"

#### 팀별로 완성한 게임을 깃허브에 업로드하고 레포 링크를 제출하는 방법! 순서대로만 따라오시면 됩니다 🙌

## 1️⃣ 게임 빌드하기

**Unity 등 게임엔진으로 만든 경우 — exe (Windows)**
```
Unity 상단 메뉴 File → Build Settings 클릭
Platform: PC, Mac & Linux Standalone, Target Platform: Windows 선택
Build 클릭 → 저장할 폴더 지정
.exe 파일 + _Data 폴더, .dll 파일들까지 생성됨
```

**Unity로 만든 경우 — app (macOS)**
```
Platform: PC, Mac & Linux Standalone, Target Platform: macOS 선택
Build 클릭 → 저장할 폴더 지정
.app 파일 하나로 생성됨 (실제로는 내부에 여러 파일이 든 폴더)
```

#### ⚠️ .app은 반드시 맥에서 압축해주세요! (우클릭 → "압축") 윈도우에서 압축하면 실행 권한이 깨져서 안 열릴 수 있어요.
#### ⚠️ 서명 안 된 앱이라 처음 실행 시 "확인되지 않은 개발자" 경고가 뜹니다 → 우클릭 → 열기, 또는 시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기"

**Unity로 만든 경우 — iOS (iPhone/iPad)**
```
Unity Hub에서 iOS Build Support 모듈 설치 (맥 필수)
Platform을 iOS로 변경 후 Build
.ipa가 아니라 Xcode 프로젝트 폴더가 생성됨
Xcode로 열기 → Signing & Capabilities에서 Apple ID(Team) 선택
아이폰을 맥에 연결 → Run(▶) 버튼으로 기기에 설치
```

#### ⚠️ iOS는 exe/apk처럼 파일 하나로 배포가 안 됩니다! 무료 Apple ID로 설치한 앱은 7일 후 만료되고, .ipa 배포나 TestFlight는 유료 개발자 계정(연 $99)이 필요해요.
#### 👉 iOS로 개발한 팀은 Xcode 프로젝트 폴더를 zip으로 압축해서 올리고, 플레이 영상이나 WebGL 빌드를 함께 제출하는 걸 추천합니다.

**Unity로 만든 경우 — apk (Android)**
```
Platform을 Android로 변경 후 Build
.apk 파일 하나로 생성됨
```

**Unity로 만든 경우 — 웹 실행 (WebGL 빌드)**
```
Platform을 WebGL로 변경 후 Build
index.html + 관련 폴더(Build, TemplateData 등) 생성됨
```

**HTML/JS 등으로 직접 개발한 경우 (Unity 안 쓴 팀)**
```
별도 빌드 과정 없이, 게임 폴더 안에 있는 index.html이 더블클릭으로 바로 열리는지만 확인
프로젝트 폴더 전체(이미지, css, js 파일 포함)를 그대로 zip으로 압축
```

#### ⚠️ exe나 html 계열은 파일 하나만 옮기면 실행 안 됩니다! 관련 폴더·파일 전부 한 폴더에 넣고 zip으로 압축해주세요.

## 2️⃣ 깃허브 저장소(레포) 만들기
1. github.com 접속 → 로그인 → 우측 상단 + → New repository
2. 저장소 이름 예시: craft-on-team-이름 (팀명으로 알아보기 쉽게!)
3. Public으로 설정 (Private는 무료 배포 안 됨)
4. Create repository 클릭

## 3️⃣ 실행파일 업로드하기 (GitHub Releases)
1. 저장소 페이지 오른쪽 Releases 클릭 (없으면 "Create a new release")
2. Tag 입력: v1.0
3. Release title 입력: 게임 이름
4. Attach binaries에 1️⃣에서 압축한 zip 파일 드래그 앤 드롭 (exe/apk/html 중 만든 버전 업로드)
5. Publish release 클릭 → 릴리즈 페이지 URL 생성됨

## 4️⃣ README.md 작성하기
### 저장소 메인 페이지에서 Add a README 클릭 후 아래 내용 포함해서 작성해주세요.
#### 도움이 필요하시다면 언제든 교육부장에게 연락주세요!!
```
게임 제목
팀원 소개
게임 소개 (어떤 장르, 어떤 재미인지)
조작법 (키보드/마우스 등)
스크린샷 (있으면 좋아요!)
```

### ⬇️ 다운로드 링크 (릴리즈 URL) ← 3️⃣에서 만든 릴리즈 페이지 링크를 여기에 꼭 넣어주세요!
`웹 게임(html)으로 제출한 팀은 "압축 해제 후 index.html 실행" 이라고 한 줄 안내 추가`

**예시:**

```markdown
## 다운로드
[게임 다운로드 (v1.0)](https://github.com/아이디/레포이름/releases/tag/v1.0)

## 실행 방법
zip 압축 해제 후 index.html 더블클릭으로 실행
```

## 5️⃣ 저희한테 링크 제출하기

**구글 폼에는 저장소(레포) 링크만 제출해주시면 됩니다!**

`https://github.com/아이디/레포이름`

### 레포에 들어가면 README에서 게임 소개도 보고, 안에 있는 다운로드 링크로 바로 이어지니까 이거 하나면 충분합니다~!
