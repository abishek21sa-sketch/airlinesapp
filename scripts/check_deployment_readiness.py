#!/usr/bin/env python3
"""
Deployment readiness check -- run this locally before attempting a real
Render/Railway/Vercel deploy. Zero required installs beyond Python 3 itself
(PyYAML is used if already present, skipped gracefully if not).

Usage:
    python scripts/check_deployment_readiness.py

Exit code 0 if everything required is in place, 1 if something needs
fixing -- safe to wire into a pre-deploy habit or a CI step.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Windows' default console codepage (cp1252) can't encode the checkmark/
# cross characters below and crashes with UnicodeEncodeError before any
# output prints -- reconfigure stdout to UTF-8 so this runs from a fresh
# PowerShell/cmd window with no env var workaround needed.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
CHECK = "\u2713"
CROSS = "\u2717"
WARN = "!"

failures: list[str] = []
warnings: list[str] = []


def ok(msg: str) -> None:
    print(f"  {CHECK} {msg}")


def fail(msg: str) -> None:
    print(f"  {CROSS} {msg}")
    failures.append(msg)


def warn(msg: str) -> None:
    print(f"  {WARN} {msg}")
    warnings.append(msg)


def section(title: str) -> None:
    print(f"\n{title}")


# ---- 1. Required deployment files exist ----
section("Deployment files")
required_files = [
    "Dockerfile", ".dockerignore", "render.yaml", "requirements-deploy.txt",
    ".gitignore", "DEPLOYMENT.md", ".env.example", "scripts/smoke_test.py",
]
for name in required_files:
    if (ROOT / name).exists():
        ok(f"{name} present")
    else:
        fail(f"{name} MISSING")

if (ROOT / "frontend" / ".env.local.example").exists():
    ok("frontend/.env.local.example present")
else:
    fail("frontend/.env.local.example MISSING")


# ---- 2. .gitignore actually covers the things that matter ----
section("Secrets and bulk data are excluded from git")
gitignore_path = ROOT / ".gitignore"
if gitignore_path.exists():
    gitignore_text = gitignore_path.read_text()
    must_cover = [".env", "Data/", "node_modules/", "__pycache__/"]
    for pattern in must_cover:
        if pattern in gitignore_text:
            ok(f".gitignore covers '{pattern}'")
        else:
            fail(f".gitignore does NOT mention '{pattern}' -- real risk of committing it")
else:
    fail(".gitignore missing entirely -- do not push to GitHub yet")


# ---- 3. config.py actually imports and resolves paths ----
section("config.py imports and resolves correctly")
sys.path.insert(0, str(ROOT))
try:
    import config  # noqa: E402
    ok("config.py imports cleanly")
    ok(f"DUCKDB_FILE resolves to: {config.DUCKDB_FILE}")

    if config.DUCKDB_FILE.exists():
        size_bytes = config.DUCKDB_FILE.stat().st_size
        size_gb = size_bytes / (1024 ** 3)
        ok(f"Warehouse file found locally -- {size_gb:.2f} GB")
        print(f"      -> size your persistent disk to at least {max(1, int(size_gb) + 2)}GB "
              f"(real size + real headroom, not the exact number)")
    else:
        warn(f"Warehouse file not found at {config.DUCKDB_FILE} -- fine if you haven't "
             f"built it locally yet, but you'll need its real size before sizing a disk")
except Exception as exc:
    fail(f"config.py failed to import: {exc}")


# ---- 4. render.yaml is valid, and points at real things ----
section("render.yaml validity")
render_yaml_path = ROOT / "render.yaml"
if render_yaml_path.exists():
    try:
        import yaml  # type: ignore
        data = yaml.safe_load(render_yaml_path.read_text())
        ok("render.yaml parses as valid YAML")
        services = data.get("services", [])
        if services:
            svc = services[0]
            if svc.get("dockerfilePath", "").lstrip("./") == "Dockerfile":
                dockerfile_ref = svc.get("dockerfilePath")
                if (ROOT / dockerfile_ref.lstrip("./")).exists():
                    ok(f"render.yaml's dockerfilePath ({dockerfile_ref}) points at a real file")
                else:
                    fail(f"render.yaml's dockerfilePath ({dockerfile_ref}) does not exist")
            health_path = svc.get("healthCheckPath")
            if health_path:
                main_py = (ROOT / "api" / "main.py")
                if main_py.exists() and health_path.strip('"') in main_py.read_text():
                    ok(f"healthCheckPath ({health_path}) matches a real route in api/main.py")
                else:
                    warn(f"Could not confirm healthCheckPath ({health_path}) exists as a route")
        else:
            fail("render.yaml has no services defined")
    except ImportError:
        warn("PyYAML not installed locally -- skipping render.yaml structural validation "
             "(the file itself is still there, just not parsed)")
    except Exception as exc:
        fail(f"render.yaml failed to parse: {exc}")
else:
    fail("render.yaml missing")


# ---- 5. requirements-deploy.txt doesn't accidentally include heavy,
#         pipeline-only dependencies that don't belong in the deployed image ----
section("requirements-deploy.txt stays lean")
req_deploy_path = ROOT / "requirements-deploy.txt"
if req_deploy_path.exists():
    dependency_lines = [
        line.strip().lower() for line in req_deploy_path.read_text().splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    should_not_include = ["pandas", "streamlit", "matplotlib", "selenium", "webdriver-manager"]
    leaked = [pkg for pkg in should_not_include if any(pkg in line for line in dependency_lines)]
    if leaked:
        warn(f"requirements-deploy.txt actually declares {leaked} as dependencies -- confirm "
             f"these are really needed by api/*.py before deploying, they bloat the image if not")
    else:
        ok("No pipeline/analyst-console-only dependencies leaked into the deploy manifest")


# ---- 6. main.py actually reads the env vars this whole setup depends on ----
section("main.py wiring")
main_py_path = ROOT / "api" / "main.py"
if main_py_path.exists():
    main_text = main_py_path.read_text()
    checks = [
        ("CORS_ALLOWED_ORIGINS", "CORS origin is configurable, not hardcoded"),
        ("rate_limit_copilot", "Copilot rate limiting is wired in"),
    ]
    for needle, label in checks:
        if needle in main_text:
            ok(label)
        else:
            fail(f"{label} -- '{needle}' not found in api/main.py")
else:
    fail("api/main.py not found")


# ---- 7. Local .env actually has a real key (not the placeholder) ----
section("Local secrets (informational -- deployment uses the host's own env vars, not this file)")
env_path = ROOT / ".env"
if env_path.exists():
    env_text = env_path.read_text()
    if "replace_with_your_private_key" in env_text:
        warn(".env still has the placeholder ANTHROPIC_API_KEY -- fine for now, just "
             "confirm the REAL key is set in Render/Railway's dashboard directly for deployment")
    else:
        ok(".env has a real-looking key set locally")
else:
    warn(".env not found locally -- copy .env.example to .env and fill in your real key "
         "for local dev; deployment itself uses the host's env var system instead")


# ---- Summary ----
section("Summary")
if failures:
    print(f"\n{len(failures)} thing(s) need fixing before deploying:")
    for f in failures:
        print(f"  - {f}")
if warnings:
    print(f"\n{len(warnings)} thing(s) worth a look (not blocking):")
    for w in warnings:
        print(f"  - {w}")
if not failures and not warnings:
    print("\nEverything checked out clean.")

sys.exit(1 if failures else 0)
