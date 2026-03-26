import requests
import json
import os
from datetime import datetime

PRICE_PER_1K_TOKENS = 0.002


def save_history(user_input, ai_response):
    with open("history_log.json", "a") as f:
        f.write(json.dumps({"user": user_input, "ai": ai_response}) + "\n")


def save_log(data):
    log = {
        "time": str(datetime.now()),
        "tokens": data["total_tokens"],
        "cost": calculate_cost(data["total_tokens"]),
    }

    with open("usage_log.json", "a") as f:
        f.write(json.dumps(log) + "\n")


def log_usage(response):
    usage = response.usage

    data = {
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
        "total_tokens": usage.total_tokens,
    }

    return data


def calculate_cost(tokens):
    return (tokens / 1000) * PRICE_PER_1K_TOKENS


def get_total_usage():
    total_tokens = 0
    total_cost = 0

    with open("usage_log.json", "r") as f:
        for line in f:
            log = json.loads(line)
            total_tokens += log["tokens"]
            total_cost += log["cost"]

    return total_tokens, total_cost


LIMIT = 3.0


WEBHOOK_URL = "https://discord.com/api/webhooks/" + os.environ["DISCORD_WEBHOOK_ID"]


def send_alert(message):
    requests.post(WEBHOOK_URL, json={"content": message})


def check_limit():
    _, total_cost = get_total_usage()

    if total_cost > LIMIT * 0.8:
        send_alert(f"⚠️ 사용량 80% 초과: ${total_cost:.2f}")

    if total_cost > LIMIT:
        send_alert(f"🚨 한도 초과: ${total_cost:.2f}")
