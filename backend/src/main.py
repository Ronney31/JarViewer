"""
JarViewer Backend - FastAPI Application
Enterprise-grade JAR file analyzer with security-first approach
"""

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from .api.routes import api_router
from .core.config import get_settings
from .core.logging import setup_logging
from .core.security import SecurityMiddleware

# Initialize structured logging
setup_logging()
logger = structlog.get_logger()

# Prometheus metrics
REQUEST_COUNT = Counter('jarviewer_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
REQUEST_DURATION = Histogram('jarviewer_request_duration_seconds', 'Request duration')

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Startup
    logger.info("Starting JarViewer backend", version=app.version)
    app.state.start_time = time.time()
    
    yield
    
    # Shutdown
    logger.info("Shutting down JarViewer backend")


# Create FastAPI application
app = FastAPI(
    title="JarViewer API",
    description="Enterprise-grade JAR file analyzer backend",
    version="1.0.0",
    docs_url=None,  # We'll create custom docs
    redoc_url=None,  # We'll create custom redoc
    lifespan=lifespan,
)

# Security middleware
app.add_middleware(SecurityMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Trusted host middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts_list,
)


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Request logging and metrics middleware."""
    start_time = time.time()
    
    # Generate correlation ID
    correlation_id = request.headers.get("x-correlation-id", f"req-{int(time.time() * 1000)}")
    
    # Log request
    logger.info(
        "request_started",
        correlation_id=correlation_id,
        method=request.method,
        url=str(request.url),
        user_agent=request.headers.get("user-agent"),
    )
    
    try:
        response = await call_next(request)
        
        # Calculate duration
        duration = time.time() - start_time
        
        # Update metrics
        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()
        REQUEST_DURATION.observe(duration)
        
        # Log response
        logger.info(
            "request_completed",
            correlation_id=correlation_id,
            status_code=response.status_code,
            duration=duration,
        )
        
        # Add correlation ID to response headers
        response.headers["x-correlation-id"] = correlation_id
        
        return response
        
    except Exception as e:
        duration = time.time() - start_time
        
        logger.error(
            "request_failed",
            correlation_id=correlation_id,
            error=str(e),
            error_type=type(e).__name__,
            duration=duration,
        )
        
        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=request.url.path,
            status=500
        ).inc()
        
        raise


# Health check endpoints
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "JarViewer API",
        "version": app.version,
        "description": "Enterprise-grade JAR file analyzer backend",
        "docs": "/docs",
        "health": "/health",
        "api": "/api/v1",
        "status": "running",
        "timestamp": time.time(),
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    start_time = getattr(app.state, 'start_time', time.time())
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "version": app.version,
        "uptime": time.time() - start_time,
    }


@app.get("/ready")
async def readiness_check():
    """Readiness check endpoint."""
    # Add any readiness checks here (database, external services, etc.)
    return {
        "status": "ready",
        "timestamp": time.time(),
        "checks": {
            "temp_directory": True,  # Add actual check
            "memory": True,  # Add actual check
        }
    }


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return JSONResponse(
        content=generate_latest().decode('utf-8'),
        media_type=CONTENT_TYPE_LATEST,
    )


@app.get("/docs", response_class=HTMLResponse)
async def custom_swagger_ui_html():
    """Custom Swagger UI that works without external CDN dependencies."""
    return HTMLResponse("""
    <!DOCTYPE html>
    <html>
    <head>
        <title>JarViewer API - Documentation</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {
                margin: 0;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #fafafa;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                padding: 30px;
            }
            h1 {
                color: #333;
                border-bottom: 2px solid #007acc;
                padding-bottom: 10px;
            }
            .endpoint {
                margin: 20px 0;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 5px;
                background: #f9f9f9;
            }
            .method {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 3px;
                color: white;
                font-weight: bold;
                margin-right: 10px;
            }
            .get { background-color: #61affe; }
            .post { background-color: #49cc90; }
            .delete { background-color: #f93e3e; }
            .path {
                font-family: monospace;
                font-size: 14px;
                color: #333;
            }
            .description {
                margin-top: 8px;
                color: #666;
            }
            .test-btn {
                background: #007acc;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;
            }
            .test-btn:hover {
                background: #005a9e;
            }
            .status {
                margin-top: 20px;
                padding: 15px;
                background: #e8f5e8;
                border-left: 4px solid #4caf50;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔧 JarViewer API Documentation</h1>
            <div class="status">
                <strong>✅ API Status:</strong> All endpoints are operational<br>
                <strong>📊 Version:</strong> 1.0.0<br>
                <strong>🔗 Base URL:</strong> http://localhost:8000
            </div>
            
            <h2>📋 Available Endpoints</h2>
            
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/</span>
                <div class="description">API information and status</div>
                <button class="test-btn" onclick="testEndpoint('/')">Test</button>
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/health</span>
                <div class="description">Health check endpoint</div>
                <button class="test-btn" onclick="testEndpoint('/health')">Test</button>
            </div>
            
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="path">/api/v1/jars/upload</span>
                <div class="description">Upload and process a JAR file</div>
                <div style="margin-top: 8px;">
                    <input type="file" id="jarFile" accept=".jar" style="margin-right: 10px;">
                    <button class="test-btn" onclick="uploadJar()">Upload JAR</button>
                </div>
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/v1/jars/{jar_id}/files/content</span>
                <div class="description">Get file content from a JAR</div>
                <div style="margin-top: 8px;">
                    <input type="text" id="jarId1" placeholder="JAR ID" style="margin-right: 5px;">
                    <input type="text" id="filePath" placeholder="File path" style="margin-right: 5px;">
                    <button class="test-btn" onclick="getFileContent()">Get Content</button>
                </div>
            </div>
            
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="path">/api/v1/jars/{jar_id}/decompile</span>
                <div class="description">Decompile a class file using CFR</div>
                <div style="margin-top: 8px;">
                    <input type="text" id="jarId2" placeholder="JAR ID" style="margin-right: 5px;">
                    <input type="text" id="classPath" placeholder="Class path" style="margin-right: 5px;">
                    <button class="test-btn" onclick="decompileClass()">Decompile</button>
                </div>
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/v1/jars/{jar_id}/search</span>
                <div class="description">Search files in a JAR</div>
                <div style="margin-top: 8px;">
                    <input type="text" id="jarId3" placeholder="JAR ID" style="margin-right: 5px;">
                    <input type="text" id="searchQuery" placeholder="Search query" style="margin-right: 5px;">
                    <button class="test-btn" onclick="searchFiles()">Search</button>
                </div>
            </div>
            
            <div id="result" style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 5px; display: none;">
                <h3>📄 Response:</h3>
                <pre id="resultContent" style="white-space: pre-wrap; word-wrap: break-word;"></pre>
            </div>
        </div>
        
        <script>
            function showResult(data) {
                document.getElementById('result').style.display = 'block';
                document.getElementById('resultContent').textContent = JSON.stringify(data, null, 2);
            }
            
            async function testEndpoint(path) {
                try {
                    const response = await fetch(path);
                    const data = await response.json();
                    showResult(data);
                } catch (error) {
                    showResult({error: error.message});
                }
            }
            
            async function uploadJar() {
                const fileInput = document.getElementById('jarFile');
                if (!fileInput.files[0]) {
                    alert('Please select a JAR file');
                    return;
                }
                
                const formData = new FormData();
                formData.append('file', fileInput.files[0]);
                
                try {
                    const response = await fetch('/api/v1/jars/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    showResult(data);
                } catch (error) {
                    showResult({error: error.message});
                }
            }
            
            async function getFileContent() {
                const jarId = document.getElementById('jarId1').value;
                const filePath = document.getElementById('filePath').value;
                if (!jarId || !filePath) {
                    alert('Please enter JAR ID and file path');
                    return;
                }
                
                try {
                    const response = await fetch(`/api/v1/jars/${jarId}/files/content?path=${encodeURIComponent(filePath)}`);
                    const data = await response.json();
                    showResult(data);
                } catch (error) {
                    showResult({error: error.message});
                }
            }
            
            async function decompileClass() {
                const jarId = document.getElementById('jarId2').value;
                const classPath = document.getElementById('classPath').value;
                if (!jarId || !classPath) {
                    alert('Please enter JAR ID and class path');
                    return;
                }
                
                try {
                    const response = await fetch(`/api/v1/jars/${jarId}/decompile?path=${encodeURIComponent(classPath)}`, {
                        method: 'POST'
                    });
                    const data = await response.json();
                    showResult(data);
                } catch (error) {
                    showResult({error: error.message});
                }
            }
            
            async function searchFiles() {
                const jarId = document.getElementById('jarId3').value;
                const query = document.getElementById('searchQuery').value;
                if (!jarId || !query) {
                    alert('Please enter JAR ID and search query');
                    return;
                }
                
                try {
                    const response = await fetch(`/api/v1/jars/${jarId}/search?q=${encodeURIComponent(query)}`);
                    const data = await response.json();
                    showResult(data);
                } catch (error) {
                    showResult({error: error.message});
                }
            }
        </script>
    </body>
    </html>
    """)


@app.get("/redoc", response_class=HTMLResponse)
async def custom_redoc_html():
    """Custom ReDoc documentation."""
    return HTMLResponse("""
    <!DOCTYPE html>
    <html>
    <head>
        <title>JarViewer API - ReDoc</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { margin: 0; padding: 0; }
        </style>
    </head>
    <body>
        <div id="redoc-container"></div>
        <script>
            // Simple fallback documentation
            document.getElementById('redoc-container').innerHTML = `
                <div style="padding: 40px; font-family: Arial, sans-serif;">
                    <h1>JarViewer API Documentation</h1>
                    <p>For interactive API documentation, please visit <a href="/docs">/docs</a></p>
                    <p>For OpenAPI specification, visit <a href="/openapi.json">/openapi.json</a></p>
                </div>
            `;
        </script>
    </body>
    </html>
    """)


# Include API routes
app.include_router(api_router, prefix="/api/v1")


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler."""
    correlation_id = request.headers.get("x-correlation-id", "unknown")
    
    logger.error(
        "unhandled_exception",
        correlation_id=correlation_id,
        error=str(exc),
        error_type=type(exc).__name__,
        url=str(request.url),
    )
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "correlation_id": correlation_id,
            "timestamp": time.time(),
        },
        headers={"x-correlation-id": correlation_id},
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development",
        log_config=None,  # Use our custom logging
    )
