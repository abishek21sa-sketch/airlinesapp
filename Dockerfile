# Backend API image -- FastAPI + DuckDB only. Deliberately does NOT include
# headless Chrome/Selenium: the automated daily data-check pipeline stays
# local (see DEPLOYMENT.md), so this image only ever needs to READ the
# warehouse file, never scrape or rebuild it.

FROM python:3.11-slim

WORKDIR /app

# Install deps first, separately from app code, so Docker's layer cache
# keeps this step cached across rebuilds unless requirements actually change
COPY requirements-deploy.txt .
RUN pip install --no-cache-dir -r requirements-deploy.txt

# Only what the deployed API actually needs -- not Data/, not frontend/,
# not pipeline/ (Selenium-dependent, local-only), not Notebooks/
COPY api/ ./api/
COPY config.py .

# Render/Railway both inject PORT at runtime -- uvicorn reads it via the
# shell-form CMD below so ${PORT} actually expands (exec-form CMD with a
# literal ["...", "$PORT"] would NOT expand it, and the container would
# fail to bind the port the platform expects).
#
# `exec` here is what makes uvicorn become PID 1 instead of the wrapping
# shell -- without it, a real Docker warning flagged on the actual build
# log ("JSONArgsRecommended... unintended behavior related to OS signals")
# means a stop/restart signal from the platform might not reach uvicorn
# cleanly. This keeps shell-form (for PORT expansion) while still getting
# correct signal handling.
ENV PORT=8000
EXPOSE 8000
CMD exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT}
