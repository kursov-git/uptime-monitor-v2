#!/bin/sh
set -eu

ssl_domains="${SSL_DOMAINS:-localhost}"
ssl_cert_name="${SSL_CERT_NAME:-${ssl_domains%%,*}}"
server_names="$(printf '%s' "$ssl_domains" | tr ',' ' ' | xargs)"
cert_dir="/etc/letsencrypt/live/${ssl_cert_name}"
fullchain_path="${cert_dir}/fullchain.pem"
privkey_path="${cert_dir}/privkey.pem"

export SERVER_NAMES="${server_names:-_}"

template_path="/opt/uptime-monitor/nginx/http.conf.template"
mode="http"

if [ -s "$fullchain_path" ] && [ -s "$privkey_path" ]; then
    export SSL_CERTIFICATE="$fullchain_path"
    export SSL_CERTIFICATE_KEY="$privkey_path"
    template_path="/opt/uptime-monitor/nginx/https.conf.template"
    mode="https"
fi

envsubst '${SERVER_NAMES} ${SSL_CERTIFICATE} ${SSL_CERTIFICATE_KEY}' \
    < "$template_path" \
    > /etc/nginx/conf.d/default.conf

printf '%s\n' "$mode"
