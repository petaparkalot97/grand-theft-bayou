FROM python:3.11-slim

# Install system dependencies (ffmpeg is required for Discord voice & music)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot files
COPY . .

# Force headless mode (no TUI dashboard)
ENV LISA_HEADLESS=1

# Run Lisa bot
CMD ["python", "main.py", "--headless"]
