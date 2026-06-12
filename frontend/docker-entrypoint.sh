#!/bin/sh
set -eu

cat > /usr/share/nginx/html/env.js <<EOF
window.API_BASE = "${API_BASE:-http://localhost:8000}";
EOF
