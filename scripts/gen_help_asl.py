"""Writes statemachine/help.asl.json: the help run (docs/SPEC.md, "The help run").

Run: python scripts/gen_help_asl.py. Same answer clock as the incident run: waits use
lambda:invoke.waitForTaskToken with TimeoutSecondsPath, so demo and real clocks share it.
"""

import json
from pathlib import Path

RETRY = [
    {
        "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2,
    }
]


def step(name, nxt, result_path=None, extra=None, catch_to=None):
    s = {
        "Type": "Task",
        "Resource": "${HelpFunctionArn}",
        "Parameters": {"step": name, "help.$": "$.help", **(extra or {})},
        "ResultPath": result_path,
        "Retry": RETRY,
        "Next": nxt,
    }
    if catch_to:
        s["Catch"] = [{"ErrorEquals": ["States.ALL"], "ResultPath": "$.error", "Next": catch_to}]
    return s


def wait(name, clock, nxt, result_path, on_fail, extra=None):
    return {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
        "Parameters": {
            "FunctionName": "${HelpFunctionArn}",
            "Payload": {"step": name, "taskToken.$": "$$.Task.Token", "help.$": "$.help", "timeout.$": f"$.clocks.{clock}", **(extra or {})},
        },
        "TimeoutSecondsPath": f"$.clocks.{clock}",
        "ResultPath": result_path,
        "Retry": RETRY,
        "Catch": [{"ErrorEquals": ["States.ALL"], "ResultPath": "$.previous", "Next": on_fail}],
        "Next": nxt,
    }


def count(key, nxt):
    other = {"asks": "next", "next": "asks"}[key]
    return {
        "Type": "Pass",
        "Parameters": {f"{key}.$": f"States.MathAdd($.counts.{key}, 1)", f"{other}.$": f"$.counts.{other}"},
        "ResultPath": "$.counts",
        "Next": nxt,
    }


def below(key, yes, no):
    return {"Type": "Choice", "Choices": [{"Variable": f"$.counts.{key}", "NumericLessThanPath": f"$.limits.{key}", "Next": yes}], "Default": no}


def end(outcome, nxt):
    return {"Type": "Pass", "Result": {"outcome": outcome}, "ResultPath": "$.end", "Next": nxt}


S = {}
S["OpenHelpRequest"] = step("open", "AskNearestTeam", "$.opened", catch_to="AskNearestTeam")
S["AskNearestTeam"] = wait("ask", "ask", "AwaitTeamOnSite", "$.claim", "AlertDistrictControlRoom")
S["AlertDistrictControlRoom"] = step("district", "CountAsks", None, {"previous.$": "$.previous"}, catch_to="CountAsks")
S["CountAsks"] = count("asks", "AskAgain")
S["AskAgain"] = below("asks", "AskNearestTeam", "MarkWithDistrict")
S["AwaitTeamOnSite"] = wait("onsite", "onsite", "RescuedAlready", "$.arrival", "AskNextTeam", {"claim.$": "$.claim"})
S["AskNextTeam"] = step("next", "CountNext", None, catch_to="CountNext")
S["CountNext"] = count("next", "NextAgain")
S["NextAgain"] = below("next", "AwaitTeamOnSite", "MarkWithDistrict")
S["RescuedAlready"] = {
    "Type": "Choice",
    "Choices": [{"Variable": "$.arrival.action", "StringEquals": "rescued", "Next": "MarkRescued"}],
    "Default": "AwaitFamilySafe",
}
S["AwaitFamilySafe"] = wait("safe", "safe", "MarkRescued", "$.safe", "MarkWithDistrict", {"arrival.$": "$.arrival"})
S["MarkRescued"] = end("rescued", "CloseHelpRequest")
S["MarkWithDistrict"] = end("district", "CloseHelpRequest")
S["CloseHelpRequest"] = step("close", "Done", "$.closed", {"outcome.$": "$.end.outcome"})
S["Done"] = {"Type": "Succeed"}

# AwaitTeamOnSite is first reached with a claim; after AskNextTeam the same claim is still in $.claim.
asl = {
    "Comment": "The help run: the nearest free team is asked; a claim starts a 20-minute clock; a late team brings in the next. docs/SPEC.md, 'The help run'.",
    "StartAt": "OpenHelpRequest",
    "States": S,
}
out = Path(__file__).resolve().parent.parent / "statemachine" / "help.asl.json"
out.write_text(json.dumps(asl, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {out} ({len(S)} states)")
