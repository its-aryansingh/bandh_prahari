#!/bin/sh
set -e
cd web
npm ci
npm run build
npx vite preview --host 0.0.0.0 --port "${PORT:-5173}"
