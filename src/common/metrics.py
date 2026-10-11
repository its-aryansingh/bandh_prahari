"""CloudWatch metrics for Baandh Prahari.

Uses CloudWatch Embedded Metric Format (EMF) logged directly to stdout.
CloudWatch Logs extracts these into CloudWatch metrics under the
namespace 'BaandhPrahari' automatically without extra IAM permissions
or API call overhead.
"""

from __future__ import annotations

import json
import time
from typing import Any


def emit(
    metric_name: str,
    value: float,
    unit: str = "None",
    dimensions: dict[str, str] | None = None,
    namespace: str = "BaandhPrahari",
) -> dict[str, Any]:
    dims = dimensions or {}
    dim_keys = list(dims.keys())
    now_ms = int(time.time() * 1000)

    payload: dict[str, Any] = {
        "_aws": {
            "Timestamp": now_ms,
            "CloudWatchMetrics": [
                {
                    "Namespace": namespace,
                    "Dimensions": [dim_keys] if dim_keys else [],
                    "Metrics": [
                        {
                            "Name": metric_name,
                            "Unit": unit,
                        }
                    ],
                }
            ],
        },
        metric_name: float(value),
    }
    for k, v in dims.items():
        payload[k] = str(v)

    # Print to stdout for CloudWatch Logs EMF extraction
    print(json.dumps(payload))
    return payload
