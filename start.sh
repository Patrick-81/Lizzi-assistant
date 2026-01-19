#!/bin/bash
lsof -ti :3001 | xargs kill -9 2>/dev/null
sleep 1
npm run dev
EOF
