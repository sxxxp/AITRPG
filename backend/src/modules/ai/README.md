# AI (F-AI) — 내부 모듈

| 파일 | ID | 역할 |
|------|----|------|
| provider.ts | BE-AI-01 | LLM 어댑터. `ollama`(네이티브 API, 기본) / `openai`(OpenAI 호환) / `none` |
| intent.ts | BE-AI-02 | 자유 입력 → 엔진이 제시한 후보 행동 ID (JSON Schema `enum`으로 후보 밖 값 차단) |
| narrator.ts | BE-AI-03/05/09 | Fact Sheet 기반 서술 스트리밍, 출력 검증(비밀 누설·판정 모순·수치) 후 1회 재생성, 실패 시 폴백 |

예정: context.ts(요약), queue.ts(BullMQ 호출 큐), retriever.ts(RAG)

설정은 `backend/.env.example`의 `LLM_*` 참고. 6GB VRAM 에서는 모델 하나로 의도 해석과 서술을 모두 처리한다 (두 모델을 번갈아 올리면 매 턴 모델 교체로 느려짐).
