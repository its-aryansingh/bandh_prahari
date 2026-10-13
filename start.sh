#!/bin/sh
set -e
cd web
npm ci
npm run build
node server.js
