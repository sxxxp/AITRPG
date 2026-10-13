# AI (F-AI) — 내부 모듈

외부 엔드포인트 없음. 예정 구성 (BE-AI-*):

| 파일 | ID | 역할 |
|------|----|------|
| provider.ts | BE-AI-01 | OpenAI 호환 LLM 어댑터 (Ollama / llama.cpp / vLLM / 무료 API) |
| intent.ts | BE-AI-02 | 자유 입력 → 행동 스키마 JSON |
| narrator.ts | BE-AI-03 | Fact Sheet 기반 서술 / NPC 대화 |
| validator.ts | BE-AI-05 | 출력 검증 (미존재 아이템, 판정 모순, 비밀 누설 등) |
| context.ts | BE-AI-06 | 최근 N턴 + 요약 + 현재 장면 컨텍스트 조립 |
| queue.ts | BE-AI-08 | BullMQ 호출 큐 |
| fallback.ts | BE-AI-09 | 실패 시 고정 텍스트 |
