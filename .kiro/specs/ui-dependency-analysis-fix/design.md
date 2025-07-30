# Design Document

## Overview

The UI dependency analysis feature needs to be fixed to properly consume and display the comprehensive dependency analysis data from the backend API. The backend is returning correct data with 13 dependencies for the Groovy JAR, but the frontend components are not rendering this data properly due to several issues:

1. **API Endpoint Mismatch**: Frontend is using wrong API URL (port 8000 vs 9000)
2. **Data Structure Mismatch**: Frontend expects different data structure than backend provides
3. **Missing Data Transformation**: Backend response format doesn't match frontend component expectations
4. **Incomplete Component Implementation**: Some components expect data that isn't being provided

## Architecture

### Current Backend API Response Structure
```json
{
  "success": true,
  "data": {
    "jar_info": { /* JAR metadata */ },
    "dependencies": [ /* Array of 13 dependencies */ ],
    "direct_dependencies": [ /* Direct deps */ ],
    "transitive_dependencies": [ /* Transitive deps */ ],
    "optional_dependencies": [ /* Optional deps */ ],
    "imported_packages": { /* Package imports */ },
    "exported_packages": { /* Package exports */ },
    "detected_frameworks": { /* Framework info */ },
    "statistics": { /* Comprehensive stats */ }
  }
}
```

### Required Frontend Data Structure
```typescript
interface AnalysisData {
  dependencyTree: DependencyTree;
  summary: AnalysisSummary;
  conflicts: DependencyConflict[];
  recommendations: string[];
}
```

### Data Transformation Layer
A new transformation service will convert backend responses to frontend-expected formats.

## Components and Interfaces

### 1. API Service Updates
**File**: `frontend/src/services/apiService.ts`
- Fix API base URL to use port 9000 instead of 8000
- Add proper error handling for comprehensive analysis endpoint
- Implement retry logic for failed requests

### 2. JAR Service Updates  
**File**: `frontend/src/services/jarService.ts`
- Add method for comprehensive dependency analysis
- Update API endpoint discovery to use correct port
- Add data transformation methods

### 3. Data Transformation Service
**File**: `frontend/src/services/dataTransformationService.ts` (new)
- Transform backend comprehensive analysis response to frontend format
- Convert dependency array to dependency tree structure
- Generate summary statistics from raw data
- Create conflict analysis from dependency data

### 4. Component Updates

#### DependencyDashboard Component
**File**: `frontend/src/components/DependencyDashboard.tsx`
- Update to use correct API endpoint (`/analysis/comprehensive`)
- Fix data structure expectations
- Add proper error handling for missing data
- Implement loading states for dependency analysis

#### SingleJarDashboard Component  
**File**: `frontend/src/components/SingleJarDashboard.tsx`
- Update store integration to use transformed data
- Fix overview section to display actual dependency statistics
- Add proper handling for empty/missing dependency data

### 5. Store Updates
**File**: `frontend/src/stores/singleJarDashboardStore.ts`
- Update API call to use correct endpoint
- Add data transformation step after API response
- Fix data structure expectations
- Improve error handling for partial analysis results

## Data Models

### Backend Response Model
```typescript
interface BackendAnalysisResponse {
  success: boolean;
  data: {
    jar_info: JarInfo;
    dependencies: BackendDependency[];
    direct_dependencies: BackendDependency[];
    transitive_dependencies: BackendDependency[];
    statistics: BackendStatistics;
    imported_packages: Record<string, string[]>;
    exported_packages: Record<string, string>;
  };
}
```

### Frontend Analysis Model
```typescript
interface AnalysisData {
  dependencyTree: DependencyTree;
  summary: {
    total_dependencies: number;
    direct_dependencies: number;
    transitive_dependencies: number;
    scope_breakdown: Record<string, number>;
    source_breakdown: Record<string, number>;
    risk_level: 'low' | 'medium' | 'high';
  };
  conflicts: DependencyConflict[];
}
```

### Dependency Node Model
```typescript
interface DependencyNode {
  id: string;
  name: string;
  version?: string;
  group_id?: string;
  artifact_id?: string;
  scope: string;
  source: string;
  confidence: number;
  description?: string;
  license?: string;
  package_imports: string[];
  children: DependencyNode[];
  is_transitive: boolean;
  depth: number;
}
```

## Error Handling

### Graceful Degradation Strategy
1. **Partial Data Display**: Show available data even if some analysis fails
2. **Error Indicators**: Clear visual indicators for missing or failed analysis
3. **Retry Mechanisms**: Allow users to retry failed analysis
4. **Fallback Content**: Meaningful messages when no data is available

### Error Types
- **API Connection Errors**: Network/server issues
- **Data Transformation Errors**: Invalid response format
- **Partial Analysis Errors**: Some analysis features failed
- **Empty Data Errors**: No dependencies found

## Testing Strategy

### Unit Tests
- Data transformation service tests
- API service endpoint tests  
- Component rendering tests with mock data
- Store state management tests

### Integration Tests
- End-to-end dependency analysis flow
- API error handling scenarios
- Data transformation accuracy
- Component interaction tests

### Manual Testing Scenarios
1. Upload Groovy JAR and verify 13 dependencies display
2. Test with standalone JAR (CFR) and verify appropriate messaging
3. Test error scenarios (network failures, invalid responses)
4. Test partial analysis results display
5. Verify search and filtering functionality

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading**: Load dependency details on demand
2. **Virtual Scrolling**: Handle large dependency lists efficiently
3. **Debounced Search**: Prevent excessive API calls during search
4. **Caching**: Cache analysis results to avoid repeated API calls
5. **Progressive Enhancement**: Show basic info first, enhance with details

### Memory Management
- Proper cleanup of large dependency trees
- Efficient data structures for search and filtering
- Component unmounting cleanup

## Implementation Phases

### Phase 1: Core API Fixes
1. Fix API service base URL
2. Update JAR service endpoints
3. Add comprehensive analysis API call
4. Basic error handling

### Phase 2: Data Transformation
1. Create data transformation service
2. Implement backend-to-frontend data mapping
3. Add dependency tree generation
4. Create summary statistics calculation

### Phase 3: Component Updates
1. Update DependencyDashboard component
2. Fix SingleJarDashboard integration
3. Update store to use new data format
4. Add proper loading and error states

### Phase 4: Enhanced Features
1. Implement search and filtering
2. Add conflict visualization
3. Improve error handling and retry logic
4. Add performance optimizations

### Phase 5: Testing and Polish
1. Comprehensive testing suite
2. Performance optimization
3. Accessibility improvements
4. Documentation updates