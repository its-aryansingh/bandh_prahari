"""Writes statemachine/incident.asl.json: the Jawab Ghadi run (docs/SPEC.md, "The incident run").

Run: python scripts/gen_incident_asl.py. The JSON is committed; this script keeps the five page
levels identical in shape. State names are written for the camera.
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


RETRY_OWN = [{"ErrorEquals": ["States.TaskFailed"], "IntervalSeconds": 3, "MaxAttempts": 3, "BackoffRate": 2}]


def task(fn, params, nxt, result_path, catch_to=None):
    s = {"Type": "Task", "Resource": "${%s}" % fn, "Parameters": params, "ResultPath": result_path, "Retry": RETRY, "Next": nxt}
    if catch_to:
        s["Catch"] = [{"ErrorEquals": ["States.ALL"], "ResultPath": "$.error", "Next": catch_to}]
    return s


def wait(kind, timeout_path, extra, nxt, result_path, on_timeout):
    return {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
        "Parameters": {
            "FunctionName": "${PageFunctionArn}",
            "Payload": {"kind": kind, "taskToken.$": "$$.Task.Token", "incident.$": "$.incident", "timeout.$": timeout_path, **extra},
        },
        "TimeoutSecondsPath": timeout_path,
        "ResultPath": result_path,
        "Retry": RETRY,
        # A timeout, "Declined" (not my stretch), "Undelivered" (no delivery receipt) or a failed
        # send all mean the same thing to the clock: ask the next person.
        "Catch": [{"ErrorEquals": ["States.ALL"], "ResultPath": "$.previous", "Next": on_timeout}],
        "Next": nxt,
    }


COUNTERS = ("central", "onsite", "missed", "rounds")


def count(nxt, add=(), reset=()):
    """A Pass state that adds one to the named counters and sets the reset ones to 0."""
    params = {}
    for k in COUNTERS:
        if k in add:
            params[k + ".$"] = "States.MathAdd($.counts.%s, 1)" % k
        elif k in reset:
            params[k] = 0
        else:
            params[k + ".$"] = "$.counts." + k
    return {"Type": "Pass", "Parameters": params, "ResultPath": "$.counts", "Next": nxt}


def below(counter, yes, no):
    return {
        "Type": "Choice",
        "Choices": [{"Variable": "$.counts." + counter, "NumericLessThanPath": "$.limits." + counter, "Next": yes}],
        "Default": no,
    }


def end(reason, outcome, nxt):
    return {"Type": "Pass", "Result": {"reason": reason, "outcome": outcome}, "ResultPath": "$.end", "Next": nxt}


S = {}
# Opening and closing are safe to repeat, so they also retry their own errors. If opening still
# fails, the page goes out anyway: the clock matters more than the record.
S["OpenIncident"] = task("OpenFunctionArn", {"incident.$": "$.incident", "execution.$": "$$.Execution.Id"}, "IsItP1", "$.incident", catch_to="IsItP1")
S["OpenIncident"]["Retry"] = RETRY + RETRY_OWN
S["IsItP1"] = {
    "Type": "Choice",
    "Choices": [{"Variable": "$.incident.priority", "StringEquals": "P1", "Next": "WarnVillagesGetReady"}],
    "Default": "PageJuniorEngineer",
}
# "Get ready" goes out at once for a P1, without waiting for any official; a failure here never stops the page.
S["WarnVillagesGetReady"] = task("WarnFunctionArn", {"incident.$": "$.incident", "level": "taiyaar"}, "PageJuniorEngineer", "$.warned", catch_to="PageJuniorEngineer")

ladder = [
    ("PageJuniorEngineer", 1, "$.clocks.page", "PageAssistantEngineer"),
    ("PageAssistantEngineer", 2, "$.clocks.page", "WarnedAlready"),
    ("PageExecutiveEngineer", 3, "$.clocks.page", "PageForceAndDistrict"),
    ("PageForceAndDistrict", 4, "$.clocks.page", "AlertCentralFloodControlRoom"),
    ("AlertCentralFloodControlRoom", 5, "$.clocks.central", "CountCentralPages"),
]
for name, level, clock_path, on_timeout in ladder:
    S[name] = wait("page", clock_path, {"level": level, "previous.$": "$.previous"}, "DispatchRepairTeam", "$.answer", on_timeout)
# A page that reaches the executive engineer also warns the villages, unless "get ready" already
# went out ($.warned is set only when WarnVillagesGetReady succeeded).
S["WarnedAlready"] = {
    "Type": "Choice",
    "Choices": [
        {
            "And": [{"Variable": "$.warned", "IsPresent": True}, {"Variable": "$.warned.level", "StringEquals": "taiyaar"}],
            "Next": "PageExecutiveEngineer",
        }
    ],
    "Default": "WarnVillagesOnClimb",
}
S["WarnVillagesOnClimb"] = task("WarnFunctionArn", {"incident.$": "$.incident", "level": "taiyaar"}, "PageExecutiveEngineer", None, catch_to="PageExecutiveEngineer")
# The central room is paged again every interval until someone answers, up to the run's limit.
S["CountCentralPages"] = count("PageCentralAgain", add=("central",))
S["PageCentralAgain"] = below("central", "AlertCentralFloodControlRoom", "MarkUnanswered")
S["MarkUnanswered"] = end("unanswered", "unanswered", "HandToDistrict")

S["DispatchRepairTeam"] = task("DispatchFunctionArn", {"incident.$": "$.incident", "answer.$": "$.answer"}, "AwaitEngineerOnSite", "$.dispatch", catch_to="AwaitEngineerOnSite")
S["AwaitEngineerOnSite"] = wait("onsite", "$.clocks.onsite", {"answer.$": "$.answer"}, "HoldTheStretch", "$.onsite", "TellNotOnSite")
S["TellNotOnSite"] = task("NotifyFunctionArn", {"incident.$": "$.incident", "what": "not_on_site", "answer.$": "$.answer"}, "CountOnSiteMisses", None, catch_to="CountOnSiteMisses")
S["CountOnSiteMisses"] = count("WaitOnSiteAgain", add=("onsite",))
S["WaitOnSiteAgain"] = below("onsite", "AwaitEngineerOnSite", "MarkNobodyOnSite")
S["MarkNobodyOnSite"] = end("unanswered", "district", "HandToDistrict")

# Asks for a check-in every interval until Secured or Breached. A "holding" tap starts the next
# round; missed check-ins in a row, or a hold longer than the run's limit, go to the district.
S["HoldTheStretch"] = wait("hold", "$.clocks.hold", {"answer.$": "$.answer"}, "SecuredOrBreached", "$.hold", "TellMissedCheckIn")
S["SecuredOrBreached"] = {
    "Type": "Choice",
    "Choices": [
        {"Variable": "$.hold.action", "StringEquals": "secured", "Next": "AllClear"},
        {"Variable": "$.hold.action", "StringEquals": "breached", "Next": "WarnVillagesMoveNow"},
    ],
    "Default": "CountHoldRounds",
}
S["CountHoldRounds"] = count("HoldAgain", add=("rounds",), reset=("missed",))
S["HoldAgain"] = below("rounds", "HoldTheStretch", "MarkLongHold")
S["MarkLongHold"] = end("long_hold", "district", "HandToDistrict")
S["TellMissedCheckIn"] = task("NotifyFunctionArn", {"incident.$": "$.incident", "what": "missed_checkin", "answer.$": "$.answer"}, "CountMissedCheckIns", None, catch_to="CountMissedCheckIns")
S["CountMissedCheckIns"] = count("MissedTooMany", add=("missed", "rounds"))
S["MissedTooMany"] = below("missed", "HoldAgain", "MarkNoCheckIn")
S["MarkNoCheckIn"] = end("no_checkin", "district", "HandToDistrict")

S["WarnVillagesMoveNow"] = task("WarnFunctionArn", {"incident.$": "$.incident", "level": "nikal_chalo"}, "MarkBreached", "$.warned", catch_to="MarkBreached")
S["MarkBreached"] = end("breached", "breached", "HandToDistrict")
S["AllClear"] = task("WarnFunctionArn", {"incident.$": "$.incident", "level": "khatra_tala"}, "MarkSecured", "$.warned", catch_to="MarkSecured")
S["MarkSecured"] = end("secured", "secured", "WriteIncidentReport")
S["HandToDistrict"] = task("HandoffFunctionArn", {"incident.$": "$.incident", "reason.$": "$.end.reason"}, "WriteIncidentReport", "$.handoff", catch_to="WriteIncidentReport")
S["WriteIncidentReport"] = task("CloseFunctionArn", {"incident.$": "$.incident", "outcome.$": "$.end.outcome"}, "Done", "$.report")
S["WriteIncidentReport"]["Retry"] = RETRY + RETRY_OWN
S["Done"] = {"Type": "Succeed"}

# Task results that are not needed downstream are dropped, to keep the execution's state small.
for name in ("TellNotOnSite", "TellMissedCheckIn", "WarnVillagesOnClimb"):
    S[name]["ResultPath"] = None

asl = {
    "Comment": "Jawab Ghadi, the answer clock: every warning sign gets an owner, a deadline and a next person. docs/SPEC.md, 'The incident run'.",
    "StartAt": "OpenIncident",
    "States": S,
}
out = Path(__file__).resolve().parent.parent / "statemachine" / "incident.asl.json"
out.write_text(json.dumps(asl, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {out} ({len(S)} states)")
