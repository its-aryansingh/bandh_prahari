# Baandh Prahari. On Windows, docs/DEPLOY.md gives the same commands for PowerShell.
API ?= $(shell aws cloudformation describe-stacks --stack-name bp --region ap-south-1 --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)

.PHONY: test lint asl build deploy seed fast-incident

test:
	pytest -q

lint:
	sam validate --lint --region ap-south-1

asl:
	python scripts/gen_incident_asl.py

build: test lint
	sam build

deploy: build
	sam deploy

seed:
	python scripts/seed.py

fast-incident:
	python scripts/fast_incident.py $(API)
