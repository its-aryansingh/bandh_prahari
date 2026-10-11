# Baandh Prahari (जवाब घड़ी): Deployment Guide

This guide covers deployment from a fresh Windows PC with PowerShell to a fully live stack on AWS (`ap-south-1`, Mumbai), including the WhatsApp/Telegram channels, Amplify front-end hosting, CloudWatch observability, evidence metrics, and clean teardown.

---

## 1. Prerequisites (Windows PowerShell)

Install the required tools using `winget` in an Administrator PowerShell window:

```powershell
winget install -e --id Amazon.AWSCLI
winget install -e --id Amazon.SAM-CLI
winget install -e --id Python.Python.3.12
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
```

Close PowerShell and open a normal user PowerShell window. Verify installations:

```powershell
aws configure                      # Default region: ap-south-1, output format: json
aws sts get-caller-identity        # Confirms account ID and IAM credentials
```

### Clone and Setup Virtual Environment

```powershell
git clone https://github.com/its-aryansingh/bandh_prahari
cd bandh_prahari
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1       # If blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements-dev.txt
```

Verify tests and template linting locally:

```powershell
pytest -q                          # All tests must pass
sam validate --lint --region ap-south-1
```

---

## 2. AWS Console Setup (Mumbai `ap-south-1`)

1. **AWS Budgets:** Create a $5/month cost budget with an email alert.
2. **Bedrock:** Verify model access in `ap-south-1`:
   ```powershell
   aws bedrock list-inference-profiles --region ap-south-1
   ```
3. **AWS End User Messaging Social (WhatsApp):**
   - Go to AWS End User Messaging -> Social messaging -> Add phone number.
   - Use a phone number not currently registered on WhatsApp. Meta display name review takes some time.

---

## 3. First Deployment: The Backend Stack

Build and deploy with SAM:

```powershell
sam build
sam deploy --guided
```

### Guided Prompts & Expected Answers

| Prompt | Value | Description |
| --- | --- | --- |
| **Stack Name** | `bp` | Matches the Makefile and CLI scripts |
| **AWS Region** | `ap-south-1` | Mumbai region only |
| **Parameter Channel** | `screen` | In-browser simulated channel for testing |
| **Parameter Outbound** | `off` | Outbound messaging disabled until channel verified |
| **Parameter DemoDailyCap** | `300` | Daily limit on demo runs |
| **Parameter WhatsAppPhoneNumberHex** | Press Enter | Default empty until phone is verified |
| **Parameter MetaApiVersion** | Press Enter | Default `v20.0` |
| **Parameter AllowedOrigin** | `*` | Temporary wildcard; lock down to Amplify URL later |
| **Confirm changes before deploy** | `y` | Review changeset |
| **Allow SAM CLI IAM role creation** | `y` | Required for least-privilege roles |
| **Disable authorization for routes** | `y` | Public routes are throttled and public by design |
| **Save arguments to configuration file** | `y` | Writes to `.gitignore`'d `samconfig.toml` |

### Expected Output

```text
Successfully created/updated stack - bp in ap-south-1

Outputs:
Key                 Value
------------------------------------------------------------------------------------------------------
ApiUrl              https://<api-id>.execute-api.ap-south-1.amazonaws.com
TableName           bp
BucketName          bp-bucket-<account>-ap-south-1
IncidentRunArn      arn:aws:states:ap-south-1:<account>:stateMachine:bp-incident
HelpRunArn          arn:aws:states:ap-south-1:<account>:stateMachine:bp-help
InboundTopicArn     arn:aws:sns:ap-south-1:<account>:bp-inbound-topic
```

---

## 4. Seed Data & Run the Fast Smoke Test

### Seed DynamoDB and S3 Assets

```powershell
python scripts/seed.py --dry-run    # Preview the items to be seeded
python scripts/seed.py              # Seeds stretch segments, replay data, and default rosters
```

### Run the Fast Incident Smoke Test

```powershell
$api = aws cloudformation describe-stacks --stack-name bp --region ap-south-1 --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text
python scripts/fast_incident.py $api
```

**Expected output:**
```text
run INC-XXXX: P1
  paged the junior engineer; letting the clock run out
  climbed; the assistant engineer answered
PASS in ~120 s: report, page, timeout, climb, answer, warning, on site, close
```

---

## 5. WhatsApp Integration (End User Messaging Social)

Once Meta approves your WhatsApp business number:

1. In **AWS End User Messaging -> Social messaging -> WhatsApp business accounts**, open your number.
2. Set its **Event Destination** to the SNS topic ARN from the stack output (`InboundTopicArn`).
3. Copy the phone number ID (the hex suffix after `phone-number-id/` in the ARN).
4. Store the demo roster phone numbers in AWS Systems Manager (SSM) Parameter Store:

