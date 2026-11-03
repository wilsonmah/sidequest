FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SIDEQUEST_MODE=hosted SIDEQUEST_DB=/data/sidequest.sqlite3
WORKDIR /srv
COPY requirements.txt requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements-prod.txt
COPY app.py wsgi.py sidequest.py accounts.py billing.py ./
COPY dist ./dist
RUN useradd --create-home sidequest && mkdir -p /data && chown sidequest /data
USER sidequest
EXPOSE 8000
# SQLite needs a single machine; threads serve concurrent requests and WAL keeps reads non-blocking.
CMD ["sh", "-c", "gunicorn wsgi:app --bind 0.0.0.0:${PORT:-8000} --workers 2 --threads 4 --timeout 30 --access-logfile -"]
