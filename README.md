# AI TRPG

명세: [docs/기능명세서.md](docs/기능명세서.md), [backend](docs/backend_기능명세서.xlsx) / [frontend](docs/frontend_기능명세서.xlsx) 엑셀

## 실행

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173 (기본: 목 모드)
cd backend  && npm install && npm run dev   # http://localhost:4000 (시나리오 검증 외 API는 501 스텁)
cd backend  && npm test                     # 테스트
cd backend  && npm run validate:scenario -- ../scenarios/neo-dimigo/scenario.yaml   # 시나리오 검증
```

시나리오 파일 포맷은 [기능명세서 §6](docs/기능명세서.md), 예제는 [scenarios/](scenarios/)에 있습니다.

목 모드(`frontend/.env.development`의 `VITE_USE_MOCK=true`)에서는 백엔드 없이 브라우저 안의 목 API·소켓으로 동작합니다.
데모 계정 `demo@wtg.dev / demo1234`, 목 데이터 초기화는 브라우저 콘솔에서 `__wtgMockReset()`.

## 폴더 구조 (기능명세서 영역 기준)

```
backend/src/
├─ app.ts, server.ts         Express + Socket.IO 부트스트랩
├─ config/                   환경 변수
├─ common/                   공통 (오류 처리, 501 스텁)
├─ socket/                   실시간 이벤트 (/game 네임스페이스)
└─ modules/
   ├─ auth/       계정       F-AUTH  BE-AUTH-*
   ├─ scenario/   시나리오   F-SCN   BE-SCN-*
   ├─ review/     평가/통계  F-RVW   BE-RVW-*
   ├─ engine/     게임 엔진  F-ENG   BE-ENG-*
   ├─ ai/         AI         F-AI    BE-AI-*   (내부 모듈)
   ├─ character/  캐릭터     F-CHR   BE-CHR-*
   ├─ session/    세션       F-SES   BE-SES-*
   ├─ log/        기록       F-LOG   BE-LOG-*
   └─ admin/      관리       F-ADM   BE-ADM-*

frontend/src/
├─ app/                      라우터, Provider
├─ shared/        공통       FE-COM-*  API 클라이언트, 인증 가드, 소켓, 공통 UI, 도메인 타입
├─ features/
│  ├─ home/       홈         FE-HOME-*   ✅ 구현
│  ├─ auth/       계정       FE-AUTH-*   ✅ P0 구현 (로그인, 회원가입)
│  ├─ session/    세션       FE-SES-*    ✅ 구현
│  ├─ scenario/   시나리오 탐색  FE-SCN-*
│  ├─ editor/     시나리오 제작  FE-EDT-*
│  ├─ play/       플레이     FE-PLY-*
│  ├─ result/     결과/기록  FE-RES-*
│  └─ admin/      관리       FE-ADM-*
└─ mocks/                    개발용 목 API/소켓 (운영 빌드에서 제외)
```
