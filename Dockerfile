# Samba 4 AD Manager — Dockerfile
# Python 3.12 + Samba 4 tooling for development and production

FROM python:3.12-slim

LABEL maintainer="Samba 4 AD Manager"
LABEL description="Web management portal for Samba 4 Active Directory DC"

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    samba \
    smbclient \
    ldap-utils \
    dnsutils \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    fastapi uvicorn[standard] pydantic pydantic-settings ldap3 psutil

# Copy application code
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Set Python path
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
