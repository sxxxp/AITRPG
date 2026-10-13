# AI TRPG 프로젝트 안내

생성형 AI가 GM 서술을 맡고, 규칙 판정은 결정론적 엔진이 처리하는 멀티플레이 웹 TRPG.
명세는 [docs/기능명세서.md](docs/기능명세서.md)와 `docs/*_기능명세서.xlsx` (ID: F-*, BE-*, FE-*).

## 핵심 원칙
- **엔진이 판정하고 AI는 서술만 한다.** HP·아이템·플래그·장면 이동·엔딩은 엔진 코드만 바꾼다. AI는 행동 스키마 분류(JSON)와 Fact Sheet 기반 서술만 담당 (§2, §5.4).
- LLM은 로컬(Ollama 등) 또는 무료 API를 OpenAI 호환 인터페이스로 사용.
- 구현은 우선순위 P0부터. 요청받지 않은 P1/P2 기능은 만들지 않는다.

## 구조
- `frontend/` React + Vite + TS. `shared/`(공통) + `features/<영역>/`. 현재 공통·홈·계정(로그인/회원가입)·세션 P0 구현.
  - `npm run dev`는 기본 목 모드(`.env.development`의 `VITE_USE_MOCK=true`). 데모 계정 `demo@wtg.dev / demo1234`.
- `backend/` Express + Socket.IO + TS. `src/modules/<영역>/` (명세 영역과 1:1). 시나리오 검증(BE-SCN-10) 외 API는 501 스텁.
- `scenarios/` 시나리오 파일. 포맷은 기능명세서 §6, 스키마는 `backend/src/modules/scenario/scenario.schema.ts` (둘은 항상 함께 수정).

## 명령
- 백엔드: `npm run typecheck`, `npm test`, `npm run validate:scenario -- <yaml>`
- 프론트엔드: `npm run typecheck`, `npm run build`

## 진행 메모
- 배포는 Docker/K8S 예정. MVP는 DB / 백엔드 1개 / 로컬 LLM / 프론트엔드로 분리하고, 필요 시 백엔드를 세션 서버와 사이트 서버로 분리.
- 로컬 LLM 후보: 의도 해석은 Qwen3 소형(thinking 끔), 서술은 Gemma 3 12B 또는 한국어 특화 모델. 실제 Fact Sheet로 비교 후 결정.
