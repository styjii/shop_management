#!/usr/bin/env bash
# Periodic housekeeping for Shop Management (run by cron, see README "Maintenance planifiée").
#
#   maintenance.sh            purge expired JWT tokens and expired Django sessions
#   maintenance.sh --check    exit 1 if the last successful run is too old (monitoring)
#
# - flushexpiredtokens: deletes the Simple JWT tokens whose expiry date is past. Tokens that
#   are still valid, and revoked tokens that have not expired yet, are kept (they must stay
#   refused).
# - clearsessions: deletes the Django sessions (admin) that have expired.
#
# Safe to run twice: a lock skips the second run while the first one is still working.
# Messages go to syslog/journald (tag "shop-maintenance"); failures also go to stderr, so
# cron can e-mail them (MAILTO) and the exit code is non-zero.

set -uo pipefail

TAG="shop-maintenance"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PYTHON="${PYTHON:-$APP_DIR/.venv/bin/python}"
STATE_DIR="${STATE_DIR:-/var/lib/shop-management}"
LOCK_FILE="${LOCK_FILE:-$STATE_DIR/maintenance.lock}"
SUCCESS_FILE="${SUCCESS_FILE:-$STATE_DIR/last_success}"
COMMAND_TIMEOUT="${COMMAND_TIMEOUT:-600}"   # seconds allowed for each command
MAX_AGE_HOURS="${MAX_AGE_HOURS:-36}"        # --check: maximum age of the last success

log() {  # log <priority> <message>
    local priority="$1"; shift
    if command -v logger >/dev/null 2>&1; then
        logger -t "$TAG" -p "user.$priority" -- "$*"
    else
        echo "$(date -Is) $TAG [$priority] $*" >&2
    fi
}

fail() {  # fail <message>: syslog + stderr (cron mail) + non-zero exit
    log err "$*"
    echo "$TAG: $*" >&2
    exit 1
}

# Load KEY=VALUE lines (quoted or not, no shell evaluation) without overriding variables
# that are already set in the environment.
load_env_file() {
    local line key value
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in ''|'#'*) continue ;; esac
        key="${line%%=*}"
        value="${line#*=}"
        key="${key//[[:space:]]/}"
        [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
        value="${value#\"}"; value="${value%\"}"
        value="${value#\'}"; value="${value%\'}"
        [ -z "${!key+x}" ] && export "$key=$value"
    done < "$1"
}

check_last_success() {
    [ -f "$SUCCESS_FILE" ] || fail "aucune exécution réussie enregistrée ($SUCCESS_FILE absent)"
    local age=$(( $(date +%s) - $(stat -c %Y "$SUCCESS_FILE") ))
    if [ "$age" -gt $(( MAX_AGE_HOURS * 3600 )) ]; then
        fail "dernière exécution réussie il y a $(( age / 3600 )) h (limite : ${MAX_AGE_HOURS} h)"
    fi
    echo "OK : dernière exécution réussie il y a $(( age / 60 )) min"
}

if [ "${1:-}" = "--check" ]; then
    check_last_success
    exit 0
fi

[ -x "$PYTHON" ] || fail "interpréteur Python introuvable : $PYTHON (variable PYTHON)"
[ -f "$APP_DIR/backend/manage.py" ] || fail "manage.py introuvable dans $APP_DIR/backend (variable APP_DIR)"

ENV_FILE="${ENV_FILE:-}"
if [ -z "$ENV_FILE" ]; then
    for candidate in "$APP_DIR/.env" "$APP_DIR/backend/.env"; do
        [ -f "$candidate" ] && { ENV_FILE="$candidate"; break; }
    done
fi
if [ -n "$ENV_FILE" ]; then
    [ -r "$ENV_FILE" ] || fail "fichier d'environnement illisible : $ENV_FILE"
    load_env_file "$ENV_FILE"
fi

mkdir -p "$STATE_DIR" 2>/dev/null || fail "impossible de créer $STATE_DIR"

# No concurrent runs: a second invocation exits quietly while the first is still running.
exec 9>"$LOCK_FILE" || fail "impossible d'ouvrir le verrou $LOCK_FILE"
if ! flock -n 9; then
    log warning "exécution précédente encore en cours : celle-ci est ignorée"
    exit 0
fi

failures=0
run_step() {  # run_step <django command>
    local name="$1" output status
    log info "début : $name"
    output=$(cd "$APP_DIR/backend" && timeout "$COMMAND_TIMEOUT" "$PYTHON" manage.py "$name" 2>&1)
    status=$?
    if [ "$status" -eq 0 ]; then
        log info "terminé : $name ${output:+($(echo "$output" | tr '\n' ' '))}"
    else
        failures=$(( failures + 1 ))
        log err "ÉCHEC : $name (code $status) $(echo "$output" | tail -n 5 | tr '\n' ' ')"
        echo "$TAG: échec de $name (code $status)" >&2
        echo "$output" | tail -n 20 >&2
    fi
}

# Both commands always run, even if the first one fails.
run_step flushexpiredtokens
run_step clearsessions

if [ "$failures" -gt 0 ]; then
    exit 1
fi
touch "$SUCCESS_FILE"
log info "maintenance terminée sans erreur"
