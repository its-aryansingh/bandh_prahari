"""Settings from the environment. Nothing secret lives here: names of resources only."""

from __future__ import annotations

import os


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


TABLE_NAME = env("TABLE_NAME", "bp")
BUCKET_NAME = env("BUCKET_NAME", "")
STATE_MACHINE_ARN = env("STATE_MACHINE_ARN", "")
# "screen" draws messages on the public page's demo phones; "whatsapp" or "telegram" send them.
CHANNEL = env("CHANNEL", "screen")
# One switch stops every outbound message to a real phone ("off" = only the screen channel works).
OUTBOUND = env("OUTBOUND", "on")
REGION = env("AWS_REGION", "ap-south-1")

# Demo (judge path) clocks, in seconds, and how many demo runs a day.
DEMO_PAGE_S = int(env("DEMO_PAGE_S", "60"))
DEMO_DAILY_CAP = int(env("DEMO_DAILY_CAP", "300"))

# WhatsApp (AWS End User Messaging Social): the phone-number-id to send from, and Meta's API version.
WA_ORIGINATION_ID = env("WA_ORIGINATION_ID", "")
META_API_VERSION = env("META_API_VERSION", "v20.0")
# Telegram, the fallback channel: the bot token lives in SSM under this name.
TELEGRAM_TOKEN_PARAM = env("TELEGRAM_TOKEN_PARAM", "/bp/telegram/token")
WORKER_FUNCTION = env("WORKER_FUNCTION", "")
DELIVERY_FUNCTION_ARN = env("DELIVERY_FUNCTION_ARN", "")
SCHEDULER_ROLE_ARN = env("SCHEDULER_ROLE_ARN", "")
DELIVERY_CHECK_S = int(env("DELIVERY_CHECK_S", "120"))

# The help run: its state machine, and real or demo clocks (demo: 1 / 2 / 10 minutes).
HELP_MACHINE_ARN = env("HELP_MACHINE_ARN", "")
HELP_CLOCKS = env("HELP_CLOCKS", "demo")
