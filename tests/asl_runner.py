"""A small interpreter for statemachine/incident.asl.json, for tests only.

It runs the real definition against the real step handlers (on fake AWS), covering the
parts of the Amazon States Language the run uses: Task (plain Lambda and
lambda:invoke.waitForTaskToken), Pass, Choice, Succeed, Parameters with ".$" paths and
States.MathAdd, ResultPath, Catch. A wait ends the way a test's responder decides: a tap
(the real answer code calling SendTaskSuccess/SendTaskFailure on a fake client) or, if
nobody taps, States.Timeout.

It is not Step Functions. It cannot prove how AWS resolves TimeoutSecondsPath or orders
history events; a real run on demo clocks (docs/DEPLOY.md, smoke test) does that.
"""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path

from botocore.exceptions import ClientError

ASL = json.loads((Path(__file__).resolve().parent.parent / "statemachine" / "incident.asl.json").read_text(encoding="utf-8"))
WAIT_RESOURCE = "arn:aws:states:::lambda:invoke.waitForTaskToken"
MATH_ADD = re.compile(r"^States\.MathAdd\((\$[\w.]*),\s*(-?\d+)\)$")


class FakeStepFunctions:
    """Stands in for boto3's stepfunctions client in the answer code."""

    def __init__(self):
        self.outcomes: dict[str, tuple[str, dict]] = {}
        self.closed: set[str] = set()
        self.started: list[dict] = []

    def _check(self, token):
        if token in self.closed or token in self.outcomes:
            raise ClientError({"Error": {"Code": "TaskTimedOut", "Message": "closed"}}, "SendTask")

    def send_task_success(self, taskToken, output):
        self._check(taskToken)
        self.outcomes[taskToken] = ("success", json.loads(output))
        return {}

    def send_task_failure(self, taskToken, error="", cause=""):
        self._check(taskToken)
        self.outcomes[taskToken] = ("failure", {"Error": error, "Cause": cause})
        return {}

    def start_execution(self, stateMachineArn, name, input):
        self.started.append({"arn": stateMachineArn, "name": name, "input": json.loads(input)})
        return {"executionArn": stateMachineArn.replace(":stateMachine:", ":execution:") + ":" + name, "startDate": None}


class StepFailed(Exception):
    def __init__(self, error: str, cause: str = ""):
        super().__init__(f"{error}: {cause}")
        self.error, self.cause = error, cause


def get_path(data, path: str, ctx: dict):
    if path.startswith("$$."):
        cur = ctx
        parts = path[3:].split(".")
    elif path == "$":
        return data
    else:
        cur = data
        parts = path[2:].split(".")
    for p in parts:
        if not isinstance(cur, dict) or p not in cur:
            raise StepFailed("States.Runtime", f"path {path} not found")
        cur = cur[p]
    return cur


def resolve(params, data, ctx):
    if isinstance(params, dict):
        out = {}
        for k, v in params.items():
            if k.endswith(".$"):
                m = MATH_ADD.match(v)
                if m:
                    out[k[:-2]] = int(get_path(data, m.group(1), ctx)) + int(m.group(2))
                elif v.startswith("States."):
                    raise NotImplementedError(v)
                else:
                    out[k[:-2]] = copy.deepcopy(get_path(data, v, ctx))
            else:
                out[k] = resolve(v, data, ctx)
        return out
    if isinstance(params, list):
        return [resolve(x, data, ctx) for x in params]
    return params


def put_result(data, result_path, result):
    if result_path is None:
        return data
    if result_path == "$":
        return result
    out = copy.deepcopy(data)
    cur = out
    parts = result_path[2:].split(".")
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    cur[parts[-1]] = result
    return out


def matches(error: str, names: list[str]) -> bool:
    for n in names:
        if n == error or n == "States.ALL" or (n == "States.TaskFailed" and error != "States.Timeout"):
            return True
    return False


MISSING = object()


