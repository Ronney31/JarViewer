# JarViewer Developer Guide

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Backend Development](#backend-development)
4. [Frontend Development](#frontend-development)
5. [Performance Optimizations](#performance-optimizations)
6. [Testing](#testing)
7. [Deployment](#deployment)
8. [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.12+ (for local backend development)

### Running the Application

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd JarViewer
   ```

2. **Start the services:**
   ```bash
   # Start all services
   docker-compose up -d
   
   # Or start individual services
   docker-compose up -d redis backend
   ```

3. **Access the application:**
   - Backend API: http://localhost:9000
   - Frontend UI: http://localhost:3000 (when working)
   - Redis: localhost:6380
   - API Documentation: http://localhost:9000/docs

4. **Health Check:**
   ```bash
   curl http://localhost:9000/health
   ```

### Current Status

- ✅ Backend: Fully functional with Redis caching and performance monitoring
- ✅ Redis: Working with persistence and health checks
- ⚠️ Frontend: Currently has dependency issues (Heroicons missing)

## Architecture Overview

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │     Redis       │
│   (React/Vite)  │◄──►│   (FastAPI)     │◄──►│   (Cache)       │
│   Port: 3000    │    │   Port: 9000    │    │   Port: 6380    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Components

1. **Backend Services:**
   - JAR Analysis Engine
   - Dependency Tree Builder
   - Performance Monitoring
   - Caching Layer
   - Export Services

2. **Frontend Components:**
   - Single JAR Dashboard
   - Progressive Tree Loader
   - Dependency Search
   - Conflict Visualization

3. **Infrastructure:**
   - Redis for caching
   - Docker for containerization
   - Prometheus metrics (optional)

## Backend Development

### Project Structure

```
backend/
├── src/
│   ├── api/
│   │   ├── endpoints/          # API route handlers
│   │   └── routes.py          # Route configuration
│   ├── core/
│   │   ├── config.py          # Application configuration
│   │   ├── logging.py         # Logging setup
│   │   └── security.py        # Security middleware
│   ├── models/
│   │   └── jar.py             # Data models
│   ├── services/
│   │   ├── cache_service.py           # Redis caching
│   │   ├── performance_monitoring_service.py  # Performance tracking
│   │   ├── comprehensive_dependency_service.py # Dependency analysis
│   │   ├── dependency_tree_service.py         # Tree building
│   │   └── dependency_search_service.py       # Search functionality
│   ├── utils/
│   │   └── error_handling.py  # Error utilities
│   └── main.py                # Application entry point
├── tests/                     # Test files
├── requirements.txt           # Python dependencies
└── Dockerfile                # Container configuration
```

### Key Services Deep Dive

#### 1. Cache Service (`cache_service.py`)

**Purpose:** Provides Redis-based caching with automatic fallback when Redis is unavailable.

**Why Redis?** 
- Fast in-memory storage for frequently accessed data
- Persistence for cache durability
- Built-in data structures and expiration
- Horizontal scaling capabilities
- Industry standard for caching

**Key Methods:**

```python
class CacheService:
    def __init__(self):
        # Why: Initialize Redis connection with health checks
        # What: Creates Redis client with timeout and retry settings
        # When: Application startup
        # Where: Service initialization
        # How: Uses Redis URL from environment configuration
        
    async def get(self, key: str) -> Optional[Any]:
        # Why: Retrieve cached data to avoid expensive recomputation
        # What: Gets serialized data from Redis and deserializes it
        # When: Before expensive operations (dependency analysis, tree building)
        # Where: Called by other services before processing
        # How: Uses Redis GET command with error handling
        
    async def set(self, key: str, value: Any, ttl: Optional[int] = None):
        # Why: Store computed results to speed up future requests
        # What: Serializes data and stores in Redis with expiration
        # When: After successful completion of expensive operations
        # Where: Called by services after processing
        # How: Uses Redis SETEX command with compression for large data
```

**5 Whys Analysis - Cache Service:**

1. **Why do we need caching?** 
   - JAR analysis is computationally expensive (parsing, tree building, conflict detection)

2. **Why is it expensive?**
   - Large JAR files can contain thousands of dependencies
   - Each dependency requires parsing, relationship mapping, and conflict analysis
   - File I/O operations are slow compared to memory access

3. **Why not use in-memory caching?**
   - In-memory cache is lost on application restart
   - Multiple application instances can't share the cache
   - Memory usage grows unbounded without proper eviction

4. **Why Redis specifically?**
   - Persistent storage survives application restarts
   - Shared across multiple application instances
   - Built-in LRU eviction and TTL support
   - High performance and reliability

5. **Why automatic fallback?**
   - Application should remain functional even if Redis is unavailable
   - Graceful degradation improves system reliability
   - Easier deployment in environments without Redis

#### 2. Performance Monitoring Service (`performance_monitoring_service.py`)

**Purpose:** Tracks and analyzes performance metrics for all operations.

**Key Methods:**

```python
class PerformanceMonitoringService:
    @asynccontextmanager
    async def monitor_operation(self, operation: str, context: Optional[Dict] = None):
        # Why: Track operation performance without manual timing code
        # What: Context manager that automatically records start/end times
        # When: Wraps any operation that needs performance tracking
        # Where: Used as decorator or context manager around operations
        # How: Records PerformanceMetric with duration, success/failure, errors
        
    def record_metric(self, metric: PerformanceMetric):
        # Why: Store performance data for analysis and alerting
        # What: Adds metric to in-memory collection with automatic cleanup
        # When: Called by monitor_operation or manually for custom metrics
        # Where: Stores in thread-safe collections with size limits
        # How: Uses deque with maxlen for automatic old data removal
        
    async def get_stats(self, operation: str) -> Optional[PerformanceStats]:
        # Why: Provide performance insights for optimization decisions
        # What: Calculates aggregated statistics (avg, percentiles, error rates)
        # When: Called by API endpoints or monitoring dashboards
        # Where: Processes in-memory metrics or cached results
        # How: Statistical calculations with caching for expensive operations
```

**5 Whys Analysis - Performance Monitoring:**

1. **Why monitor performance?**
   - Need to identify slow operations that impact user experience

2. **Why are some operations slow?**
   - JAR analysis involves complex algorithms and large data processing
   - File I/O, parsing, and tree traversal can be bottlenecks

3. **Why not just log execution times?**
   - Logs are hard to aggregate and analyze
   - No automatic alerting or trend analysis
   - Difficult to correlate with system resources

4. **Why collect percentiles (P95, P99)?**
   - Average doesn't show outliers that affect user experience
   - Percentiles reveal performance distribution and worst-case scenarios

5. **Why automatic cleanup of old metrics?**
   - Prevents memory leaks from unbounded metric collection
   - Keeps recent data relevant for current system performance
   - Balances historical data with memory efficiency

#### 3. Comprehensive Dependency Service (`comprehensive_dependency_service.py`)

**Purpose:** Extracts and analyzes all dependencies, libraries, and frameworks from JAR files.

**Key Methods:**

```python
class ComprehensiveDependencyService:
    async def analyze_comprehensive_dependencies(self, jar_path: Path, jar_size: int):
        # Why: Provide complete dependency analysis for decision-making
        # What: Extracts dependencies from multiple sources (Maven, Gradle, code analysis)
        # When: Called when user uploads a JAR for analysis
        # Where: Processes extracted JAR contents
        # How: Concurrent processing of different analysis tasks
        
    async def _detect_libraries_from_code(self, jar_path: Path):
        # Why: Find dependencies not declared in build files
        # What: Analyzes import statements and package usage
        # When: Part of comprehensive analysis
        # Where: Scans Java source files and class files
        # How: Batch processing with thread pool for CPU-intensive work
```

**5 Whys Analysis - Comprehensive Analysis:**

1. **Why analyze dependencies comprehensively?**
   - Build files don't always reflect actual runtime dependencies
   - Transitive dependencies may not be visible in build files

2. **Why scan source code and class files?**
   - Import statements reveal actual library usage
   - Package structure shows embedded dependencies
   - Runtime dependencies may not appear in build files

3. **Why use concurrent processing?**
   - Different analysis tasks (Maven, Gradle, code scanning) are independent
   - Parallel processing reduces total analysis time
   - Better resource utilization on multi-core systems

4. **Why batch processing for file analysis?**
   - Processing files one-by-one creates overhead
   - Batch processing reduces context switching
   - Better memory usage patterns

5. **Why cache analysis results?**
   - Same JAR files are often analyzed multiple times
   - Analysis is expensive and results don't change
   - Improves user experience with faster responses

### API Endpoints

#### Core Endpoints

1. **Health Check**
   ```
   GET /health
   ```
   - Returns system health including Redis and performance monitoring status
   - Used for load balancer health checks and monitoring

2. **JAR Upload**
   ```
   POST /api/v1/jars/upload
   ```
   - Accepts JAR file upload and initiates analysis
   - Returns JAR ID for tracking analysis progress

3. **Dependency Analysis**
   ```
   GET /api/v1/jars/{jar_id}/analysis/comprehensive
   ```
   - Returns complete dependency analysis results
   - Includes caching for performance

#### Performance Monitoring Endpoints

1. **Performance Stats**
   ```
   GET /api/v1/jars/performance/stats?operation=<operation>&time_window=<window>
   ```
   - Returns performance statistics for specific operations
   - Supports filtering by time window (1h, 24h)

2. **Performance Report**
   ```
   GET /api/v1/jars/performance/report
   ```
   - Comprehensive performance report with recommendations
   - Includes health score and slow operation detection

3. **Slow Operations**
   ```
   GET /api/v1/jars/performance/slow-operations?threshold_ms=<threshold>
   ```
   - Lists operations exceeding performance thresholds
   - Used for performance optimization identification

### Configuration

#### Environment Variables

```bash
# Core Configuration
ENVIRONMENT=development
LOG_LEVEL=DEBUG
CORS_ORIGINS=http://localhost:3000

# Redis Configuration
REDIS_URL=redis://redis:6379
ENABLE_CACHE=true

# Performance Monitoring
ENABLE_PERFORMANCE_MONITORING=true
PERFORMANCE_RETENTION_HOURS=24
SLOW_OPERATION_THRESHOLD_MS=5000.0

# File Processing
MAX_FILE_SIZE=524288000  # 500MB
MAX_EXTRACTION_SIZE=1073741824  # 1GB
```

#### Configuration Class (`config.py`)

```python
class Settings(BaseSettings):
    # Why: Centralized configuration management
    # What: Pydantic-based settings with validation and type checking
    # When: Loaded at application startup
    # Where: Used throughout the application
    # How: Environment variables with defaults and validation
```

### Error Handling

#### Error Handling Strategy

1. **Graceful Degradation:**
   - Cache unavailable → Continue without caching
   - Analysis partial failure → Return partial results with warnings
   - Service timeout → Return cached results if available

2. **Structured Logging:**
   - All errors logged with correlation IDs
   - Context information for debugging
   - Performance metrics for error rates

3. **User-Friendly Messages:**
   - Technical errors translated to user-friendly messages
   - Suggested actions for common issues
   - Retry mechanisms for transient failures

## Frontend Development

### Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── SingleJarDashboard.tsx    # Main dashboard component
│   │   ├── ProgressiveTreeLoader.tsx # Virtual scrolling tree
│   │   ├── DependencyTreeView.tsx    # Tree visualization
│   │   ├── DependencySearch.tsx      # Search functionality
│   │   └── ConflictVisualization.tsx # Conflict display
│   ├── stores/
│   │   └── singleJarDashboardStore.ts # Zustand state management
│   ├── services/
│   │   ├── apiService.ts             # API communication
│   │   └── errorHandlingService.ts   # Error handling
│   ├── types/
│   │   └── errors.ts                 # Type definitions
│   └── App.tsx                       # Root component
├── tests/                            # Test files
├── package.json                      # Dependencies
└── vite.config.ts                   # Build configuration
```

### Key Components Deep Dive

#### 1. Progressive Tree Loader (`ProgressiveTreeLoader.tsx`)

**Purpose:** Efficiently render large dependency trees using virtual scrolling.

**Why Virtual Scrolling?**
- Large dependency trees (1000+ items) cause performance issues
- DOM nodes for invisible items consume memory and slow rendering
- Virtual scrolling only renders visible items

**Key Features:**

```typescript
const ProgressiveTreeLoader: React.FC<Props> = ({
  dependencyTree,
  searchQuery,
  filters,
  // ...
}) => {
  // Why: Calculate visible range based on scroll position
  // What: Determines which tree nodes should be rendered
  // When: On scroll events and data changes
  // Where: Virtual scrolling container
  // How: Math calculations based on item height and scroll position
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE);
    const endIndex = Math.min(
      virtualizedNodes.length - 1,
      Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE
    );
    return { startIndex, endIndex };
  }, [scrollTop, containerHeight, virtualizedNodes.length]);
  
  // Why: Load more data as user scrolls
  // What: Increases the number of loaded batches
  // When: When user scrolls near the end of loaded data
  // Where: Scroll event handler
  // How: Checks if more data is needed and loads additional batches
  const loadMoreBatches = useCallback(async () => {
    if (isLoading) return;
    
    const maxLoadedIndex = loadedBatches * BATCH_SIZE - 1;
    const needsMoreData = visibleRange.endIndex > maxLoadedIndex - BUFFER_SIZE;
    const hasMoreData = maxLoadedIndex < virtualizedNodes.length - 1;
    
    if (needsMoreData && hasMoreData) {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 100)); // Smooth UX
      setLoadedBatches(prev => prev + 1);
      setIsLoading(false);
    }
  }, [visibleRange.endIndex, loadedBatches, virtualizedNodes.length, isLoading]);
};
```

**5 Whys Analysis - Progressive Loading:**

1. **Why use progressive loading?**
   - Large dependency trees (1000+ nodes) cause browser performance issues

2. **Why do large trees cause performance issues?**
   - Each DOM node consumes memory and requires layout calculations
   - React re-renders become expensive with many components

3. **Why not just paginate the tree?**
   - Tree structure makes pagination complex (parent-child relationships)
   - Users expect to see the full tree structure for navigation

4. **Why virtual scrolling specifically?**
   - Maintains tree structure while only rendering visible items
   - Smooth scrolling experience without performance degradation

5. **Why batch loading instead of loading all at once?**
   - Reduces initial load time and memory usage
   - Provides progressive enhancement as user explores
   - Better perceived performance

#### 2. Single JAR Dashboard Store (`singleJarDashboardStore.ts`)

**Purpose:** Centralized state management for JAR analysis dashboard.

**Key Features:**

```typescript
export const useSingleJarDashboardStore = create<SingleJarDashboardState>()(
  devtools(
    (set, get) => ({
      // Why: Optimized search with Web Workers for large datasets
      // What: Uses Web Workers for non-blocking search operations
      // When: Search query changes and dataset is large (>500 items)
      // Where: Search functionality
      // How: Creates inline Web Worker for heavy filtering operations
      searchDependencies: async (query: string, filters: SearchFilters = {}) => {
        const { analysisData } = get();
        if (!analysisData) return;
        
        const dependencies = Object.values(analysisData.dependencyTree.all_dependencies);
        
        let results: DependencyNode[];
        
        if (dependencies.length > 500 && 'Worker' in window) {
          // Use Web Worker for heavy filtering
          results = await searchWithWebWorker(dependencies, query, filters);
        } else {
          // Use main thread for smaller sets
          results = searchDependenciesSync(dependencies, query, filters);
        }
        
        set({ searchResults: results });
      },
    })
  )
);
```

**5 Whys Analysis - Web Worker Search:**

1. **Why use Web Workers for search?**
   - Large dependency searches can block the main thread and freeze the UI

2. **Why does search block the main thread?**
   - JavaScript is single-threaded, and complex filtering operations are CPU-intensive
   - Searching through thousands of dependencies with multiple criteria takes time

3. **Why not just optimize the search algorithm?**
   - Even optimized algorithms can be slow with large datasets
   - User interactions (typing, scrolling) need immediate response

4. **Why only use Web Workers for large datasets?**
   - Web Worker creation has overhead
   - Small datasets process faster on main thread than Worker setup time

5. **Why inline Web Worker instead of separate file?**
   - Simpler deployment (no additional files to serve)
   - Self-contained component with all logic in one place
   - Easier to maintain and debug

### State Management

#### Zustand Store Pattern

```typescript
interface SingleJarDashboardState {
  // Data
  analysisData: AnalysisData | null;
  partialResult: PartialAnalysisResult | null;
  
  // UI State
  searchQuery: string;
  filters: SearchFilters;
  selectedDependency: string | null;
  expandedNodes: Set<string>;
  
  // Loading and Error States
  loadingState: LoadingState | null;
  error: AnalysisError | null;
  errors: AnalysisError[];
  
  // Actions
  loadAnalysis: (jarId: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  // ...
}
```

**Why Zustand?**
- Simpler than Redux with less boilerplate
- TypeScript-first with excellent type inference
- DevTools integration for debugging
- Small bundle size and good performance

### Performance Optimizations

#### 1. Search Debouncing

```typescript
const handleSearch = useCallback((query: string) => {
  setSearchQuery(query);
  
  // Debounce search
  const { searchDependencies, filters } = get();
  setTimeout(() => {
    if (get().searchQuery === query) {
      searchDependencies(query, filters);
    }
  }, 300);
}, [setSearchQuery]);
```

**Why Debouncing?**
- Prevents excessive API calls while user is typing
- Reduces server load and improves performance
- Better user experience with fewer loading states

#### 2. Memoization

```typescript
const filteredDependencies = useMemo(() => {
  let dependencies = dependencyTree.root_dependencies;
  
  // Apply search and filters
  if (searchQuery.trim()) {
    dependencies = dependencies.filter(dep => 
      matchesSearchQuery(dep, searchQuery.toLowerCase())
    );
  }
  
  return dependencies;
}, [dependencyTree.root_dependencies, searchQuery, filters]);
```

**Why Memoization?**
- Prevents expensive recalculations on every render
- Only recalculates when dependencies actually change
- Improves rendering performance

## Performance Optimizations

### Backend Optimizations

1. **Caching Strategy:**
   - Dependency trees: 2-hour TTL
   - Analysis results: 1-hour TTL
   - Search indexes: 2-hour TTL
   - Performance metrics: 5-minute TTL

2. **Concurrent Processing:**
   - Parallel analysis tasks using `asyncio.gather()`
   - Thread pool for CPU-intensive operations
   - Batch processing for file operations

3. **Memory Management:**
   - Streaming file processing for large JARs
   - Automatic cleanup of temporary files
   - Limited in-memory caches with LRU eviction

### Frontend Optimizations

1. **Virtual Scrolling:**
   - Only render visible tree nodes
   - Batch loading (50 items per batch)
   - Smooth scrolling with buffer zones

2. **Web Worker Processing:**
   - Non-blocking search for large datasets
   - Automatic threshold detection (>500 items)
   - Timeout protection and error handling

3. **State Management:**
   - Debounced search queries (300ms)
   - Memoized expensive calculations
   - Efficient re-rendering with React.memo

### Performance Metrics

#### Expected Improvements

- **Cache Hit Scenarios:** 80-95% reduction in response time
- **Large Trees:** 60-80% improvement in rendering performance
- **Search Operations:** 40-70% faster responses
- **Memory Usage:** 30-50% reduction in frontend memory

## Testing

### Backend Testing

```bash
# Run all tests
docker-compose exec backend python -m pytest

# Run specific test file
docker-compose exec backend python -m pytest tests/test_performance_optimizations.py -v

# Run with coverage
docker-compose exec backend python -m pytest --cov=src tests/
```

### Frontend Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

### Test Structure

1. **Unit Tests:**
   - Individual service methods
   - Component rendering
   - State management logic

2. **Integration Tests:**
   - API endpoint functionality
   - Service interactions
   - Database operations

3. **Performance Tests:**
   - Load testing with large JARs
   - Memory usage monitoring
   - Response time validation

## Deployment

### Docker Deployment

1. **Production Build:**
   ```bash
   docker-compose -f docker-compose.prod.yml build
   docker-compose -f docker-compose.prod.yml up -d
   ```

2. **Environment Configuration:**
   ```bash
   # Production environment variables
   ENVIRONMENT=production
   REDIS_URL=redis://redis-server:6379
   ENABLE_CACHE=true
   LOG_LEVEL=INFO
   ```

3. **Health Monitoring:**
   ```bash
   # Check service health
   curl http://localhost:9000/health
   
   # Monitor performance
   curl http://localhost:9000/api/v1/jars/performance/report
   ```

### Scaling Considerations

1. **Horizontal Scaling:**
   - Multiple backend instances behind load balancer
   - Shared Redis cache across instances
   - Stateless application design

2. **Resource Requirements:**
   - Backend: 2GB RAM, 2 CPU cores minimum
   - Redis: 1GB RAM for cache
   - Storage: 10GB for temporary files

## Troubleshooting

### Common Issues

1. **Redis Connection Failed:**
   ```bash
   # Check Redis status
   docker-compose logs redis
   
   # Test Redis connection
   docker-compose exec redis redis-cli ping
   ```

2. **Frontend Build Issues:**
   ```bash
   # Clear node_modules and reinstall
   rm -rf frontend/node_modules
   docker-compose build frontend
   ```

3. **Performance Issues:**
   ```bash
   # Check performance metrics
   curl http://localhost:9000/api/v1/jars/performance/slow-operations
   
   # Monitor resource usage
   docker stats
   ```

### Debugging

1. **Backend Debugging:**
   ```bash
   # View logs
   docker-compose logs backend -f
   
   # Access container
   docker-compose exec backend bash
   ```

2. **Frontend Debugging:**
   ```bash
   # View logs
   docker-compose logs frontend -f
   
   # Access browser dev tools
   # Check Network tab for API calls
   # Check Console for JavaScript errors
   ```

### Performance Monitoring

1. **Key Metrics to Monitor:**
   - Response times (P50, P95, P99)
   - Cache hit/miss ratios
   - Memory usage
   - Error rates

2. **Alerting Thresholds:**
   - Response time > 5 seconds
   - Error rate > 5%
   - Cache hit rate < 70%
   - Memory usage > 80%

## Contributing

### Development Workflow

1. **Setup Development Environment:**
   ```bash
   git clone <repository>
   cd JarViewer
   docker-compose up -d
   ```

2. **Make Changes:**
   - Follow existing code patterns
   - Add tests for new functionality
   - Update documentation

3. **Testing:**
   ```bash
   # Run tests
   docker-compose exec backend python -m pytest
   npm test
   
   # Check code quality
   docker-compose exec backend flake8 src/
   npm run lint
   ```

4. **Submit Changes:**
   - Create feature branch
   - Submit pull request
   - Ensure CI passes

### Code Standards

1. **Backend (Python):**
   - Follow PEP 8 style guide
   - Use type hints
   - Document functions with docstrings
   - Write unit tests for new code

2. **Frontend (TypeScript):**
   - Use TypeScript strict mode
   - Follow React best practices
   - Use functional components with hooks
   - Write tests for components

This developer guide provides comprehensive information for working with the JarViewer application, including detailed explanations of architecture decisions, performance optimizations, and troubleshooting procedures.