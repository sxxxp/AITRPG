import json
import random

# 1. 다양한 장르와 시나리오 기초 데이터
scenarios = [
    {
        "genre": "Cyberpunk Horror",
        "tone": "Glitchy and Oppressive",
        "stats": ["Agility", "Intel", "Sanity"],
        "locations": [
            {
                "name": "폐쇄된 서버룸",
                "desc": "지직거리는 모니터와 타버린 전선들",
                "interact": "중앙 단말기",
            },
            {
                "name": "오염된 매점",
                "desc": "유통기한 지난 합성 단백질 팩들이 쌓인 곳",
                "interact": "자판기",
            },
        ],
    },
    {
        "genre": "High Fantasy",
        "tone": "Epic and Magical",
        "stats": ["Strength", "Magic", "Charisma"],
        "locations": [
            {
                "name": "드래곤의 둥지",
                "desc": "금화가 산처럼 쌓여 있고 열기가 가득함",
                "interact": "보물 상자",
            },
            {
                "name": "엘프의 숲",
                "desc": "푸른 빛이 감도는 고대 나무들의 쉼터",
                "interact": "성스러운 샘물",
            },
        ],
    },
    {
        "genre": "Space Opera",
        "tone": "Cold and Vast",
        "stats": ["Piloting", "Tech", "Willpower"],
        "locations": [
            {
                "name": "버려진 우주선함교",
                "desc": "깨진 창밖으로 소리 없는 우주가 보임",
                "interact": "비상 레버",
            },
            {
                "name": "외계 행성 기지",
                "desc": "붉은 모래바람이 기지 외벽을 때리는 소리",
                "interact": "통신 안테나",
            },
        ],
    },
]

# 2. 유저의 일반적인 행동 패턴
user_actions = [
    {
        "act": "조심스럽게 접근해서 {target}을 조사할래.",
        "stat_idx": 1,
    },  # 주로 Intel/Magic/Tech
    {
        "act": "{target}을 발로 차거나 힘으로 부술 거야!",
        "stat_idx": 0,
    },  # 주로 Agility/Strength/Piloting
    {
        "act": "주변에 누가 있는지 소리쳐서 부를래.",
        "stat_idx": 2,
    },  # 주로 Sanity/Charisma/Willpower
]


def generate_universal_jsonl(output_file="./universal_trpg_train.jsonl", count=100):
    dataset = []

    for _ in range(count):
        # 랜덤 시나리오 및 장소 선택
        scn = random.choice(scenarios)
        loc = random.choice(scn["locations"])
        action_tpl = random.choice(user_actions)

        user_input = action_tpl["act"].format(target=loc["interact"])
        target_stat = scn["stats"][action_tpl["stat_idx"]]

        # 1. 판정 요청 데이터 (ROLL_REQUEST)
        # AI가 결과를 바로 내지 않고 주사위를 요구하는 법을 배워야 함
        input_text = f"### [Scenario]\nGenre: {scn['genre']}\nTone: {scn['tone']}\nStats: {scn['stats']}\nCurrent: {loc['name']} ({loc['desc']})\n\n### [User Action]\n\"{user_input}\""

        output_data = {
            "narrative": {
                "description": f"{scn['genre']}의 분위기가 감도는 가운데, 당신은 {loc['name']}에서 {user_input} 시도합니다.",
                "log": f"{target_stat} 판정이 필요합니다.",
                "npc_talk": "",
            },
            "action_required": {
                "type": "ROLL_REQUEST",
                "stat": target_stat,
                "difficulty": random.randint(7, 10),
                "dice_type": "2d6",
            },
        }

        entry = {
            "instruction": "제공된 시나리오 데이터에 근거하여 TRPG 마스터링을 진행하고 JSON으로 응답하라.",
            "input": input_text,
            "output": json.dumps(output_data, ensure_ascii=False),
        }
        dataset.append(entry)

    # JSONL 저장
    with open(output_file, "w", encoding="utf-8") as f:
        for item in dataset:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"✅ {count}개의 범용 학습 데이터가 '{output_file}'에 저장되었습니다.")


if __name__ == "__main__":
    generate_universal_jsonl(count=400)
