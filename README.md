# 프로게이머 키우기

18세 아마추어에서 시작해 아카데미를 거쳐 프로가 되고, MSI와 월드 챔피언십에 도전하는 육성 시뮬레이션 게임입니다.
(순수 HTML/CSS/JavaScript, 빌드 과정 없음)

## 파일
- `index.html` 화면 구조
- `style.css` 디자인 (모바일 대응)
- `game.js` 게임 로직 전부
- `ui.js` 도트 캐릭터·아이콘·페이지(탭) 전환·스와이프 (game.js는 그대로)
- `bgm.js` 배경음악 (오리지널 곡을 실시간으로 합성, 음원 파일 없음)

## 내 컴퓨터/폰에서 바로 실행
`index.html`을 더블클릭하면 브라우저에서 열립니다.
챔피언 목록과 아이콘은 Riot Data Dragon에서 불러오므로 처음 한 번은 인터넷이 필요합니다.

## GitHub Pages로 공개하기 (무료)
1. GitHub에서 새 저장소(Repository)를 만듭니다. 공개(Public)로 만들면 무료입니다.
2. `Add file` > `Upload files`로 `index.html`, `style.css`, `game.js`, `ui.js`, `bgm.js`를 올리고 Commit 합니다.
3. 저장소의 `Settings` > `Pages`에서 Source를 `Deploy from a branch`, Branch를 `main` / `(root)`로 정하고 Save 합니다.
4. 1~2분 뒤 `https://내아이디.github.io/저장소이름/` 주소로 접속할 수 있습니다.
5. 파일을 고쳐서 다시 올리면 몇 분 안에 반영됩니다.

다른 방법: Netlify Drop(app.netlify.com/drop)에 폴더를 끌어다 놓으면 1분 만에 주소가 생깁니다.

## 검색에 나오게 하기
새 사이트는 가만히 두면 검색에 잘 나오지 않습니다.
1. 사이트 주소를 정한 뒤 Google Search Console(search.google.com/search-console)에서 `URL 접두어` 속성으로 주소를 등록하고, 소유 확인 메타 태그를 `index.html`의 head에 붙여 넣어 다시 올립니다.
2. Search Console의 `URL 검사`에 주소를 넣고 `색인 생성 요청`을 누릅니다. 반영까지 며칠에서 몇 주가 걸릴 수 있습니다.
3. 한국 사용자를 위해 네이버 서치어드바이저(searchadvisor.naver.com)에도 같은 방식으로 등록하고 웹페이지 수집을 요청합니다.
4. 검색창에 `site:내아이디.github.io/저장소이름`을 입력하면 색인이 되었는지 확인할 수 있습니다.
5. GitHub 저장소 설정(About)에서 설명과 Topics(예: web-game, esports, simulation)를 적어 두면 GitHub 안에서 검색됩니다.
6. 그래도 처음 방문자는 대부분 링크 공유에서 옵니다. 커뮤니티, SNS에 링크를 올려 보세요(커뮤니티마다 홍보 규칙을 확인하세요).

## 저장 데이터
- 진행 상황은 접속한 브라우저의 localStorage에 자동 저장됩니다. 주소(도메인)가 바뀌거나 브라우저 데이터를 지우면 사라집니다.
- 화면 아래 `저장 / 백업`에서 저장 코드를 만들어 보관하면 다른 기기에서도 이어할 수 있습니다.

## 그림과 음악
- 시작 화면의 일러스트는 직접 그린 오리지널 그림입니다. 챔피언 데이터를 불러오면 Riot Data Dragon의 스플래시 아트가 뒤에서 천천히 바뀌며 깔립니다 (인터넷 필요).
- BGM은 Riot의 음악이 아닌 오리지널 곡이며 웹 오디오로 합성합니다. 브라우저 정책상 화면을 한 번 탭해야 소리가 나고, 오른쪽 위 버튼으로 끄거나 볼륨을 조절합니다.

## 공개 전에 확인하세요
- Riot Games의 `Legal Jibber Jabber` 정책을 따르는 팬 프로젝트입니다. 광고, 유료 요소 등 수익화를 하려면 Riot의 승인이 필요할 수 있습니다.
- 게임 속 선수와 팀 이름은 실제를 비튼 패러디입니다. 수익화나 스토어 등록을 하려면 원본에서 더 멀리 바꾸는 것이 안전합니다.
- 화면 아래 면책 문구는 지우지 마세요.
