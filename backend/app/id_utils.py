import re
import time
import random
import string

_counter = 0


def uid(prefix: str) -> str:
    global _counter
    _counter += 1
    random_part = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
    suffix = f"{int(time.time() * 1000):x}{_counter:x}{random_part}"
    return f"{prefix}-{suffix}"


def next_sequential_id(prefix: str, existing: list[str], start: int = 1001) -> str:
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    max_num = start - 1
    for item_id in existing:
        match = pattern.match(item_id)
        if match:
            value = int(match.group(1))
            if value > max_num:
                max_num = value
    return f"{prefix}-{max_num + 1}"
