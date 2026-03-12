#!/bin/sh
set -eu

ssl_domains="${SSL_DOMAINS:-localhost}"
ssl_cert_name="${SSL_CERT_NAME:-${ssl_domains%%,*}}"
admin_allowlist="${ADMIN_ALLOWLIST:-}"
agent_allowlist="${AGENT_ALLOWLIST:-}"
runtime_health_allowlist="${RUNTIME_HEALTH_ALLOWLIST:-}"
server_names="$(printf '%s' "$ssl_domains" | tr ',' ' ' | xargs)"
cert_dir="/etc/letsencrypt/live/${ssl_cert_name}"
fullchain_path="${cert_dir}/fullchain.pem"
privkey_path="${cert_dir}/privkey.pem"
snippet_dir="/etc/nginx/snippets"

render_allowlist_snippet() {
    value="$1"
    output_path="$2"
    default_mode="${3:-allow-all}"

    mkdir -p "$snippet_dir"

    if [ -z "$value" ]; then
        if [ "$default_mode" = "deny-all" ]; then
            cat > "$output_path" <<'EOF'
deny all;
EOF
            return
        fi

        cat > "$output_path" <<'EOF'
# allowlist not configured
EOF
        return
    fi

    : > "$output_path"
    old_ifs="${IFS}"
    IFS=','
    set -- $value
    IFS="${old_ifs}"

    for entry in "$@"; do
        trimmed="$(printf '%s' "$entry" | xargs)"
        if [ -n "$trimmed" ]; then
            printf 'allow %s;\n' "$trimmed" >> "$output_path"
        fi
    done

    printf '%s\n' 'deny all;' >> "$output_path"
}

export SERVER_NAMES="${server_names:-_}"

template_path="/opt/uptime-monitor/nginx/http.conf.template"
mode="http"

if [ -s "$fullchain_path" ] && [ -s "$privkey_path" ]; then
    export SSL_CERTIFICATE="$fullchain_path"
    export SSL_CERTIFICATE_KEY="$privkey_path"
    template_path="/opt/uptime-monitor/nginx/https.conf.template"
    mode="https"
fi

render_allowlist_snippet "$admin_allowlist" "${snippet_dir}/admin-allowlist.conf" "allow-all"
render_allowlist_snippet "$agent_allowlist" "${snippet_dir}/agent-allowlist.conf" "allow-all"
render_allowlist_snippet "$runtime_health_allowlist" "${snippet_dir}/runtime-health-allowlist.conf" "deny-all"

envsubst '${SERVER_NAMES} ${SSL_CERTIFICATE} ${SSL_CERTIFICATE_KEY}' \
    < "$template_path" \
    > /etc/nginx/conf.d/default.conf

printf '%s\n' "$mode"
