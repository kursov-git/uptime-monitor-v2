#!/bin/sh
set -eu

ssl_domains="${SSL_DOMAINS:-}"
ssl_cert_name="${SSL_CERT_NAME:-${ssl_domains%%,*}}"
letsencrypt_email="${LETSENCRYPT_EMAIL:-}"
webroot_dir="${CERTBOT_WEBROOT:-/var/www/certbot}"
sleep_seconds="${CERTBOT_RENEW_INTERVAL_SEC:-43200}"

if [ -z "$ssl_domains" ]; then
    echo "SSL_DOMAINS is empty, skipping certificate issuance"
else
    cert_path="/etc/letsencrypt/live/${ssl_cert_name}/fullchain.pem"
    if [ ! -s "$cert_path" ]; then
        if [ -z "$letsencrypt_email" ]; then
            echo "LETSENCRYPT_EMAIL is empty, waiting for configuration before requesting the first certificate"
        else
            domain_args=''
            OLD_IFS="$IFS"
            IFS=','
            for domain in $ssl_domains; do
                domain="$(printf '%s' "$domain" | xargs)"
                if [ -n "$domain" ]; then
                    domain_args="${domain_args} -d ${domain}"
                fi
            done
            IFS="$OLD_IFS"

            if [ -n "$domain_args" ]; then
                staging_args=''
                if [ "${CERTBOT_STAGING:-false}" = 'true' ]; then
                    staging_args='--staging'
                fi

                set -- certbot certonly --non-interactive --agree-tos --no-eff-email \
                    --email "$letsencrypt_email" \
                    --webroot -w "$webroot_dir" \
                    --cert-name "$ssl_cert_name"

                for arg in $domain_args; do
                    set -- "$@" "$arg"
                done

                if [ -n "$staging_args" ]; then
                    set -- "$@" "$staging_args"
                fi

                echo "Requesting initial Let's Encrypt certificate for ${ssl_domains}"
                "$@"
            fi
        fi
    else
        echo "Existing certificate found for ${ssl_cert_name}, skipping initial issuance"
    fi
fi

while :; do
    certbot renew --non-interactive --webroot -w "$webroot_dir" || true
    sleep "$sleep_seconds"
done
