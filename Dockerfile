FROM python:3.9-slim

WORKDIR /app

# Install Claude Code (simplified - actual install would need more setup)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -q \
    pytest \
    pytest-cov

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

ENTRYPOINT ["/bin/bash"]
CMD ["--help"]