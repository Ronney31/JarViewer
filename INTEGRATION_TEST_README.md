# Integration Tests for Single JAR Dependency Analysis

This document describes the comprehensive integration tests for the complete workflow from JAR upload to dependency analysis, search, and export functionality.

## Test Structure

### Backend Tests
- `backend/tests/test_integration_complete_workflow.py` - Comprehensive backend workflow tests
- `backend/tests/test_integration.py` - Existing integration tests
- `integration_test_complete_workflow.py` - Standalone end-to-end test script

### Frontend Tests
- `frontend/tests/IntegrationCompleteWorkflow.test.tsx` - Complete workflow frontend tests
- `frontend/tests/Integration.test.tsx` - Existing frontend integration tests

## Test Coverage

### 1. End-to-End JAR Upload to Dependency Analysis Workflow
- JAR file upload and validation
- Metadata extraction
- Comprehensive dependency analysis
- Dependency tree generation
- Conflict detection
- Version extraction
- SBOM generation
- File structure access

### 2. Search Functionality Across Large Dependency Trees
- Real-time search with debouncing
- Search by artifact name, group ID, version
- Advanced search with filters
- Search performance testing (< 2 seconds)
- Empty search results handling
- Search result highlighting

### 3. Export Functionality with Real JAR Data
- Multiple export formats (JSON, CSV, Text Tree)
- Export preview functionality
- Export with filters and options
- Content validation for each format
- Export performance testing (< 30 seconds)
- Large dataset export handling

### 4. Error Handling and Recovery Scenarios
- Invalid JAR file handling
- Non-existent JAR ID handling
- Network error recovery
- Partial analysis results
- Multiple error aggregation
- Loading cancellation
- Component error boundaries
- Transient error recovery

### 5. Performance and Scalability
- Large JAR file handling (up to configured limits)
- Concurrent request handling
- Memory usage monitoring
- Response time benchmarks
- Throughput measurements

## Running the Tests

### Quick Start
```bash
# Run all integration tests (starts services automatically)
python run_integration_tests.py

# Run only backend tests
python run_integration_tests.py --backend-only

# Run only frontend tests
python run_integration_tests.py --frontend-only

# Run tests against already running services
python run_integration_tests.py --no-start-services
```

### Manual Test Execution

#### Backend Tests
```bash
# Run pytest tests
cd backend
python -m pytest tests/test_integration_complete_workflow.py -v
python -m pytest tests/test_integration.py -v

# Run standalone integration test
python ../integration_test_complete_workflow.py
```

#### Frontend Tests
```bash
# Run vitest tests
cd frontend
npm run test -- --run tests/IntegrationCompleteWorkflow.test.tsx
npm run test -- --run tests/Integration.test.tsx
```

### Prerequisites

#### Backend
- Python 3.8+
- Virtual environment activated
- Dependencies installed: `pip install -r requirements.txt`
- Backend service running on http://localhost:8000

#### Frontend
- Node.js 16+
- Dependencies installed: `npm install`
- Frontend service running on http://localhost:3000

## Test Scenarios

### Complex JAR Test File
The tests create a complex JAR file with:
- 50+ Java classes
- Maven POM with 10+ dependencies
- Conflicting dependency versions
- Multiple scopes (compile, test, runtime, provided)
- Various dependency sources (Maven POM, embedded JARs)

### Large Dependency JAR
For search performance testing:
- 100+ dependencies
- Multiple group IDs and versions
- Various scopes and sources
- Designed to test search and filtering performance

### Error Scenarios
- Invalid JAR files (non-ZIP format)
- Malformed POM files
- Missing dependencies
- Network timeouts
- Service unavailability

## Performance Benchmarks

### Expected Performance Targets
- JAR upload: < 30 seconds
- Comprehensive analysis: < 60 seconds
- Dependency search: < 2 seconds
- Export generation: < 30 seconds
- Concurrent requests: < 10 seconds for 4 parallel requests

### Memory Usage
- Test process should not exceed 1GB RAM
- Backend service should handle multiple concurrent analyses
- Frontend should remain responsive during large data loads

## Test Results Interpretation

### Success Criteria
- All API endpoints return expected status codes
- Response data structures match specifications
- Performance targets are met
- Error handling works correctly
- UI components render and function properly

### Common Issues
1. **Backend not starting**: Check port 8000 availability
2. **Frontend not starting**: Check port 3000 availability, run `npm install`
3. **Test timeouts**: Increase timeout values for slower systems
4. **Memory errors**: Reduce test data size or increase system memory

## Debugging

### Verbose Output
```bash
# Enable verbose logging
python run_integration_tests.py --verbose

# Run specific test with detailed output
python -m pytest backend/tests/test_integration_complete_workflow.py::TestCompleteWorkflowIntegration::test_end_to_end_jar_upload_to_analysis_workflow -v -s
```

### Manual Testing
```bash
# Test backend health
curl http://localhost:8000/health

# Test frontend availability
curl http://localhost:3000

# Run standalone integration test with custom URL
python integration_test_complete_workflow.py --base-url http://localhost:8000
```

### Log Analysis
- Backend logs: Check uvicorn output for API errors
- Frontend logs: Check browser console for JavaScript errors
- Test logs: Review pytest/vitest output for detailed failure information

## Continuous Integration

### GitHub Actions
The tests can be integrated into CI/CD pipelines:

```yaml
name: Integration Tests
on: [push, pull_request]
jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: 3.9
      - name: Set up Node.js
        uses: actions/setup-node@v2
        with:
          node-version: 16
      - name: Install dependencies
        run: |
          cd backend && pip install -r requirements.txt
          cd frontend && npm install
      - name: Run integration tests
        run: python run_integration_tests.py
```

## Contributing

When adding new integration tests:

1. Follow the existing test structure and naming conventions
2. Include both positive and negative test cases
3. Add performance benchmarks for new functionality
4. Update this README with new test scenarios
5. Ensure tests are deterministic and can run in any order

## Troubleshooting

### Common Solutions
- **Port conflicts**: Change default ports in test configuration
- **Dependency issues**: Reinstall backend/frontend dependencies
- **Timeout errors**: Increase timeout values in test configuration
- **Memory issues**: Reduce test data size or run tests individually

### Getting Help
- Check existing GitHub issues for similar problems
- Review backend/frontend logs for detailed error messages
- Run tests individually to isolate issues
- Use verbose output for debugging information