```powershell
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/roster/je --value "+91XXXXXXXXXX"
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/roster/ae --value "+91XXXXXXXXXX"
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/roster/ee --value "+91XXXXXXXXXX"
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/mukhiya/haijalpur --value "+91XXXXXXXXXX"
python scripts/seed.py
```

5. Have every phone on the roster send the message **"join"** to your WhatsApp number.
6. Turn on outbound WhatsApp messaging:

```powershell
sam deploy --parameter-overrides Channel=whatsapp Outbound=on WhatsAppPhoneNumberHex=<phone-id>
```

7. **Test on WhatsApp:**
   - Send `Haijalpur`: Returns today's river reading in Hindi with source and safe instructions.
   - Send `TEST`: Starts a 1-minute demo run assigning you as patrol worker and engineer.

---

## 6. Telegram Fallback Integration

If WhatsApp verification is delayed:

1. Create a bot with `@BotFather` on Telegram and copy the bot token.
2. Put the token and a random hook secret in SSM:

```powershell
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/telegram/token --value "<bot_token>"
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/telegram/hook-secret --value "long_random_secret_string_here"
```

3. Redeploy with the Telegram channel:

```powershell
sam deploy --parameter-overrides Channel=telegram Outbound=on
```

4. Set the webhook pointing to your API Gateway:

```powershell
$api = aws cloudformation describe-stacks --stack-name bp --region ap-south-1 --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text
$token = "<bot_token>"
$secret = "long_random_secret_string_here"

Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body (@{
    url = "$api/telegram/hook"
    secret_token = $secret
} | ConvertTo-Json) -ContentType "application/json"
```

---

## 7. Web Front-End Deployment (AWS Amplify Hosting)

1. Go to AWS Management Console -> **AWS Amplify** -> **Hosting** -> **Host web app**.
2. Connect your GitHub repository (`bandh_prahari`), branch `main`.
3. In Build settings, set:
   - **App root:** `web`
   - **Build command:** `npm ci && npm run build`
   - **Output directory:** `dist`
4. In Environment variables, set:
   - `VITE_API_BASE`: The API Gateway URL (`https://<api-id>.execute-api.ap-south-1.amazonaws.com`)
5. Save and deploy.
6. Once deployed, get your Amplify URL (`https://main.<id>.amplifyapp.com`) and lock down CORS on the API:

```powershell
sam deploy --parameter-overrides AllowedOrigin="https://main.<id>.amplifyapp.com"
```

---

## 8. Relief Roles & Location Service Tokens

For the Live Map relief view:

```powershell
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/tokens/relief --value "relief_secret_token_123"
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/tokens/district --value "district_secret_token_456"
```

Users visiting `https://main.<id>.amplifyapp.com/?role=relief&token=relief_secret_token_123` will be able to see exact help request pins and team dispatches.

---

## 9. CloudWatch Metrics & Evidence Run

Run the 5-incident automated evidence suite:

```powershell
python scripts/evidence.py $api
```

This drives 5 real demo runs through the API, measures tap-to-page and escalation climb times, checks CloudWatch metrics, and formats a markdown table ready to paste into the project README.

View the live CloudWatch dashboard:
- Go to CloudWatch -> Dashboards -> **`bp-dashboard`**.
- Displays: Minutes to Answer, Escalations (Climbs), Step Functions Executions, and API Gateway 4xx/5xx status.

---

## 10. Teardown Instructions

To completely delete all deployed resources and stop any ongoing charges:

### Step 1: Delete CloudFormation Stack

```powershell
sam delete --stack-name bp --region ap-south-1 --no-prompts
```

### Step 2: S3 Object Lock Bucket Cleanup

The S3 bucket was created with Object Lock in **Governance mode** with a **1-day retention period**.

- Immediately after stack deletion, objects under retention cannot be deleted by non-privileged calls.
- To immediately clean up objects in Governance mode, use the `s3:BypassGovernanceRetention` permission:

```powershell
$bucket = aws s3api list-buckets --query "Buckets[?starts_with(Name, 'bp-bucket-')].Name" --output text
if ($bucket) {
    # Remove all object versions bypassing governance lock
    aws s3api delete-objects --bucket $bucket --bypass-governance-retention --delete (
        aws s3api list-object-versions --bucket $bucket --query "{Objects: Versions[].{Key:Key,VersionId:VersionId}}" --output json
    )
    # Remove delete markers
    aws s3api delete-objects --bucket $bucket --bypass-governance-retention --delete (
        aws s3api list-object-versions --bucket $bucket --query "{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}" --output json
    )
    # Delete the empty bucket
    aws s3 rb "s3://$bucket" --force
}
```

Or wait 24 hours until the 1-day retention expires, then delete the bucket with `aws s3 rb s3://<bucket> --force`.
