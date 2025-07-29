# Backend API Reference

## Table of Contents

1. [API Overview](#api-overview)
2. [Authentication](#authentication)
3. [Core Endpoints](#core-endpoints)
4. [Performance Monitoring](#performance-monitoring)
5. [Error Handling](#error-handling)
6. [Data Models](#data-models)
7. [Code Examples](#code-examples)

## API Overview

### Base URL
- Development: `http://localhost:9000`
- Production: `https://your-domain.com`

### API Version
- Current Version: `v1`
- Base Path: `/api/v1`

### Content Types
- Request: `application/json`, `multipart/form-data` (for file uploads)
- Response: `application/json`

### Rate Limiting
- Default: 100 requests per minute per IP
- Authenticated: 1000 requests per minute per user

## Authentication

Currently, the API does not require authentication for development. In production, implement JWT-based authentication.

### Future Authentication Headers
```http
Authorization: Bearer <jwt-token>
X-API-Key: <api-key>
```

## Core Endpoints

### Health Check

#### GET /health

**Purpose:** Check system health and service status.

**Why this endpoint exists:**
- Load balancers need health checks for routing decisions
- Monitoring systems need to verify service availability
- Developers need to verify service dependencies (Redis, etc.)

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1753786686.8424704,
  "version": "1.0.0",
  "uptime": 497.0619390010834,
  "cache": {
    "status": "healthy",
    "redis_connected": true,
    "redis_version": "7.4.5",
    "used_memory": "1.03M",
    "connected_clients": 1,
    "keyspace_hits": 0,
    "keyspace_misses": 0
  },
  "performance_monitoring": {
    "enabled": true,
    "retention_hours": 24
  }
}
```

**Status Codes:**
- `200 OK`: Service is healthy
- `503 Service Unavailable`: Service is unhealthy

**5 Whys Analysis:**

1. **Why include cache status in health check?**
   - Cache failures can significantly impact performance and user experience

2. **Why include Redis connection details?**
   - Redis connectivity issues are common deployment problems
   - Memory usage helps identify potential cache sizing issues

3. **Why include performance monitoring status?**
   - Performance monitoring is critical for production operations
   - Helps verify monitoring configuration is working

4. **Why include uptime?**
   - Helps identify frequent restarts or stability issues
   - Useful for debugging deployment problems

5. **Why return detailed status instead of simple OK/ERROR?**
   - Detailed information helps with troubleshooting
   - Monitoring systems can make better decisions with more context

### JAR Upload and Analysis

#### POST /api/v1/jars/upload

**Purpose:** Upload a JAR file for analysis.

**Request:**
```http
POST /api/v1/jars/upload
Content-Type: multipart/form-data

file: <jar-file>
```

**Response:**
```json
{
  "jar_id": "uuid-string",
  "filename": "example.jar",
  "size": 1048576,
  "status": "uploaded",
  "analysis_url": "/api/v1/jars/uuid-string/analysis"
}
```

**Implementation Details:**

```python
@router.post("/upload")
async def upload_jar(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
) -> JSONResponse:
    """
    Upload and process a JAR file.
    
    Why async: File upload and initial processing can be time-consuming
    Why background_tasks: Analysis continues after response is sent
    Why UploadFile: Handles streaming upload for large files
    """
    
    # Validate file
    if not file.filename or not file.filename.endswith('.jar'):
        raise HTTPException(
            status_code=400, 
            detail="Invalid file type. Only JAR files are supported."
        )
    
    # Check file size
    if file.size > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE} bytes"
        )
    
    # Generate unique ID
    jar_id = str(uuid.uuid4())
    
    # Save file
    jar_path = await jar_service.save_uploaded_file(file, jar_id)
    
    # Start background analysis
    background_tasks.add_task(
        jar_service.analyze_jar_async,
        jar_id,
        jar_path
    )
    
    return JSONResponse({
        "jar_id": jar_id,
        "filename": file.filename,
        "size": file.size,
        "status": "uploaded",
        "analysis_url": f"/api/v1/jars/{jar_id}/analysis"
    })
```

**5 Whys Analysis:**

1. **Why use background tasks for analysis?**
   - JAR analysis can take several minutes for large files
   - Users shouldn't wait for complete analysis before getting a response

2. **Why validate file type and size?**
   - Prevents resource exhaustion from malicious uploads
   - Ensures only valid JAR files are processed

3. **Why generate UUID for jar_id?**
   - Prevents enumeration attacks
   - Ensures uniqueness across distributed systems
   - No dependency on database sequences

4. **Why return analysis_url in response?**
   - Provides clear next step for client applications
   - Follows REST principles for resource discovery

5. **Why use streaming upload (UploadFile)?**
   - Handles large files efficiently without loading entire file into memory
   - Better performance and resource usage

#### GET /api/v1/jars/{jar_id}/analysis/comprehensive

**Purpose:** Get comprehensive dependency analysis results.

**Parameters:**
- `jar_id` (path): Unique identifier for the JAR file

**Response:**
```json
{
  "jar_id": "uuid-string",
  "status": "completed",
  "analysis": {
    "dependencyTree": {
      "jar_id": "uuid-string",
      "root_dependencies": [...],
      "all_dependencies": {...},
      "conflicts": [...],
      "total_dependencies": 150,
      "max_depth": 5
    },
    "summary": {
      "total_dependencies": 150,
      "direct_dependencies": 25,
      "transitive_dependencies": 125,
      "conflicts_count": 3,
      "risk_level": "medium",
      "scope_breakdown": {
        "compile": 100,
        "runtime": 30,
        "test": 20
      }
    },
    "conflicts": [...],
    "recommendations": [...]
  },
  "cached": true,
  "analysis_time_ms": 1250
}
```

**Implementation Details:**

```python
@router.get("/{jar_id}/analysis/comprehensive")
async def get_comprehensive_analysis(jar_id: str) -> JSONResponse:
    """
    Get comprehensive dependency analysis results.
    
    Why comprehensive: Provides all analysis data in single request
    Why caching: Analysis is expensive and results don't change
    Why include timing: Helps with performance monitoring
    """
    
    async with performance_service.monitor_operation(
        "get_comprehensive_analysis",
        {"jar_id": jar_id}
    ):
        try:
            # Check if JAR exists
            jar_info = await jar_service.get_jar_info(jar_id)
            if not jar_info:
                raise HTTPException(
                    status_code=404,
                    detail=f"JAR not found: {jar_id}"
                )
            
            # Get cached results first
            cache_key = f"analysis:{jar_id}:{jar_info.file_hash}"
            cached_result = await cache_service.get(cache_key)
            
            if cached_result:
                logger.info("Returning cached analysis", jar_id=jar_id)
                return JSONResponse({
                    **cached_result,
                    "cached": True
                })
            
            # Perform analysis
            start_time = time.time()
            
            analysis_result = await comprehensive_dependency_service.analyze_comprehensive_dependencies(
                jar_info.extracted_path,
                jar_info.size,
                jar_id
            )
            
            analysis_time_ms = (time.time() - start_time) * 1000
            
            # Build response
            response_data = {
                "jar_id": jar_id,
                "status": "completed",
                "analysis": analysis_result.to_dict(),
                "cached": False,
                "analysis_time_ms": analysis_time_ms
            }
            
            # Cache the result
            await cache_service.set(
                cache_key,
                response_data,
                ttl=3600  # 1 hour
            )
            
            return JSONResponse(response_data)
            
        except Exception as e:
            logger.error("Analysis failed", jar_id=jar_id, error=str(e))
            raise HTTPException(
                status_code=500,
                detail=f"Analysis failed: {str(e)}"
            )
```

**5 Whys Analysis:**

1. **Why check cache before analysis?**
   - Analysis is computationally expensive (can take minutes)
   - Results don't change for the same JAR file
   - Improves user experience with faster responses

2. **Why include file_hash in cache key?**
   - Same filename might contain different content
   - Ensures cache invalidation when file changes
   - Prevents serving stale results

3. **Why monitor operation performance?**
   - Analysis performance varies significantly with JAR size
   - Helps identify performance bottlenecks
   - Enables optimization decisions

4. **Why return analysis_time_ms?**
   - Helps users understand why some analyses take longer
   - Useful for debugging performance issues
   - Provides transparency about system performance

5. **Why use comprehensive analysis instead of separate endpoints?**
   - Reduces number of API calls needed
   - Provides complete picture in single request
   - Better for user experience and performance

### Dependency Search

#### GET /api/v1/jars/{jar_id}/dependencies/search

**Purpose:** Search dependencies within a JAR's dependency tree.

**Parameters:**
- `jar_id` (path): Unique identifier for the JAR file
- `q` (query): Search query string
- `fields` (query): Comma-separated list of fields to search (optional)
- `max_results` (query): Maximum number of results (default: 100)
- `highlight` (query): Enable result highlighting (default: true)

**Example Request:**
```http
GET /api/v1/jars/uuid-string/dependencies/search?q=spring&fields=name,description&max_results=50&highlight=true
```

**Response:**
```json
{
  "query": "spring",
  "total_results": 15,
  "results": [
    {
      "dependency": {
        "id": "dep-uuid",
        "group_id": "org.springframework",
        "artifact_id": "spring-core",
        "version": "5.3.21",
        "scope": "compile",
        "description": "Spring Framework Core"
      },
      "matches": [
        {
          "field": "group_id",
          "match": "spring",
          "start_position": 4,
          "end_position": 10,
          "field_value": "org.springframework"
        }
      ],
      "score": 8.5
    }
  ],
  "search_time_ms": 45,
  "cached": false
}
```

**Implementation Details:**

```python
@router.get("/{jar_id}/dependencies/search")
async def search_dependencies(
    jar_id: str,
    q: str = Query(..., description="Search query"),
    fields: Optional[str] = Query(None, description="Fields to search"),
    max_results: int = Query(100, ge=1, le=1000),
    highlight: bool = Query(True)
) -> JSONResponse:
    """
    Search dependencies with highlighting and scoring.
    
    Why separate search endpoint: Search has different caching and performance characteristics
    Why highlighting: Helps users understand why results matched
    Why scoring: Provides relevance ranking for better user experience
    """
    
    async with performance_service.monitor_operation(
        "search_dependencies",
        {"jar_id": jar_id, "query": q, "max_results": max_results}
    ):
        try:
            # Get dependency tree
            dependency_tree = await dependency_tree_service.get_dependency_tree(jar_id)
            if not dependency_tree:
                raise HTTPException(
                    status_code=404,
                    detail=f"Dependency tree not found for JAR: {jar_id}"
                )
            
            # Parse search fields
            search_fields = []
            if fields:
                field_names = [f.strip() for f in fields.split(',')]
                search_fields = [SearchField(f) for f in field_names if f in SearchField.__members__]
            
            # Perform search
            start_time = time.time()
            
            search_results = await dependency_search_service.search_dependencies(
                dependency_tree,
                q,
                search_fields or [SearchField.ALL],
                max_results,
                highlight
            )
            
            search_time_ms = (time.time() - start_time) * 1000
            
            # Build response
            return JSONResponse({
                "query": q,
                "total_results": len(search_results),
                "results": [result.to_dict() for result in search_results],
                "search_time_ms": search_time_ms,
                "cached": False  # TODO: Implement search result caching
            })
            
        except Exception as e:
            logger.error("Search failed", jar_id=jar_id, query=q, error=str(e))
            raise HTTPException(
                status_code=500,
                detail=f"Search failed: {str(e)}"
            )
```

**5 Whys Analysis:**

1. **Why separate search endpoint instead of filtering in main analysis?**
   - Search has different performance characteristics and caching needs
   - Allows for specialized search optimizations (indexing, highlighting)
   - Better API design with focused responsibilities

2. **Why include highlighting in search results?**
   - Users need to understand why results matched their query
   - Improves user experience by showing relevant parts
   - Helps users refine their search queries

3. **Why include relevance scoring?**
   - Not all matches are equally relevant to the user
   - Scoring helps prioritize exact matches over partial matches
   - Better user experience with most relevant results first

4. **Why limit max_results parameter?**
   - Prevents resource exhaustion from large result sets
   - Encourages users to use more specific queries
   - Better performance for both server and client

5. **Why include search_time_ms in response?**
   - Helps users understand search performance
   - Useful for debugging slow searches
   - Provides transparency about system performance

## Performance Monitoring

### Performance Statistics

#### GET /api/v1/jars/performance/stats

**Purpose:** Get performance statistics for operations.

**Parameters:**
- `operation` (query): Specific operation name (optional)
- `time_window` (query): Time window for statistics (1h, 24h, default: 1h)

**Response:**
```json
{
  "time_window": "1h",
  "operations": {
    "comprehensive_dependency_analysis": {
      "operation": "comprehensive_dependency_analysis",
      "total_calls": 25,
      "success_rate": 96.0,
      "avg_duration_ms": 2150.5,
      "min_duration_ms": 850.2,
      "max_duration_ms": 5420.8,
      "p50_duration_ms": 1980.3,
      "p95_duration_ms": 4200.1,
      "p99_duration_ms": 5100.7,
      "error_count": 1,
      "error_types": {
        "TimeoutError": 1
      },
      "last_updated": "2025-01-29T10:30:00Z"
    }
  }
}
```

**Implementation Details:**

```python
@router.get("/performance/stats")
async def get_performance_stats(
    operation: Optional[str] = Query(None, description="Specific operation"),
    time_window: str = Query("1h", description="Time window (1h, 24h)")
) -> JSONResponse:
    """
    Get performance statistics for operations.
    
    Why expose performance stats: Enables monitoring and optimization
    Why time windows: Different time periods show different patterns
    Why percentiles: Better understanding of performance distribution
    """
    
    try:
        if operation:
            stats = await performance_service.get_stats(operation, time_window)
            if not stats:
                raise HTTPException(
                    status_code=404,
                    detail=f"No stats found for operation: {operation}"
                )
            return JSONResponse({
                "operation": operation,
                "stats": stats.__dict__
            })
        else:
            all_stats = await performance_service.get_all_stats(time_window)
            return JSONResponse({
                "time_window": time_window,
                "operations": {
                    op: stats.__dict__ 
                    for op, stats in all_stats.items()
                }
            })
            
    except Exception as e:
        logger.error("Failed to get performance stats", error=str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve performance statistics"
        )
```

### Performance Report

#### GET /api/v1/jars/performance/report

**Purpose:** Get comprehensive performance report with recommendations.

**Response:**
```json
{
  "timestamp": "2025-01-29T10:30:00Z",
  "health_score": 85.2,
  "total_operations": 5,
  "total_calls": 150,
  "total_errors": 8,
  "operation_stats": {...},
  "slow_operations": [
    {
      "operation": "large_jar_analysis",
      "duration_ms": 8500.2,
      "timestamp": "2025-01-29T10:25:00Z",
      "context": {
        "jar_size": 50000000,
        "dependency_count": 2500
      }
    }
  ],
  "error_summary": {
    "comprehensive_dependency_analysis": {
      "TimeoutError": 3,
      "MemoryError": 1
    }
  },
  "recommendations": [
    "Consider increasing timeout for large JAR analysis",
    "Monitor memory usage during peak hours",
    "Optimize dependency tree building for files > 25MB"
  ]
}
```

**5 Whys Analysis:**

1. **Why provide a comprehensive performance report?**
   - Operations teams need holistic view of system performance
   - Individual metrics don't show overall system health
   - Helps prioritize optimization efforts

2. **Why include health score?**
   - Single metric that summarizes overall system performance
   - Easy to understand and monitor
   - Can trigger alerts when below threshold

3. **Why include recommendations?**
   - Actionable insights are more valuable than raw data
   - Helps teams understand what to optimize
   - Reduces time to resolution for performance issues

4. **Why track slow operations separately?**
   - Slow operations have disproportionate impact on user experience
   - Helps identify specific problem cases
   - Enables targeted optimization efforts

5. **Why include error summary by operation?**
   - Different operations have different error patterns
   - Helps identify systemic vs. specific issues
   - Better debugging and troubleshooting

### Slow Operations

#### GET /api/v1/jars/performance/slow-operations

**Purpose:** Get operations that exceed performance thresholds.

**Parameters:**
- `threshold_ms` (query): Threshold in milliseconds (default: 1000)
- `limit` (query): Maximum number of results (default: 10)

**Response:**
```json
{
  "threshold_ms": 1000.0,
  "slow_operations": [
    {
      "operation": "comprehensive_dependency_analysis",
      "start_time": "2025-01-29T10:25:00Z",
      "end_time": "2025-01-29T10:25:08Z",
      "duration_ms": 8500.2,
      "success": true,
      "context": {
        "jar_id": "uuid-string",
        "jar_size": 50000000
      }
    }
  ]
}
```

## Error Handling

### Error Response Format

All API errors follow a consistent format:

```json
{
  "error": "Error message",
  "error_code": "SPECIFIC_ERROR_CODE",
  "details": {
    "field": "Additional context",
    "suggestion": "How to fix the issue"
  },
  "correlation_id": "req-1234567890",
  "timestamp": "2025-01-29T10:30:00Z"
}
```

### HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Access denied
- `404 Not Found`: Resource not found
- `413 Payload Too Large`: File too large
- `422 Unprocessable Entity`: Validation error
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `INVALID_FILE_TYPE` | Uploaded file is not a JAR | Upload a valid JAR file |
| `FILE_TOO_LARGE` | File exceeds size limit | Reduce file size or contact admin |
| `JAR_NOT_FOUND` | JAR ID not found | Verify JAR ID is correct |
| `ANALYSIS_FAILED` | Analysis could not complete | Check JAR file integrity |
| `CACHE_UNAVAILABLE` | Redis cache is unavailable | Service continues without cache |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait before making more requests |

### Error Handling Implementation

```python
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for consistent error responses.
    
    Why global handler: Ensures consistent error format across all endpoints
    Why correlation ID: Helps with debugging and log correlation
    Why structured logging: Enables better monitoring and alerting
    """
    
    correlation_id = request.headers.get("x-correlation-id", f"req-{int(time.time() * 1000)}")
    
    logger.error(
        "unhandled_exception",
        correlation_id=correlation_id,
        error=str(exc),
        error_type=type(exc).__name__,
        url=str(request.url),
    )
    
    # Determine error details based on exception type
    if isinstance(exc, HTTPException):
        status_code = exc.status_code
        error_message = exc.detail
        error_code = getattr(exc, 'error_code', 'HTTP_ERROR')
    elif isinstance(exc, ValidationError):
        status_code = 422
        error_message = "Validation error"
        error_code = "VALIDATION_ERROR"
    else:
        status_code = 500
        error_message = "Internal server error"
        error_code = "INTERNAL_ERROR"
    
    return JSONResponse(
        status_code=status_code,
        content={
            "error": error_message,
            "error_code": error_code,
            "correlation_id": correlation_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        },
        headers={"x-correlation-id": correlation_id},
    )
```

## Data Models

### JAR Information

```python
class JarInfo(BaseModel):
    """JAR file information model."""
    
    id: str = Field(..., description="Unique JAR identifier")
    filename: str = Field(..., description="Original filename")
    size: int = Field(..., description="File size in bytes")
    upload_time: datetime = Field(..., description="Upload timestamp")
    file_hash: str = Field(..., description="SHA-256 hash of file content")
    status: str = Field(..., description="Processing status")
    extracted_path: Optional[Path] = Field(None, description="Path to extracted contents")
```

### Dependency Node

```python
class DependencyNode(BaseModel):
    """Individual dependency node in the tree."""
    
    id: str = Field(..., description="Unique dependency identifier")
    group_id: str = Field(..., description="Maven group ID")
    artifact_id: str = Field(..., description="Maven artifact ID")
    version: Optional[str] = Field(None, description="Dependency version")
    scope: DependencyScope = Field(..., description="Dependency scope")
    source: DependencySource = Field(..., description="How dependency was discovered")
    is_transitive: bool = Field(False, description="Is transitive dependency")
    depth: int = Field(0, description="Depth in dependency tree")
    parent_id: Optional[str] = Field(None, description="Parent dependency ID")
    children: List['DependencyNode'] = Field(default_factory=list)
    has_conflicts: bool = Field(False, description="Has version conflicts")
    conflict_severity: Optional[str] = Field(None, description="Conflict severity level")
    description: Optional[str] = Field(None, description="Dependency description")
    license: Optional[str] = Field(None, description="License information")
```

### Dependency Tree

```python
class DependencyTree(BaseModel):
    """Complete dependency tree structure."""
    
    jar_id: str = Field(..., description="Associated JAR identifier")
    root_dependencies: List[DependencyNode] = Field(default_factory=list)
    all_dependencies: Dict[str, DependencyNode] = Field(default_factory=dict)
    conflicts: List[DependencyConflict] = Field(default_factory=list)
    total_dependencies: int = Field(0, description="Total number of dependencies")
    direct_dependencies: int = Field(0, description="Number of direct dependencies")
    transitive_dependencies: int = Field(0, description="Number of transitive dependencies")
    max_depth: int = Field(0, description="Maximum tree depth")
    scope_counts: Dict[str, int] = Field(default_factory=dict)
    source_counts: Dict[str, int] = Field(default_factory=dict)
```

### Performance Metric

```python
class PerformanceMetric(BaseModel):
    """Individual performance measurement."""
    
    operation: str = Field(..., description="Operation name")
    start_time: datetime = Field(..., description="Operation start time")
    end_time: datetime = Field(..., description="Operation end time")
    duration_ms: float = Field(..., description="Duration in milliseconds")
    success: bool = Field(..., description="Operation success status")
    error_type: Optional[str] = Field(None, description="Error type if failed")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")
    memory_usage_mb: Optional[float] = Field(None, description="Memory usage in MB")
```

## Code Examples

### Python Client Example

```python
import requests
import json
from pathlib import Path

class JarViewerClient:
    """Python client for JarViewer API."""
    
    def __init__(self, base_url: str = "http://localhost:9000"):
        self.base_url = base_url
        self.session = requests.Session()
    
    def upload_jar(self, jar_path: Path) -> dict:
        """Upload a JAR file for analysis."""
        
        with open(jar_path, 'rb') as f:
            files = {'file': (jar_path.name, f, 'application/java-archive')}
            response = self.session.post(
                f"{self.base_url}/api/v1/jars/upload",
                files=files
            )
        
        response.raise_for_status()
        return response.json()
    
    def get_analysis(self, jar_id: str) -> dict:
        """Get comprehensive analysis results."""
        
        response = self.session.get(
            f"{self.base_url}/api/v1/jars/{jar_id}/analysis/comprehensive"
        )
        
        response.raise_for_status()
        return response.json()
    
    def search_dependencies(self, jar_id: str, query: str, **kwargs) -> dict:
        """Search dependencies in a JAR."""
        
        params = {'q': query, **kwargs}
        response = self.session.get(
            f"{self.base_url}/api/v1/jars/{jar_id}/dependencies/search",
            params=params
        )
        
        response.raise_for_status()
        return response.json()

# Usage example
client = JarViewerClient()

# Upload JAR
jar_path = Path("example.jar")
upload_result = client.upload_jar(jar_path)
jar_id = upload_result['jar_id']

# Get analysis
analysis = client.get_analysis(jar_id)
print(f"Found {analysis['analysis']['summary']['total_dependencies']} dependencies")

# Search for Spring dependencies
search_results = client.search_dependencies(jar_id, "spring", max_results=10)
print(f"Found {search_results['total_results']} Spring dependencies")
```

### JavaScript/TypeScript Client Example

```typescript
class JarViewerClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:9000') {
    this.baseUrl = baseUrl;
  }

  async uploadJar(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/v1/jars/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getAnalysis(jarId: string): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/jars/${jarId}/analysis/comprehensive`
    );

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }

    return response.json();
  }

  async searchDependencies(
    jarId: string,
    query: string,
    options: {
      fields?: string[];
      maxResults?: number;
      highlight?: boolean;
    } = {}
  ): Promise<any> {
    const params = new URLSearchParams({
      q: query,
      ...(options.fields && { fields: options.fields.join(',') }),
      ...(options.maxResults && { max_results: options.maxResults.toString() }),
      ...(options.highlight !== undefined && { highlight: options.highlight.toString() }),
    });

    const response = await fetch(
      `${this.baseUrl}/api/v1/jars/${jarId}/dependencies/search?${params}`
    );

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// Usage example
const client = new JarViewerClient();

// Upload and analyze JAR
const fileInput = document.getElementById('jarFile') as HTMLInputElement;
const file = fileInput.files?.[0];

if (file) {
  try {
    const uploadResult = await client.uploadJar(file);
    console.log('Upload successful:', uploadResult);

    // Wait a bit for analysis to complete
    setTimeout(async () => {
      const analysis = await client.getAnalysis(uploadResult.jar_id);
      console.log('Analysis complete:', analysis);

      // Search for dependencies
      const searchResults = await client.searchDependencies(
        uploadResult.jar_id,
        'spring',
        { maxResults: 20, highlight: true }
      );
      console.log('Search results:', searchResults);
    }, 5000);

  } catch (error) {
    console.error('Error:', error);
  }
}
```

### cURL Examples

```bash
# Upload JAR file
curl -X POST \
  http://localhost:9000/api/v1/jars/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@example.jar"

# Get analysis results
curl -X GET \
  http://localhost:9000/api/v1/jars/{jar_id}/analysis/comprehensive \
  -H "Accept: application/json"

# Search dependencies
curl -X GET \
  "http://localhost:9000/api/v1/jars/{jar_id}/dependencies/search?q=spring&max_results=10&highlight=true" \
  -H "Accept: application/json"

# Get performance stats
curl -X GET \
  "http://localhost:9000/api/v1/jars/performance/stats?time_window=1h" \
  -H "Accept: application/json"

# Health check
curl -X GET \
  http://localhost:9000/health \
  -H "Accept: application/json"
```

This comprehensive API reference provides detailed information about all backend endpoints, including implementation details, error handling, and practical examples for different programming languages.