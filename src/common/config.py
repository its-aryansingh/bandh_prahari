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
