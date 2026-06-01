#!/usr/bin/env python3
"""
deploy.py — Deploy OctopilotWeb to both VPS instances safely.

Strategy (per instance):
  1. git pull
  2. Backup .next  →  .next.bak
  3. npm run build
  4. If build succeeds  → pm2 restart, delete .next.bak
     If build fails     → restore .next.bak, do NOT restart pm2
                          (server keeps running the last good build)

Usage:
  python deploy.py              # deploy both instances
  python deploy.py --formatter  # formatter only
  python deploy.py --web        # octopilot-web only
"""

import argparse
import socket
import sys
import time

import paramiko

# ── Config ────────────────────────────────────────────────────────────────────
HOST     = "187.124.92.119"
USER     = "root"
PASSWORD = "Brokewalk25@"
PM2      = "/root/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2"

INSTANCES = {
    "formatter": {"path": "/opt/octopilot-formatter", "pm2_id": "1"},
    "web":       {"path": "/opt/octopilot-web",       "pm2_id": "5"},
}

# Next.js build output markers that confirm a successful build
BUILD_SUCCESS_MARKERS = (
    "compiled successfully",
    "generating static pages",
    "route (app)",
    "prerendered as static",
)


# ── SSH helpers ───────────────────────────────────────────────────────────────
def connect(retries: int = 5) -> paramiko.SSHClient:
    for i in range(retries):
        try:
            socket.create_connection((HOST, 22), timeout=15).close()
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(HOST, username=USER, password=PASSWORD,
                      timeout=30, banner_timeout=90)
            # Keep session alive during long builds (ping every 30 s)
            transport = c.get_transport()
            if transport:
                transport.set_keepalive(30)
            return c
        except Exception as exc:
            print(f"  SSH attempt {i + 1}/{retries} failed: {exc}")
            if i < retries - 1:
                time.sleep(6)
    raise RuntimeError("Could not establish SSH connection after retries.")


def ensure_connected(c: paramiko.SSHClient) -> paramiko.SSHClient:
    """Return c if still alive, otherwise reconnect."""
    try:
        transport = c.get_transport()
        if transport and transport.is_active():
            return c
    except Exception:
        pass
    print("  SSH session dropped — reconnecting…")
    return connect()


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 300) -> tuple[int, str]:
    """Run a command; return (exit_code, stdout_text)."""
    print(f"  $ {cmd[:110]}")
    _, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    out  = stdout.read().decode("utf-8", errors="replace")
    err  = stderr.read().decode("utf-8", errors="replace")

    tail = out[-1500:].encode("ascii", errors="replace").decode()
    if tail.strip():
        print(tail)
    if err.strip() and code != 0:
        print("STDERR:", err[-400:].encode("ascii", errors="replace").decode())

    return code, out


# ── Deploy one instance ───────────────────────────────────────────────────────
def deploy_instance(
    c: paramiko.SSHClient, name: str, path: str, pm2_id: str
) -> tuple[bool, paramiko.SSHClient]:
    """
    Deploy one instance. Returns (success, client) — client may be a
    fresh reconnection if the session dropped during the long build.
    """
    print(f"\n{'='*60}")
    print(f"  Deploying: {name}  ({path})")
    print(f"{'='*60}")

    # 1. git pull
    code, _ = run(c, f"cd {path} && git pull 2>&1")
    if code != 0:
        print(f"  [WARN] git pull returned {code} — continuing anyway")

    # 2. Backup current .next
    run(c, f"rm -rf {path}/.next.bak && cp -a {path}/.next {path}/.next.bak 2>&1 || true")

    # Remove stale lock file so build doesn't abort immediately
    run(c, f"rm -f {path}/.next/lock 2>/dev/null || true")

    # 3. Build  (long — keepalive keeps session alive)
    print("  Building…")
    code, out = run(c, f"cd {path} && npm run build 2>&1", timeout=360)

    # 3a. Detect node_modules corruption and reinstall once
    if code != 0 and any(k in out.lower() for k in
                         ("not found", "cannot find module", "no such file")):
        print("  node_modules issue detected — reinstalling…")
        c = ensure_connected(c)
        run(c, f"cd {path} && rm -rf node_modules && npm install 2>&1", timeout=240)
        code, out = run(c, f"cd {path} && npm run build 2>&1", timeout=360)

    # 4. Reconnect if session dropped during build
    c = ensure_connected(c)

    # 5. Decide success/failure
    output_lower = out.lower()
    looks_ok = any(m in output_lower for m in BUILD_SUCCESS_MARKERS)

    if code != 0 and not looks_ok:
        print(f"\n  !! BUILD FAILED (exit {code}) !!")
        print("  Restoring previous .next …")
        run(c, f"rm -rf {path}/.next && mv {path}/.next.bak {path}/.next 2>&1 || true")
        print("  PM2 NOT restarted — server still running last good build.")
        return False, c

    if code != 0 and looks_ok:
        print(f"  [INFO] exit code {code} but build output looks successful — continuing.")

    # 6. Swap in new build and restart
    run(c, f"rm -rf {path}/.next.bak 2>/dev/null || true")
    print(f"\n  Build OK — restarting PM2 id:{pm2_id}")
    run(c, f"{PM2} restart {pm2_id} 2>&1")
    time.sleep(2)
    return True, c


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

    parser = argparse.ArgumentParser(description="Deploy OctopilotWeb to VPS")
    parser.add_argument("--formatter", action="store_true", help="Deploy formatter instance only")
    parser.add_argument("--web",       action="store_true", help="Deploy web instance only")
    args = parser.parse_args()

    if args.formatter and not args.web:
        targets = ["formatter"]
    elif args.web and not args.formatter:
        targets = ["web"]
    else:
        targets = ["formatter", "web"]

    print(f"Deploying instances: {', '.join(targets)}")
    print("Connecting to VPS…")
    c = connect()
    print("Connected.\n")

    results: dict[str, bool] = {}
    for name in targets:
        inst = INSTANCES[name]
        ok, c = deploy_instance(c, name, inst["path"], inst["pm2_id"])
        results[name] = ok
        # Small pause between instances so VPS isn't hammered
        if name != targets[-1]:
            print("\n  Waiting 5s before next instance…")
            time.sleep(5)
            c = ensure_connected(c)

    # Final PM2 status
    print(f"\n{'='*60}")
    print("  Final PM2 status:")
    print(f"{'='*60}")
    c = ensure_connected(c)
    run(c, f"{PM2} list 2>&1")
    c.close()

    # Summary
    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    all_ok = True
    for name, ok in results.items():
        status = "  OK" if ok else "  FAILED"
        print(f"  {name:20s} {status}")
        if not ok:
            all_ok = False
    print()

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
