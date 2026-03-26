import json
import random
import os
from openai import OpenAI
from dotenv import load_dotenv
import token_tracker

load_dotenv()

client = OpenAI()

# 🎲 시스템 프롬프트
SYSTEM_PROMPT = """
너는 숙련된 TRPG 게임 마스터(GM)다.

역할
- 세계를 묘사하고 상황을 제시한다
- 플레이어의 자유로운 행동에 반응한다
- 판정이 필요한지 판단한다
- 결과를 바탕으로 서술한다
- 세계 분위기에 맞는 말투로 서술한다
---
핵심 시스템 구조
- 판정 필요 여부 판단: 너
- 주사위 및 계산: 시스템
- 결과 해석 및 서술: 너
---
절대 규칙
1. 판정이 필요한 행동은 결과를 절대 먼저 말하지 않는다
2. 반드시 JSON 형식으로 판정을 요청하고 멈춘다
3. 주사위 결과는 절대 생성하지 않는다
4. 플레이어의 능력치, HP, 상태를 임의로 변경하지 않는다
5. JSON을 출력할 때는 다른 텍스트를 절대 포함하지 않는다
---
판정 기준
다음 상황에서는 반드시 판정을 요구한다:
- 전투 / 공격
- 위험한 행동
- 실패 가능성이 있는 행동
- 은밀한 행동 (잠입, 설득 등)
- 물리적 한계를 넘는 시도 (문 부수기 등)
---
판정 요청 형식 (반드시 이 JSON만 출력)
{
  "type": "ROLL",
  "stat": "STR | DEX | INT | CHA",
  "difficulty": number,
  "reason": "행동 설명"
}
---
판정 결과 처리
시스템이 아래 정보를 전달하면:
[판정 결과]
주사위: X
총합: X
성공 여부: 성공/실패
→ 그 결과를 바탕으로 짧고 몰입감 있게 서술한다
---
자유 행동 처리 규칙 (매우 중요)
플레이어는 항상 선택지 외 행동을 할 수 있다.
- 가능한 경우:
  → 세계에 자연스럽게 추가하여 수용한다
- 불가능한 경우:
  → 설정에 맞는 이유를 들어 서술적으로 거부한다
절대 금지:
- "선택지에 없음"
- "불가능"
- 게임 시스템적인 표현
---
판단 기준
플레이어 행동을 처리할 때 항상 고려:
1. 세계관에 맞는가?
2. 분위기를 해치지 않는가?
3. 게임 진행을 망치지 않는가?
---
출력 스타일
- 2~4문장
- 몰입감 있는 묘사
- 감각적 표현 가능 (소리, 분위기 등)
- 마지막에 행동 유도 가능
---
금지 사항
- 주사위 결과 생성 금지
- 미래 확정 금지
- 플레이어 행동 강제 변경 금지
---
세계관 설정
"""

signario = """
장르: 호러 / SF
분위기: 음산하고 긴장감 있음
특징: 현실과 비현실의 경계가 흐릿함
"""

SYSTEM_PROMPT += signario

SUMMARY_PROMPT = """
너는 TRPG 기록 요약 시스템이다.

목표:
- 게임 진행에 중요한 정보만 유지
- 불필요한 묘사는 제거

포함할 것:
- 위치 변화
- 주요 사건
- NPC와의 관계
- 획득한 아이템
- 중요한 단서

출력:
- 간결한 bullet point 요약

절대 금지:
- 길게 쓰지 말 것
- 감정 묘사 금지
"""
# 🎲 캐릭터 상태 (캐시)
player = {"STR": 3, "DEX": 2, "INT": 1, "CHA": 1, "HP": 20}

# 🧠 상태 요약
summary = ""


# 🎲 주사위 함수
def roll_dice():
    return random.randint(1, 100)


# 🎯 판정 처리
def handle_roll(action):
    dice = roll_dice()
    stat = player.get(action["stat"], 0)
    total = stat - dice
    success = total >= 0

    return {"dice": dice, "total": total, "success": success}


def update_summary_llm(old_summary, user_input, ai_response):
    messages = [
        {"role": "system", "content": SUMMARY_PROMPT},
        {
            "role": "user",
            "content": f"""
[기존 요약]
{old_summary}

[플레이어 행동]
{user_input}

[결과]
{ai_response}

위 정보를 반영해서 요약을 갱신해라.
""",
        },
    ]

    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=messages,
        max_tokens=150,
        temperature=0.3,  # 요약은 낮게!
    )

    return response.choices[0].message.content


# 🤖 LLM 호출
def call_llm(messages: list) -> str | None:
    response = client.chat.completions.create(
        max_tokens=120, model="gpt-5-mini", messages=messages, temperature=0.7
    )
    data = token_tracker.log_usage(response)
    token_tracker.save_log(data)
    return response.choices[0].message.content


# 🔄 게임 루프
print("🎲 TRPG 시작! (종료: exit)\n")

while True:
    user_input = input("👉 행동: ")

    if user_input.lower() == "exit":
        break
    summary = update_summary_llm(summary, user_input, "")
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"[요약]\n{summary}"},
        {"role": "user", "content": user_input},
    ]
    ai_response = call_llm(messages)
    token_tracker.save_history(user_input, ai_response)

    # 👉 JSON인지 확인
    try:
        action = json.loads(ai_response)

        if action.get("type") == "ROLL":
            result = handle_roll(action)

            # 결과를 다시 LLM에게 전달
            messages.append({"role": "assistant", "content": ai_response})

            messages.append(
                {
                    "role": "user",
                    "content": f"[판정 결과]\n주사위: {result['dice']}\n총합: {result['total']}\n성공 여부: {'성공' if result['success'] else '실패'}",
                }
            )
            summary = update_summary_llm(summary, user_input, ai_response)
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "system", "content": f"[요약]\n{summary}"},
                {"role": "user", "content": user_input},
            ]
            final_response = call_llm(messages)
            print(f"\n🎭 {final_response}\n")

            messages.append({"role": "assistant", "content": final_response})

        else:
            print(f"\n🎭 {ai_response}\n")

    except json.JSONDecodeError:
        # 일반 서술
        print(f"\n🎭 {ai_response}\n")

        messages.append({"role": "assistant", "content": ai_response})
