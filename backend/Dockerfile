FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8010

WORKDIR /app

RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install requirements
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and static data
COPY backend/app ./app
COPY data ./data

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8010

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8010/api/healthz')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010", "--proxy-headers", "--forwarded-allow-ips=*"]

