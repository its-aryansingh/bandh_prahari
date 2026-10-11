"""Tests for CloudWatch EMF metrics emission in src/common/metrics.py."""

from __future__ import annotations

import json
from common import metrics


def test_emit_metrics_emf_structure(capsys):
    payload = metrics.emit(
        metric_name="MinutesToAnswer",
        value=4.5,
        unit="Seconds",
        dimensions={"Priority": "P1"},
    )
    assert payload["MinutesToAnswer"] == 4.5
    assert payload["Priority"] == "P1"
    assert "_aws" in payload
    cw = payload["_aws"]["CloudWatchMetrics"][0]
    assert cw["Namespace"] == "BaandhPrahari"
    assert cw["Dimensions"] == [["Priority"]]
    assert cw["Metrics"] == [{"Name": "MinutesToAnswer", "Unit": "Seconds"}]

    captured = capsys.readouterr()
    logged = json.loads(captured.out.strip().splitlines()[-1])
    assert logged["MinutesToAnswer"] == 4.5
    assert logged["Priority"] == "P1"


def test_emit_metrics_without_dimensions(capsys):
    payload = metrics.emit(
        metric_name="Climbs",
        value=1.0,
        unit="Count",
    )
    assert payload["Climbs"] == 1.0
    assert payload["_aws"]["CloudWatchMetrics"][0]["Dimensions"] == []
