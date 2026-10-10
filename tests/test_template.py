"""template.yaml and the state machine follow AGENTS.md and docs/SPEC.md.

`sam validate --lint` does not look inside an AWS::Serverless::StateMachine's DefinitionUri,
so the ASL is checked here against cfn-lint's own Step Functions schema.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import cfnlint.data.schemas.other.step_functions as sfn_schemas
import jsonschema
from cfnlint.decode import decode

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE, _ = decode(str(ROOT / "template.yaml"))
RES = TEMPLATE["Resources"]
ASL_TEXT = (ROOT / "statemachine" / "incident.asl.json").read_text(encoding="utf-8")
ASL = json.loads(ASL_TEXT)
HELP_ASL_TEXT = (ROOT / "statemachine" / "help.asl.json").read_text(encoding="utf-8")
HELP_ASL = json.loads(HELP_ASL_TEXT)
WAIT = "arn:aws:states:::lambda:invoke.waitForTaskToken"

# The only statements allowed Resource "*" (see the IAM notes at the top of template.yaml).
STAR_OK = {
    ("DemoApiRole", "AnswerButtonNoResourceLevelPermissions"),
    ("WorkerRole", "AnswerButtonNoResourceLevelPermissions"),
    ("HelpApiRole", "AnswerButtonNoResourceLevelPermissions"),
    ("IntakeRole", "UndeliveredNoResourceLevelPermissions"),
    ("DeliveryRole", "UndeliveredNoResourceLevelPermissions"),
}


def of_type(t):
    return {k: v for k, v in RES.items() if v["Type"] == t}


def test_region_and_runtime():
    g = TEMPLATE["Globals"]["Function"]
    assert g["Runtime"] == "python3.12"


def test_table_is_bp_with_the_spec_keys():
    t = RES["Table"]["Properties"]
    assert t["TableName"] == "bp"
    assert [k["AttributeName"] for k in t["KeySchema"]] == ["PK", "SK"]
    assert t["GlobalSecondaryIndexes"][0]["IndexName"] == "gsi1"
    assert t["PointInTimeRecoverySpecification"]["PointInTimeRecoveryEnabled"] is True
    assert t["SSESpecification"]["SSEEnabled"] is True
    assert t["TimeToLiveSpecification"] == {"AttributeName": "ttl", "Enabled": True}


def test_bucket_has_object_lock_governance_one_day_and_versioning():
    b = RES["Bucket"]["Properties"]
    assert b["ObjectLockEnabled"] is True
    assert b["ObjectLockConfiguration"]["Rule"]["DefaultRetention"] == {"Mode": "GOVERNANCE", "Days": 1}
    assert b["VersioningConfiguration"]["Status"] == "Enabled"
    assert b["BucketEncryption"]["ServerSideEncryptionConfiguration"][0]["ServerSideEncryptionByDefault"]["SSEAlgorithm"] == "aws:kms"
    assert all(b["PublicAccessBlockConfiguration"].values())


def test_incident_run_is_standard_never_express():
    sm = RES["IncidentRun"]["Properties"]
    assert sm["Type"] == "STANDARD"
    assert sm["DefinitionUri"] == "statemachine/incident.asl.json"
    help_sm = RES["HelpRun"]["Properties"]
    assert help_sm["Type"] == "STANDARD"
    assert help_sm["DefinitionUri"] == "statemachine/help.asl.json"


def test_every_substitution_in_the_asl_is_defined():
    used = set(re.findall(r"\$\{(\w+)\}", ASL_TEXT))
    assert used == set(RES["IncidentRun"]["Properties"]["DefinitionSubstitutions"])
    help_used = set(re.findall(r"\$\{(\w+)\}", HELP_ASL_TEXT))
    assert help_used == set(RES["HelpRun"]["Properties"]["DefinitionSubstitutions"])


def test_every_function_has_its_own_role_and_a_180_day_log_group():
    fns = of_type("AWS::Serverless::Function")
    roles = [f["Properties"]["Role"]["Fn::GetAtt"][0] for f in fns.values()]
    assert len(roles) == len(set(roles)), "functions share a role"
    for name, f in fns.items():
        p = f["Properties"]
        group = p["LoggingConfig"]["LogGroup"]["Ref"]
        lg = RES[group]["Properties"]
        assert lg["RetentionInDays"] == 180, name
        assert lg["LogGroupName"] == f"/aws/lambda/{p['FunctionName']}", name
    assert all(lg["Properties"]["RetentionInDays"] == 180 for lg in of_type("AWS::Logs::LogGroup").values())


def _statements(role):
    for pol in role["Properties"].get("Policies", []):
        yield from pol["PolicyDocument"]["Statement"]


def test_no_star_in_iam_except_the_documented_ones():
    for name, role in of_type("AWS::IAM::Role").items():
        assert "ManagedPolicyArns" not in role["Properties"], name
        for st in _statements(role):
            actions = st["Action"] if isinstance(st["Action"], list) else [st["Action"]]
            assert not any(a == "*" or a.endswith(":*") for a in actions), (name, actions)
            if st.get("Resource") == "*" or (isinstance(st.get("Resource"), list) and "*" in st["Resource"]):
                assert (name, st.get("Sid")) in STAR_OK, (name, st)


def test_only_the_judge_route_and_the_worker_can_answer():
    can_answer = {n for n, r in of_type("AWS::IAM::Role").items() for st in _statements(r) if "states:SendTaskSuccess" in st["Action"]}
    assert can_answer == {"DemoApiRole", "WorkerRole", "HelpApiRole"}


def test_judge_routes_are_throttled():
    rs = RES["HttpApi"]["Properties"]["RouteSettings"]
    assert rs["POST /demo/runs"]["ThrottlingRateLimit"] <= 1
    assert "DefaultRouteSettings" in RES["HttpApi"]["Properties"]


def test_outbound_is_off_until_the_human_turns_it_on():
    assert TEMPLATE["Parameters"]["Outbound"]["Default"] == "off"


def test_cors_configuration_allows_amplify_and_localhost():
    cors = RES["HttpApi"]["Properties"]["CorsConfiguration"]
    origins = [str(o) for o in cors["AllowOrigins"]]
    assert any("localhost:5173" in o for o in origins)
    assert any("amplifyapp.com" in o for o in origins)
    assert set(cors["AllowMethods"]) >= {"GET", "POST", "OPTIONS"}


# ---------------- the ASL itself ----------------


def test_asl_passes_cfn_lint_step_functions_schema():
    schema = json.loads((Path(sfn_schemas.__file__).parent / "statemachine.json").read_text())
    # the ${...} substitutions are filled at deploy time; stand in a Lambda ARN
    filled = json.loads(re.sub(r"\$\{(\w+)\}", "arn:aws:lambda:ap-south-1:123456789012:function:bp-x", ASL_TEXT))
    jsonschema.Draft7Validator(schema).validate(filled)
    filled_help = json.loads(re.sub(r"\$\{(\w+)\}", "arn:aws:lambda:ap-south-1:123456789012:function:bp-x", HELP_ASL_TEXT))
    jsonschema.Draft7Validator(schema).validate(filled_help)


def test_help_asl_reachability_and_waits():
    states = HELP_ASL["States"]
    seen, todo = set(), [HELP_ASL["StartAt"]]
    while todo:
        n = todo.pop()
        if n in seen:
            continue
        seen.add(n)
        s = states[n]
        nxt = [s.get("Next"), s.get("Default")] + [c["Next"] for c in s.get("Choices", [])] + [c["Next"] for c in s.get("Catch", [])]
        for x in filter(None, nxt):
            assert x in states, (n, x)
            todo.append(x)
    assert seen == set(states)

    waits = {n: s for n, s in states.items() if s.get("Resource") == WAIT}
    assert set(waits) == {"AskNearestTeam", "AwaitTeamOnSite", "AwaitFamilySafe"}
    for n, s in waits.items():
        assert "TimeoutSeconds" not in s and s["TimeoutSecondsPath"].startswith("$.clocks."), n
        assert s["Parameters"]["Payload"]["taskToken.$"] == "$$.Task.Token", n
        assert s["Catch"][0]["ErrorEquals"] == ["States.ALL"], n


def test_every_next_exists_and_every_state_is_reachable():
    states = ASL["States"]
    seen, todo = set(), [ASL["StartAt"]]
    while todo:
        n = todo.pop()
        if n in seen:
            continue
        seen.add(n)
        s = states[n]
        nxt = [s.get("Next"), s.get("Default")] + [c["Next"] for c in s.get("Choices", [])] + [c["Next"] for c in s.get("Catch", [])]
        for x in filter(None, nxt):
            assert x in states, (n, x)
            todo.append(x)
    assert seen == set(states)


def test_waits_use_task_tokens_with_timeout_seconds_path():
    waits = {n: s for n, s in ASL["States"].items() if s.get("Resource") == WAIT}
    assert set(waits) == {
        "PageJuniorEngineer",
        "PageAssistantEngineer",
        "PageExecutiveEngineer",
        "PageForceAndDistrict",
        "AlertCentralFloodControlRoom",
        "AwaitEngineerOnSite",
        "HoldTheStretch",
    }
    for n, s in waits.items():
        assert "TimeoutSeconds" not in s and s["TimeoutSecondsPath"].startswith("$.clocks."), n
        assert s["Parameters"]["Payload"]["taskToken.$"] == "$$.Task.Token", n
        assert "InputPath" not in s, n
        # a timeout or a "not my stretch" climbs; nothing is left uncaught
        assert s["Catch"][0]["ErrorEquals"] == ["States.ALL"], n


def test_get_ready_does_not_wait_for_anyone():
    s = ASL["States"]
    assert s["IsItP1"]["Choices"][0]["Next"] == "WarnVillagesGetReady"
    assert s["WarnVillagesGetReady"]["Next"] == "PageJuniorEngineer"
    assert s["WarnVillagesGetReady"]["Catch"][0]["Next"] == "PageJuniorEngineer"


def test_state_names_match_the_spec():
    spec = (ROOT / "docs" / "SPEC.md").read_text(encoding="utf-8")
    for name in re.findall(r"^\| `(\w+)` \|", spec[spec.index("## The incident run") : spec.index("## The agent")], re.M):
        assert name in ASL["States"], name


def test_whatsapp_send_is_scoped_to_our_number():
    for name, role in of_type("AWS::IAM::Role").items():
        for st in _statements(role):
            if "social-messaging:SendWhatsAppMessage" in str(st["Action"]):
                assert "phone-number-id/${WhatsAppPhoneNumberHex}" in json.dumps(st["Resource"]), name


def test_inbound_topic_is_encrypted_with_a_customer_key():
    assert RES["InboundTopic"]["Properties"]["KmsMasterKeyId"] == {"Ref": "InboundKey"}
    assert RES["InboundKey"]["Properties"]["EnableKeyRotation"] is True