def rule(c, data) -> bool:
    if "And" in c:
        return all(rule(x, data) for x in c["And"])
    v = data
    for p in c["Variable"][2:].split("."):
        v = v.get(p, MISSING) if isinstance(v, dict) else MISSING
    if "IsPresent" in c:
        return (v is not MISSING) == c["IsPresent"]
    if v is MISSING:
        # Step Functions fails the execution when a Choice reads a path that is not there
        raise StepFailed("States.Runtime", f"{c['Variable']} not found")
    if "StringEquals" in c:
        return v == c["StringEquals"]
    if "NumericLessThanPath" in c:
        return v < get_path(data, c["NumericLessThanPath"], {})
    raise NotImplementedError(c)


def choose(state, data):
    for c in state["Choices"]:
        if rule(c, data):
            return c["Next"]
    return state["Default"]


class Run:
    """run = Run(functions, responder, sfn); final = run.start(input)."""

    def __init__(self, functions: dict, responder, sfn: FakeStepFunctions, name: str = "test", asl: dict | None = None):
        self.functions = functions  # "PageFunctionArn" -> handler
        self.responder = responder  # (state_name, payload, handler_result, run) -> None
        self.sfn = sfn
        self.name = name
        self.asl = asl or ASL
        self.entered: list[str] = []
        self.waits: list[dict] = []
        self.tokens = 0
        self.lambda_errors = {"NoRoster"}

    def fn(self, ref: str):
        return self.functions[ref.strip("${}")]

    def task(self, name, state, data, ctx):
        if state["Resource"] == WAIT_RESOURCE:
            self.tokens += 1
            token = f"token-{self.tokens}"
            ctx = {**ctx, "Task": {"Token": token}}
            params = resolve(state["Parameters"], data, ctx)
            # what TimeoutSecondsPath reads: a positive integer in the state's input
            timeout = get_path(data, state["TimeoutSecondsPath"], ctx)
            assert isinstance(timeout, int) and timeout > 0, (name, timeout)
            payload = params["Payload"]
            try:
                res = self.fn(params["FunctionName"])(copy.deepcopy(payload), None)
            except Exception as e:
                # an error the handler raises on purpose fails the task under its own name
                if type(e).__name__ in self.lambda_errors:
                    raise StepFailed(type(e).__name__, str(e)) from e
                raise
            self.waits.append({"state": name, "timeout": timeout, "result": res, "payload": payload})
            self.responder(name, payload, res, self)
            outcome = self.sfn.outcomes.get(token)
            self.sfn.closed.add(token)
            if outcome is None:
                raise StepFailed("States.Timeout", "")
            kind, value = outcome
            if kind == "failure":
                raise StepFailed(value["Error"], value["Cause"])
            return value
        params = resolve(state.get("Parameters", {}), data, ctx)
        return self.fn(state["Resource"])(params, None)

    def start(self, data: dict, max_steps: int = 500) -> dict:
        ctx = {"Execution": {"Id": f"arn:aws:states:ap-south-1:123456789012:execution:bp-incident:{self.name}"}}
        name = self.asl["StartAt"]
        for _ in range(max_steps):
            state = self.asl["States"][name]
            self.entered.append(name)
            t = state["Type"]
            if t == "Succeed":
                return data
            if t == "Choice":
                name = choose(state, data)
                continue
            if t == "Pass":
                result = state["Result"] if "Result" in state else resolve(state.get("Parameters", {}), data, ctx) if "Parameters" in state else data
                data = put_result(data, state.get("ResultPath", "$"), result)
                name = state["Next"]
                continue
            if t == "Task":
                try:
                    result = self.task(name, state, data, ctx)
                except StepFailed as e:
                    catcher = next((c for c in state.get("Catch", []) if matches(e.error, c["ErrorEquals"])), None)
                    if catcher is None:
                        raise
                    data = put_result(data, catcher.get("ResultPath", "$"), {"Error": e.error, "Cause": e.cause})
                    name = catcher["Next"]
                    continue
                data = put_result(data, state.get("ResultPath", "$"), result)
                name = state["Next"]
                continue
            raise NotImplementedError(t)
        raise AssertionError("the run did not finish")
