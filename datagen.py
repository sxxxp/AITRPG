import json
import random

global data
data = {}
try:
    with open("./world_data.json", "r", encoding="utf-8") as f:
        data = json.load(f)
except:
    print("파일 로드 실패")
nicknames = ["준현", "영민", "세민", "자명", "유민", "태인"]


templates = {
    "success": [
        "행운이 당신을 미소 짓게 합니다. {description} 속에서 당신은 보란 듯이 성공해냅니다.",
        "데이터 노이즈를 뚫고 정확한 타이밍에 행동했습니다. {name}의 공기가 미세하게 바뀝니다.",
    ],
    "fail": [
        "무언가 잘못되었습니다. {name}의 어둠이 당신의 발목을 잡습니다.",
        "치명적인 실수입니다. 하이퍼 이사장의 비웃음 소리가 귓가를 때립니다.",
    ],
}


def generate_jsonl(count=50):
    dataset = []
    locations = list(data["locations"].keys())

    for _ in range(count):
        loc_key = random.choice(locations)
        loc = data["locations"][loc_key]

        # 주사위 결과 및 성공 여부 결정
        roll = random.randint(2, 12)
        is_success = roll >= 7
        nickname = random.choice(nicknames)
        # 템플릿 선택 및 문장 생성
        base_desc = random.choice(
            templates["success"] if is_success else templates["fail"]
        )
        narrative = base_desc.format(name=loc["name"], description=loc["description"])

        # JSONL 구조 생성
        entry = {
            "instruction": "너는 호러 TRPG '네오 디미고'의 마스터다. 유저 상태와 World Data를 분석해 상황을 서술하고 JSON 포맷으로 응답하라.",
            "input": f"### [현재 상태]\n- 위치: {loc['name']}\n- 이름: {nickname}\n- HP: 10, 정신력: 10\n\n### [World Data]\n- 장소: {loc['name']}\n- 기믹: {loc['gimmick']}\n\n### [유저 입력]\n\"주변을 조사하거나 기믹을 시도한다.\"\n\n### [판정 결과]\n- 주사위: {roll}",
            "output": json.dumps(
                {
                    "narrative": {
                        "situation_description": narrative,
                        "system_log": f"판정 {'성공' if is_success else '실패'}! 현재 위치: {loc['name']}",
                        "minmo_whisper": "{nickname}, 데이터 동기화 완료. 조심해서 움직여.",
                    },
                    "game_state_update": {
                        "current_location": loc_key,
                        "status_changes": {"hp_delta": 0 if is_success else -1},
                    },
                },
                ensure_ascii=False,
            ),
        }
        dataset.append(entry)

    # JSONL 파일로 저장
    with open("neo_dimigo_train.jsonl", "w", encoding="utf-8") as f:
        for item in dataset:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"✅ {count}개의 학습 데이터가 생성되었습니다!")


if __name__ == "__main__":
    generate_jsonl(500)
