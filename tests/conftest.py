"""Shared test setup: src/ on the path, fake AWS (moto) for DynamoDB and S3, no real calls."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

# Never touch a real account: fake credentials, the project's region.
os.environ.update(
    {
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "AWS_SESSION_TOKEN": "testing",
        "AWS_DEFAULT_REGION": "ap-south-1",
        "AWS_REGION": "ap-south-1",
        "TABLE_NAME": "bp",
        "BUCKET_NAME": "bp-test-bucket",
        "STATE_MACHINE_ARN": "arn:aws:states:ap-south-1:123456789012:stateMachine:bp-incident",
    }
)


def make_table(ddb):
    return ddb.create_table(
        TableName="bp",
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "gsi1pk", "gsi1sk")],
        KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "gsi1",
                "KeySchema": [{"AttributeName": "gsi1pk", "KeyType": "HASH"}, {"AttributeName": "gsi1sk", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    )


@pytest.fixture
def aws():
    """A fresh fake table "bp" and bucket for each test."""
    import boto3
    from moto import mock_aws

    from common import db

    with mock_aws():
        table = make_table(boto3.resource("dynamodb", region_name="ap-south-1"))
        s3 = boto3.client("s3", region_name="ap-south-1")
        # like template.yaml: Object Lock, governance mode, one day
        s3.create_bucket(Bucket="bp-test-bucket", CreateBucketConfiguration={"LocationConstraint": "ap-south-1"}, ObjectLockEnabledForBucket=True)
        s3.put_object_lock_configuration(
            Bucket="bp-test-bucket",
            ObjectLockConfiguration={"ObjectLockEnabled": "Enabled", "Rule": {"DefaultRetention": {"Mode": "GOVERNANCE", "Days": 1}}},
        )
        db.set_table(table)
        yield table
        db.set_table(None)
