FROM python:3.11

WORKDIR /app

COPY docker_requirements.txt .
RUN pip install --no-cache-dir -r docker_requirements.txt

COPY . .

ENV PYTHONPATH=/app

# Expose the port your app runs on (usually 8000 for FastAPI)
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]