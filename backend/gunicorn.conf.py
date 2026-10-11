"""Gunicorn configuration: `gunicorn core.wsgi -c gunicorn.conf.py` (behind Nginx)."""

bind = "127.0.0.1:8000"  # never exposed directly: Nginx is the only entry point
workers = 3
timeout = 30
graceful_timeout = 30
max_requests = 1000  # recycle workers regularly
max_requests_jitter = 100
accesslog = "-"
errorlog = "-"
limit_request_line = 4094
limit_request_fields = 50
