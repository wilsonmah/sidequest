"""Production entry point: gunicorn wsgi:app (see DEPLOY.md)."""
from app import create_app

app = create_app()
