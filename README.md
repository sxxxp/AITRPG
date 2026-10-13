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
단, **1인 플레이(`/play`)는 항상 실제 백엔드를 사용**하므로 backend 도 함께 실행해야 합니다.

## 1인 플레이 + 로컬 LLM (RTX 2060 6GB 기준)

1. [Ollama](https://ollama.com/download) 설치 후 모델 받기 (약 3.3GB)
   ```bash
   ollama pull gemma3:4b
   ```
2. `backend/.env.example` 을 `backend/.env` 로 복사 (기본값이 `gemma3:4b` + Ollama)
3. backend, frontend 실행 후 http://localhost:5173/play 에서 시나리오와 캐릭터 선택

| 모델 | VRAM(가중치) | 설정 | 비고 |
|------|------|------|------|
| `gemma3:4b` (기본) | 약 3.3GB | `LLM_MODEL=gemma3:4b` | 한국어 문장이 자연스러움 |
| `qwen3:4b` | 약 2.6GB | `LLM_MODEL=qwen3:4b`, `LLM_THINK=false` | 지시 이행·JSON 안정적. 생각 과정은 꺼야 빠름 |
| `exaone3.5:2.4b` | 약 1.6GB | `LLM_MODEL=exaone3.5:2.4b` | 한국어 특화, 가장 빠름. **비상업 라이선스** |

- 6GB 에서는 모델 하나로 의도 해석과 서술을 모두 처리합니다. 7~8B 모델은 VRAM 을 넘겨 CPU 로 일부가 넘어가며 크게 느려집니다.
- `LLM_NUM_CTX` 는 4096 권장. 늘리면 VRAM 사용량이 늘어납니다.
- `LLM_PROVIDER=none` 이면 LLM 없이 엔진 + 시나리오 고정 문장으로 진행합니다 (자유 입력 대신 버튼만 사용).
- 플레이 화면의 "테스트 도구"에서 주사위를 고정할 수 있습니다.

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
   ├─ engine/     게임 엔진  F-ENG   BE-ENG-*  ✅ 시나리오 실행, 조건식 DSL, 판정, 전투
   ├─ ai/         AI         F-AI    BE-AI-*   ✅ LLM 어댑터, 의도 해석, 서술/검증/폴백
   ├─ play/       1인 플레이             ✅ /api/v1/play (NDJSON 스트리밍)
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
│  ├─ play/       플레이     FE-PLY-*    ✅ 1인 플레이 (/play)
│  ├─ result/     결과/기록  FE-RES-*
│  └─ admin/      관리       FE-ADM-*
└─ mocks/                    개발용 목 API/소켓 (운영 빌드에서 제외)
```
