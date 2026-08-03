# GitFlow Manager

여러 저장소의 **git-flow 라이프사이클을 한 화면에서** 관리하는 대시보드입니다.
같은 UI 가 두 가지 모드로 동작합니다.

| | 로컬 모드 | GitHub 모드 (배포판) |
|---|---|---|
| 실행 위치 | 내 PC (`npm run dev`) | https://gitflow.sanghak.kr |
| 동작 방식 | Node 백엔드가 실제 `git`·`gh` 명령 실행 | 브라우저가 GitHub REST API 호출 |
| 저장소 등록 | 로컬 경로 / 폴더 스캔 | 내 GitHub 저장소 목록에서 선택 |
| 설정 저장 | `gitflow.config.json` | Firestore (`users/{uid}`) |
| 작업 트리 상태 | ✅ 미커밋 변경·충돌 감지 | ❌ (원격 기준이라 해당 없음) |
| checkout / publish | ✅ | ❌ |
| 충돌 처리 | 중단 지점에서 멈추고 `merge --abort` 제공 | GitHub 가 병합 거부 → PR 로 해결 |

앱은 시작할 때 로컬 API 서버가 응답하는지 확인해서 모드를 자동으로 고릅니다.

## 로컬 모드 실행

```bash
npm install
npm run dev
```

- 웹: http://localhost:5177
- API: http://localhost:5178 (`GITFLOW_API_PORT` 로 변경 가능)

단독 실행은 `npm run build && npm start` — 빌드된 프론트를 API 서버가 서빙합니다.

## GitHub 모드 / 배포

1. Firebase 프로젝트에서 **Authentication → GitHub 공급자**를 켜고, 발급된 콜백 URL 을
   GitHub OAuth App 에 등록합니다. Authentication → Settings → 승인된 도메인에 `gitflow.sanghak.kr` 추가.
2. Firestore 규칙 배포: `firebase deploy --only firestore:rules`
3. 저장소 Settings → Secrets and variables → **Actions → Variables** 에 `VITE_FIREBASE_*` 6개 등록
   (`.env.example` 참고). 로컬에서 GitHub 모드를 테스트하려면 같은 값을 `.env` 에 넣습니다.
4. `main` 에 push 하면 `.github/workflows/deploy.yml` 이 GitHub Pages 로 배포합니다.
   커스텀 도메인은 `public/CNAME` 에 들어 있습니다.

로그인 시 `repo` 권한을 요청하며, GitHub 액세스 토큰은 **세션 스토리지에만** 보관합니다
(Firestore 에 저장하지 않음). 탭을 닫으면 사라지고, 만료되면 다시 로그인하면 됩니다.

## 기능

### 대시보드
등록된 모든 저장소의 현재 브랜치, 미커밋 변경, ahead/behind, 진행 중인 feature/release/hotfix 개수,
규칙 위반 요약을 카드로 보여줍니다. `전체 fetch` 로 모든 저장소를 한 번에 갱신합니다.

### 브랜치 라이프사이클
`feature / release / hotfix` 의 start·finish·publish 를 버튼으로 실행합니다.

| 동작 | 수행 내용 |
|---|---|
| feature start | develop 에서 분기 |
| feature finish | develop 로 `--no-ff` 병합 → 브랜치 삭제 |
| release start | develop 에서 분기 |
| release finish | main 병합 → 태그 → develop 역병합 → 브랜치 삭제 |
| hotfix start | main 에서 분기 |
| hotfix finish | main 병합 → 태그 → develop 역병합 → 브랜치 삭제 |

- **실행 계획 보기**(dry-run)로 실행될 git 명령을 먼저 확인할 수 있습니다.
- 작업 트리가 더러우면 시작 전에 막습니다.
- 충돌이 나면 그 지점에서 멈추고 실행 로그를 보여주며, 상단에 충돌 배너와 `merge --abort` 버튼이 뜹니다.
- `원격 pull/push 포함` 을 켜면 각 단계에 `git pull --ff-only` / `git push` 가 끼어듭니다.

### 브랜치 그래프
`git log` 를 파싱해 레인을 배정하고 SVG 로 커밋 그래프를 그립니다. 브랜치/태그 라벨, 병합 커밋 구분 표시.

### GitHub 연동 (`gh` CLI 사용)
PR 목록(상태·리뷰 결과·라벨·증감 라인), PR 생성(head 를 고르면 git-flow 규칙대로 base 자동 제안),
GitHub 자동 릴리즈 노트 생성. 별도 토큰 설정 없이 `gh auth login` 상태를 그대로 씁니다.

### 팀 규칙 검사
- 브랜치 네이밍 정규식
- 커밋 메시지 컨벤션 (기본: Conventional Commits)
- 보호 브랜치 직접 커밋 탐지
- 방치된 브랜치 (기본 30일)
- 원격이 삭제된 로컬 브랜치

규칙은 설정 화면에서 전역 기본값으로, 저장소별로 덮어쓰려면 `gitflow.config.json` 을 편집합니다.

## 저장소 등록

필요한 건 **로컬 절대 경로 하나**뿐입니다. 설정 화면에서 경로를 직접 넣거나, 상위 폴더를 스캔해 골라 담습니다.
표시 이름·main/develop 브랜치 이름은 등록 후 편집할 수 있습니다.

## 설정 파일

`gitflow.config.json` (git 에 커밋되지 않음):

```json
{
  "repos": [
    { "id": "my-app", "name": "My App", "path": "/Users/me/projects/my-app",
      "flow": { "main": "master" } }
  ],
  "defaults": {
    "flow": {
      "main": "main", "develop": "develop", "tagPrefix": "v",
      "prefixes": { "feature": "feature/", "release": "release/", "hotfix": "hotfix/", "support": "support/" }
    },
    "rules": {
      "branchName": "^(feature|release|hotfix|support)/[a-z0-9][a-z0-9._-]*$",
      "commitMessage": "^(feat|fix|docs|...)(\\([^)]+\\))?!?: .{1,}",
      "protectedBranches": ["main", "master", "develop"],
      "staleDays": 30,
      "maxCommitsChecked": 30
    }
  }
}
```

## 구조

```
server/                     로컬 모드 백엔드
  index.js                  Express API
  lib/exec.js               git/gh 실행 (셸 미경유, 실행 로그 수집)
  lib/config.js             설정 로드·저장
  lib/repo.js               브랜치·태그·상태·병합상태 조회
  lib/gitflow.js            라이프사이클을 명령 배열로 컴파일 (dry-run 공용)
  lib/graph.js              커밋 그래프
  lib/rules.js              팀 규칙 검사
  lib/github.js             gh CLI 래퍼
src/
  backends/index.jsx        모드 자동 선택 + 로그인 화면
  backends/local.js         로컬 API 백엔드
  backends/github.js        GitHub REST API 백엔드 (동일 인터페이스)
  backends/githubClient.js  GitHub API 호출 래퍼
  backends/registry.js      Firestore 저장소 등록부
  lib/laneLayout.js         커밋 그래프 레인 배정 (양쪽 공용)
  pages/                    대시보드·저장소 상세·설정
```

두 백엔드가 같은 메서드 이름을 제공하고, 화면은 `caps` 플래그로 모드별 기능만 보여줍니다.

## 주의

로컬 API 서버는 `127.0.0.1` 에만 바인딩되며 인증이 없습니다. **로컬 전용**으로만 쓰세요.
배포판은 사용자별 Firestore 문서만 읽고 쓰며, 저장소 조작 권한은 로그인한 GitHub 계정의 권한을 그대로 따릅니다.
