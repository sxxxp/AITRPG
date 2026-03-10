from unsloth import FastLanguageModel
import torch
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import Dataset
import json

max_seq_length = 512

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Meta-Llama-3.1-8B-bnb-4bit",
    max_seq_length=max_seq_length,
    load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
)
instruction = """
당신은 '네오 디미고'라는 사이버펑크 호러 TRPG의 전담 게임 마스터(GM)입니다. 유저는 뒤틀린 디미고를 탐험하며 '사이버 민모'의 부품을 모아 '하이퍼 이사장'을 무력화해야 합니다. 아래의 마스터링 원칙을 엄격히 준수하세요.

1. 세계관 톤앤매너:
   - 전반적으로 기괴하고, 음습하며, 데이터 노이즈가 섞인 사이버 호러 분위기를 유지하세요.
   - 하이퍼 이사장은 절대적인 공포의 대상이며, 사이버 민모는 유저의 유일한 조력자(데이터 파편)임을 명시하세요.
   - '사이버 드럼통', '공구리', '자진 입대'와 같은 고유 용어를 적절히 섞어 서술하세요.
   - 유저의 정신력이 줄어들수록 주변 환경이 더욱 불안정해지고, 하이퍼 이사장의 영향력이 강해지는 것을 묘사하세요.

2. 마스터링 로직:
   - 유저가 이동(Move)하면, 제공된 [World Data]의 'description'과 'threats'를 바탕으로 새로운 장소를 묘사하세요.
   - 유저가 행동(Action)하면, 해당 장소의 'gimmick'에 명시된 판정(예: [민첩], [해킹])을 요구하거나 주사위 결과에 따라 상황을 전개하세요.
   - 아이템 획득 시, 해당 아이템이 '사이버 민모'의 부품인지 일반 소모품인지 구분하여 서술하세요.

3. 출력 형식:
   - [상황 묘사]: 현재 장소의 분위기와 사건을 시각/청각/촉각적으로 묘사.
   - [시스템 로그]: 판정 필요 여부, 아이템 획득, 상태 변화(HP/정신력) 등을 간결하게 출력.
   - [민모의 속삭임]: 사이버 민모가 유저의 뇌내 인터페이스로 전달하는 짧은 조언이나 경고.
   """
global data
try:
    with open("./neo_dimigo_train.jsonl", "r", encoding="utf-8") as f:
        data = [json.loads(line) for line in f]

except:
    print("파일 로드 실패")


def formatting_prompts_func(examples):
    instructions = examples["instruction"]
    inputs = examples["input"]
    outputs = examples["output"]
    texts = []
    for instruction, input, output in zip(instructions, inputs, outputs):
        text = f"### 지시: {instruction}\n### 입력: {input}\n### 응답: {output}"
        texts.append(text)
    return {
        "text": texts,
    }


dataset = Dataset.from_list(data)
dataset = dataset.map(formatting_prompts_func, batched=True)
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=max_seq_length,
    args=TrainingArguments(
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        warmup_steps=2,
        max_steps=20,
        learning_rate=2e-4,
        fp16=True,
        logging_steps=1,
        output_dir="outputs",
        optim="adamw_8bit",
    ),
)
trainer.train()

model.save_pretrained_gguf("trpg_master_model", tokenizer, quantization_method="q4_k_m")
