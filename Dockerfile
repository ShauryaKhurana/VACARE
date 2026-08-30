# syntax=docker/dockerfile:1
# One public URL: Next.js UI + Python API. The only required secret is GEMINI_API_KEY.

FROM node:20-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/veteran-app/package.json frontend/veteran-app/package-lock.json ./
RUN npm ci
COPY frontend/veteran-app ./
ENV NEXT_TELEMETRY_DISABLED=1
# Same-origin: the browser calls /api, and next.config rewrites that to Python.
ENV NEXT_PUBLIC_API_BASE_URL=/
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /app/requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

COPY schema /app/schema
COPY src /app/src
COPY scripts/docker-start.sh /app/scripts/docker-start.sh
RUN chmod +x /app/scripts/docker-start.sh \
    && mkdir -p /app/data/uploads /app/data/parse_cache /app/form_cache

COPY --from=frontend /frontend/.next/standalone /app/web
COPY --from=frontend /frontend/.next/static /app/web/.next/static
COPY --from=frontend /frontend/public /app/web/public

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV VACARE_API_PORT=8000
ENV VACARE_DB_PATH=/app/data/vacare.db
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV VA_USE_MOCK=true
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000
CMD ["/app/scripts/docker-start.sh"]
