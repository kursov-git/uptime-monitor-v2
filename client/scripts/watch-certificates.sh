#!/bin/sh
set -eu

ssl_domains="${SSL_DOMAINS:-localhost}"
ssl_cert_name="${SSL_CERT_NAME:-${ssl_domains%%,*}}"
watch_interval_sec="${SSL_WATCH_INTERVAL_SEC:-60}"
fullchain_path="/etc/letsencrypt/live/${ssl_cert_name}/fullchain.pem"
privkey_path="/etc/letsencrypt/live/${ssl_cert_name}/privkey.pem"

compute_state() {
    if [ -s "$fullchain_path" ] && [ -s "$privkey_path" ]; then
        cksum "$fullchain_path" "$privkey_path" | cksum | awk '{ print "https:" $1 ":" $2 }'
        return
    fi

    printf '%s\n' 'http:no-cert'
}

last_state="$(compute_state)"

while :; do
    sleep "$watch_interval_sec"
    current_state="$(compute_state)"
    if [ "$current_state" = "$last_state" ]; then
        continue
    fi

    echo "Detected certificate state change: ${last_state} -> ${current_state}"
    /usr/local/bin/render-nginx-config.sh >/dev/null

    if nginx -t; then
        nginx -s reload
        last_state="$current_state"
        continue
    fi

    echo "nginx reload skipped because configuration test failed"
done
