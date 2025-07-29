# JarViewer Documentation

Welcome to the JarViewer documentation! This directory contains comprehensive guides for developers, operators, and users.

## 📚 Documentation Index

### Quick Start
- **[Quick Start Guide](QUICK_START_GUIDE.md)** - Get up and running in 5 minutes
- **[Developer Guide](DEVELOPER_GUIDE.md)** - Comprehensive development guide with 5 Whys analysis

### API Documentation
- **[Backend API Reference](BACKEND_API_REFERENCE.md)** - Complete API documentation with examples
- **[Frontend Architecture](FRONTEND_ARCHITECTURE.md)** - Frontend component architecture and patterns

### Technical Specifications
- **[Technical Specification](TECHNICAL_SPECIFICATION.md)** - System architecture and design decisions
- **[Performance Optimization Summary](../PERFORMANCE_OPTIMIZATION_SUMMARY.md)** - Performance improvements and optimizations

## 🚀 Current Status

| Component | Status | Description |
|-----------|--------|-------------|
| **Backend** | ✅ **Fully Functional** | FastAPI with Redis caching, performance monitoring |
| **Redis** | ✅ **Working** | Caching layer with persistence and health checks |
| **API** | ✅ **Complete** | All endpoints working with comprehensive error handling |
| **Frontend** | ⚠️ **Partial** | React components complete, Docker build issues |
| **Documentation** | ✅ **Complete** | Comprehensive guides with code examples |

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │     Redis       │
│   (React/Vite)  │◄──►│   (FastAPI)     │◄──►│   (Cache)       │
│   Port: 3000    │    │   Port: 9000    │    │   Port: 6380    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Components

#### Backend Services
- **JAR Analysis Engine**: Comprehensive dependency extraction and analysis
- **Dependency Tree Builder**: Hierarchical dependency relationship mapping
- **Performance Monitoring**: Real-time metrics collection and analysis
- **Caching Layer**: Redis-based caching for expensive operations
- **Export Services**: Multiple format export capabilities

#### Frontend Components
- **Single JAR Dashboard**: Main analysis interface with tabbed views
- **Progressive Tree Loader**: Virtual scrolling for large dependency trees
- **Dependency Search**: High-performance search with Web Workers
- **Conflict Visualization**: Interactive conflict detection and resolution

#### Infrastructure
- **Redis**: High-performance caching and session storage
- **Docker**: Containerized deployment with health checks
- **Prometheus**: Performance metrics collection (optional)

## 🎯 Key Features

### Performance Optimizations
- **80-95% faster responses** with Redis caching
- **Virtual scrolling** for 1000+ dependency trees
- **Web Worker search** for non-blocking operations
- **Concurrent processing** of analysis tasks
- **Progressive loading** for better user experience

### Analysis Capabilities
- **Multi-source dependency detection** (Maven, Gradle, code analysis)
- **Conflict detection and resolution** suggestions
- **Framework and library identification**
- **Security risk assessment**
- **License compliance analysis**

### Developer Experience
- **Comprehensive API documentation** with code examples
- **5 Whys analysis** for architectural decisions
- **Performance monitoring** and alerting
- **Error handling** with detailed diagnostics
- **Health checks** for all services

## 📖 Getting Started

### For Developers
1. Start with the **[Quick Start Guide](QUICK_START_GUIDE.md)** to get the system running
2. Read the **[Developer Guide](DEVELOPER_GUIDE.md)** for comprehensive development information
3. Use the **[Backend API Reference](BACKEND_API_REFERENCE.md)** for API integration

### For Operators
1. Review the **[Technical Specification](TECHNICAL_SPECIFICATION.md)** for system requirements
2. Check the **[Performance Optimization Summary](../PERFORMANCE_OPTIMIZATION_SUMMARY.md)** for scaling guidance
3. Use the health check endpoints for monitoring

### For Users
1. Access the application at http://localhost:3000 (frontend) or http://localhost:9000 (API)
2. Upload JAR files through the web interface or API
3. Explore dependency trees, conflicts, and export options

## 🔧 Development Workflow

### Backend Development
```bash
# Start services
docker-compose up -d redis backend

# Make changes to backend/src/
# Changes are automatically reloaded

# Run tests
docker-compose exec backend python -m pytest

# Check performance
curl http://localhost:9000/api/v1/jars/performance/report
```

### Frontend Development
```bash
# Start backend services first
docker-compose up -d redis backend

# Run frontend locally (recommended due to Docker issues)
cd frontend
npm install
npm run dev

# Access at http://localhost:3000
```

## 🐛 Troubleshooting

### Common Issues

1. **Backend not responding**
   ```bash
   docker-compose logs backend
   curl http://localhost:9000/health
   ```

2. **Redis connection failed**
   ```bash
   docker-compose logs redis
   docker-compose restart redis
   ```

3. **Frontend build issues**
   ```bash
   cd frontend
   rm -rf node_modules
   npm install
   npm run dev
   ```

### Performance Issues
- Check the performance monitoring endpoints
- Review Redis cache hit rates
- Monitor memory usage with `docker stats`

### API Issues
- Verify CORS settings for cross-origin requests
- Check API documentation for correct endpoint usage
- Review error responses for detailed diagnostics

## 📊 Performance Metrics

### Expected Performance
- **Cache Hit Scenarios**: 80-95% reduction in response time
- **Large Dependency Trees**: 60-80% improvement in rendering
- **Search Operations**: 40-70% faster responses
- **Memory Usage**: 30-50% reduction with optimizations

### Monitoring
- **Health Checks**: http://localhost:9000/health
- **Performance Report**: http://localhost:9000/api/v1/jars/performance/report
- **Slow Operations**: http://localhost:9000/api/v1/jars/performance/slow-operations

## 🤝 Contributing

1. **Read the Developer Guide** for coding standards and patterns
2. **Follow the 5 Whys methodology** for architectural decisions
3. **Add tests** for new functionality
4. **Update documentation** for any changes
5. **Use performance monitoring** to validate improvements

## 📝 Documentation Standards

All documentation follows these principles:
- **5 Whys Analysis**: Every architectural decision includes reasoning
- **Code Examples**: Practical examples in multiple languages
- **Performance Impact**: Quantified improvements and trade-offs
- **Troubleshooting**: Common issues and solutions
- **Best Practices**: Industry-standard approaches and patterns

## 🔗 Quick Links

- [Backend Health Check](http://localhost:9000/health)
- [API Documentation](http://localhost:9000/docs)
- [Performance Report](http://localhost:9000/api/v1/jars/performance/report)
- [Frontend Application](http://localhost:3000) (when running)

---

**Last Updated**: January 29, 2025  
**Version**: 1.0.0  
**Status**: Production Ready (Backend), Development (Frontend)