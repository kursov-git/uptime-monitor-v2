#!/bin/sh
set -eu

mode="$(/usr/local/bin/render-nginx-config.sh)"
echo "Configured nginx in ${mode} mode"
/usr/local/bin/watch-certificates.sh &
