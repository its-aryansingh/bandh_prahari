"""Deploy built web/dist assets to an Amazon S3 static website bucket using boto3."""

import argparse
import mimetypes
import os
from pathlib import Path
import sys

try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
except ImportError:
    print("Error: boto3 is required. Run 'pip install boto3'")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "web" / "dist"

EXTRA_MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
}


def get_content_type(file_path: Path) -> str:
    ext = file_path.suffix.lower()
    if ext in EXTRA_MIME_TYPES:
        return EXTRA_MIME_TYPES[ext]
    mime, _ = mimetypes.guess_type(str(file_path))
    return mime or "application/octet-stream"


def deploy(bucket_name: str, region: str = "ap-south-1", cf_distribution: str = None, enable_website: bool = False):
    if not DIST_DIR.exists():
        print(f"Error: {DIST_DIR} not found. Run 'npm --prefix web run build' first.")
        sys.exit(1)

    session = boto3.Session(region_name=region)
    s3 = session.client("s3")

    # Check credentials
    try:
        sts = session.client("sts")
        caller = sts.get_caller_identity()
        print(f"Authenticated as AWS Principal: {caller['Arn']} (Account: {caller['Account']})")
    except (NoCredentialsError, ClientError) as e:
        print(f"Error authenticating with AWS: {e}")
        print("Please configure AWS credentials via environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) or ~/.aws/credentials.")
        sys.exit(1)

    print(f"Uploading {DIST_DIR} to s3://{bucket_name}/ ...")
    files_uploaded = 0

    for root, _, files in os.walk(DIST_DIR):
        for file in files:
            local_path = Path(root) / file
            s3_key = local_path.relative_to(DIST_DIR).as_posix()
            content_type = get_content_type(local_path)
            cache_control = "no-cache" if local_path.suffix.lower() == ".html" else "public, max-age=31536000, immutable"

            extra_args = {
                "ContentType": content_type,
                "CacheControl": cache_control,
            }

            s3.upload_file(str(local_path), bucket_name, s3_key, ExtraArgs=extra_args)
            print(f"  [+] {s3_key} ({content_type})")
            files_uploaded += 1

    print(f"Successfully uploaded {files_uploaded} files to s3://{bucket_name}/")

    if enable_website:
        print("Configuring S3 static website hosting...")
        try:
            s3.put_bucket_website(
                Bucket=bucket_name,
                WebsiteConfiguration={
                    "IndexDocument": {"Suffix": "index.html"},
                    "ErrorDocument": {"Key": "index.html"},
                },
            )
            print(f"Static website configured. Endpoint: http://{bucket_name}.s3-website.{region}.amazonaws.com")
        except ClientError as e:
            print(f"Warning: Could not configure bucket website: {e}")

    if cf_distribution:
        print(f"Creating CloudFront invalidation for distribution {cf_distribution}...")
        cf = session.client("cloudfront")
        import time
        res = cf.create_invalidation(
            DistributionId=cf_distribution,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": ["/*"]},
                "CallerReference": f"deploy-{int(time.time())}",
            },
        )
        print(f"Invalidation created: {res['Invalidation']['Id']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy web/dist to AWS S3")
    parser.add_argument("--bucket", required=True, help="S3 bucket name")
    parser.add_argument("--region", default="ap-south-1", help="AWS region (default: ap-south-1)")
    parser.add_argument("--cloudfront", help="CloudFront Distribution ID (optional)")
    parser.add_argument("--website", action="store_true", help="Enable S3 static website hosting")

    args = parser.parse_args()
    deploy(bucket_name=args.bucket, region=args.region, cf_distribution=args.cloudfront, enable_website=args.website)
