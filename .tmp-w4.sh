#!/bin/bash
set -u
TOKEN=$(cat /tmp/ghtok.txt)
for i in $(seq 1 40); do
  sleep 30
  LINE=$(curl -s -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/KevinAntonioWiyonoLauw/latex-webapp/actions/runs?per_page=1" \
    | bun -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).workflow_runs[0];console.log('#'+r.run_number+' '+r.head_sha.slice(0,7)+' '+r.status+' '+r.conclusion);});")
  echo "[$i] $LINE"
  case "$LINE" in
    *7c427dd*completed*success*) echo "BUILD_SUCCESS"; exit 0;;
    *7c427dd*completed*) echo "BUILD_FAILED"; exit 1;;
  esac
done
echo "TIMEOUT"; exit 2
