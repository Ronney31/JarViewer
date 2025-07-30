import React, { useState, useEffect } from 'react';
import { jarService } from '../services/jarService';
import { 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Download, 
  Search,
  Filter,
  Info,
  Shield,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import ErrorDisplay from './ErrorDisplay';

interface VersionInfo {
  name: string;
  version: string | null;
  group_id: string | null;
  artifact_id: string | null;
  source: string;
  source_file: string | null;
  confidence: number;
}

interface ConflictedDependency {
  name: string;
  version: string;
  source: string;
  source_file: string | null;
  confidence: number;
}

interface DependencyConflict {
  conflict_type: string;
  severity: string;
  title: string;
  description: string;
  conflicted_dependencies: ConflictedDependency[];
  recommended_version: string | null;
  resolution_steps: string[];
  impact_assessment: string;
}

interface ConflictAnalysis {
  conflicts: DependencyConflict[];
  total_dependencies: number;
  conflicted_dependencies: number;
  severity_breakdown: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  recommendations: string[];
}

interface ExtractedVersions {
  versions: VersionInfo[];
  manifest_info: Record<string, string>;
  build_info: Record<string, any>;
  framework_versions: Record<string, string>;
  total_versions: number;
}

interface SBOMData {
  format: string;
  sbom: any;
  metadata: {
    timestamp: string;
    tools: string[];
    authors: string[];
    component_name: string | null;
    component_version: string | null;
  };
  components_count: number;
  file_size: number;
}

interface DependencyDashboardProps {
  jarId: string;
  isVisible: boolean;
}

const DependencyDashboard: React.FC<DependencyDashboardProps> = ({ jarId, isVisible }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tree' | 'versions' | 'conflicts' | 'sbom'>('overview');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterScope, setFilterScope] = useState('all');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [expandedConflicts, setExpandedConflicts] = useState<Set<number>>(new Set());
  
  // Data states
  const [versionsData, setVersionsData] = useState<ExtractedVersions | null>(null);
  const [conflictsData, setConflictsData] = useState<ConflictAnalysis | null>(null);
  const [sbomData, setSbomData] = useState<SBOMData | null>(null);
  const [comprehensiveData, setComprehensiveData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'direct' | 'transitive' | 'conflicts' | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // Highlight search terms in text
  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim() || !text) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">
          {part}
        </span>
      ) : part
    );
  };
  
  // Enhanced filtering with comprehensive search and filter options
  const getFilteredDependencies = (dependencies: any[]) => {
    if (!dependencies) return [];
    
    return dependencies.filter(dep => {
      // Enhanced search filter - search by name, group, version, artifact_id, and description
      if (debouncedSearchTerm.trim()) {
        const searchLower = debouncedSearchTerm.toLowerCase();
        const matchesSearch = 
          (dep.name && dep.name.toLowerCase().includes(searchLower)) ||
          (dep.artifact_id && dep.artifact_id.toLowerCase().includes(searchLower)) ||
          (dep.group_id && dep.group_id.toLowerCase().includes(searchLower)) ||
          (dep.version && dep.version.toLowerCase().includes(searchLower)) ||
          (dep.description && dep.description.toLowerCase().includes(searchLower)) ||
          // Search in combined group:artifact format
          (`${dep.group_id || ''}:${dep.artifact_id || ''}`.toLowerCase().includes(searchLower)) ||
          // Search in package imports
          (dep.package_imports && dep.package_imports.some(pkg => pkg.toLowerCase().includes(searchLower)));
        
        if (!matchesSearch) return false;
      }
      
      // Enhanced source filter with more options
      if (filterSource !== 'all') {
        if (dep.source !== filterSource) return false;
      }
      
      // Scope filter
      if (filterScope !== 'all') {
        if (dep.scope !== filterScope) return false;
      }
      
      return true;
    });
  };

  // Get available filter options from current data
  const getAvailableFilterOptions = () => {
    if (!comprehensiveData?.dependencyTree?.all_dependencies) {
      return { sources: [], scopes: [] };
    }
    
    const allDeps = Object.values(comprehensiveData.dependencyTree.all_dependencies);
    const sources = [...new Set(allDeps.map(dep => dep.source))].sort();
    const scopes = [...new Set(allDeps.map(dep => dep.scope))].sort();
    
    return { sources, scopes };
  };

  const { sources: availableSources, scopes: availableScopes } = getAvailableFilterOptions();

  // Export functionality
  const exportData = (format: 'json' | 'csv' | 'txt') => {
    if (!comprehensiveData) return;
    
    setShowExportMenu(false);
    
    const allDeps = Object.values(comprehensiveData.dependencyTree.all_dependencies);
    const filteredDeps = getFilteredDependencies(allDeps);
    
    let content = '';
    let filename = '';
    let mimeType = '';
    
    switch (format) {
      case 'json':
        content = JSON.stringify({
          jarInfo: comprehensiveData.dependencyTree.jar_id,
          exportDate: new Date().toISOString(),
          totalDependencies: filteredDeps.length,
          dependencies: filteredDeps.map(dep => ({
            name: dep.artifact_id || dep.name,
            groupId: dep.group_id,
            version: dep.version,
            scope: dep.scope,
            source: dep.source,
            isTransitive: dep.is_transitive,
            confidence: dep.confidence,
            description: dep.description,
            license: dep.license,
            packageImports: dep.package_imports
          })),
          summary: comprehensiveData.summary
        }, null, 2);
        filename = `dependencies-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
        break;
        
      case 'csv':
        const headers = ['Name', 'Group ID', 'Version', 'Scope', 'Source', 'Type', 'Confidence', 'Description'];
        const csvRows = [
          headers.join(','),
          ...filteredDeps.map(dep => [
            `"${dep.artifact_id || dep.name}"`,
            `"${dep.group_id}"`,
            `"${dep.version || 'N/A'}"`,
            `"${dep.scope}"`,
            `"${dep.source}"`,
            `"${dep.is_transitive ? 'Transitive' : 'Direct'}"`,
            `"${dep.confidence ? Math.round(dep.confidence * 100) + '%' : 'N/A'}"`,
            `"${dep.description || ''}"`
          ].join(','))
        ];
        content = csvRows.join('\n');
        filename = `dependencies-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
        break;
        
      case 'txt':
        content = `Dependency Analysis Report
Generated: ${new Date().toLocaleString()}
JAR ID: ${comprehensiveData.dependencyTree.jar_id}
Total Dependencies: ${filteredDeps.length}

${filteredDeps.map((dep, index) => `
${index + 1}. ${dep.artifact_id || dep.name}
   Group ID: ${dep.group_id}
   Version: ${dep.version || 'N/A'}
   Scope: ${dep.scope}
   Source: ${dep.source}
   Type: ${dep.is_transitive ? 'Transitive' : 'Direct'}
   Confidence: ${dep.confidence ? Math.round(dep.confidence * 100) + '%' : 'N/A'}
   ${dep.description ? `Description: ${dep.description}` : ''}
   ${dep.package_imports?.length ? `Packages: ${dep.package_imports.slice(0, 3).join(', ')}${dep.package_imports.length > 3 ? '...' : ''}` : ''}
`).join('\n')}`;
        filename = `dependencies-${new Date().toISOString().split('T')[0]}.txt`;
        mimeType = 'text/plain';
        break;
    }
    
    // Create and trigger download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate SBOM
  const generateSBOM = async (format: 'cyclonedx' | 'spdx') => {
    setShowExportMenu(false);
    setLoading(true);
    
    try {
      const response = await fetch(`http://localhost:9000/api/v1/jars/${jarId}/sbom/generate?format=${format}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Create and trigger download
          const content = JSON.stringify(result.data.sbom, null, 2);
          const blob = new Blob([content], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `sbom-${format}-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.error('Failed to generate SBOM:', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (isVisible && jarId) {
      loadComprehensiveData();
    }
  }, [isVisible, jarId]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showExportMenu) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  const loadComprehensiveData = async () => {
    // Check cache first
    const cacheKey = `dependency_analysis_${jarId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        if (Date.now() - cachedData.timestamp < 300000) { // 5 minutes cache
          setComprehensiveData(cachedData.data);
          return;
        }
      } catch (e) {
        // Invalid cache, continue with API call
      }
    }

    setLoading(true);
    setError(null);
    try {
      const transformedData = await jarService.getComprehensiveDependencyAnalysis(jarId);
      setComprehensiveData(transformedData);
      
      // Cache the result
      sessionStorage.setItem(cacheKey, JSON.stringify({
        data: transformedData,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Failed to load comprehensive data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dependency analysis');
    } finally {
      setLoading(false);
    }
  };

  const loadVersionsData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:9000/api/v1/jars/${jarId}/analysis/versions`);
      const result = await response.json();
      if (result.success) {
        setVersionsData(result.data);
      }
    } catch (error) {
      console.error('Failed to load versions data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConflictsData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:9000/api/v1/jars/${jarId}/analysis/conflicts`);
      const result = await response.json();
      if (result.success) {
        setConflictsData(result.data);
      }
    } catch (error) {
      console.error('Failed to load conflicts data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSBOM = async (format: 'cyclonedx' | 'spdx' = 'cyclonedx') => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:9000/api/v1/jars/${jarId}/sbom/generate?format=${format}`, {
        method: 'POST'
      });
      const result = await response.json();
      if (result.success) {
        setSbomData(result.data);
      }
    } catch (error) {
      console.error('Failed to generate SBOM:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportSBOM = async (format: 'cyclonedx' | 'spdx' = 'cyclonedx', exportFormat: 'json' | 'xml' = 'json') => {
    try {
      const response = await fetch(`http://localhost:9000/api/v1/jars/${jarId}/sbom/export?format=${format}&export_format=${exportFormat}`);
      const result = await response.json();
      if (result.success) {
        // Trigger download
        const downloadUrl = result.data.download_url;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = result.data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Failed to export SBOM:', error);
    }
  };

  const handleTabChange = (tab: 'overview' | 'versions' | 'conflicts' | 'sbom') => {
    setActiveTab(tab);
    if (tab === 'versions' && !versionsData) {
      loadVersionsData();
    } else if (tab === 'conflicts' && !conflictsData) {
      loadConflictsData();
    } else if (tab === 'sbom' && !sbomData) {
      generateSBOM();
    }
  };

  const toggleConflictExpansion = (index: number) => {
    const newExpanded = new Set(expandedConflicts);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedConflicts(newExpanded);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="w-4 h-4" />;
      case 'high': return <AlertTriangle className="w-4 h-4" />;
      case 'medium': return <Info className="w-4 h-4" />;
      case 'low': return <CheckCircle className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const filteredVersions = versionsData?.versions.filter(version => {
    const matchesSearch = !searchTerm || 
      version.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (version.version && version.version.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = filterSource === 'all' || version.source === filterSource;
    
    return matchesSearch && matchesFilter;
  }) || [];

  const uniqueSources = [...new Set(versionsData?.versions.map(v => v.source) || [])];

  if (!isVisible) return null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-2">
            <Package className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Dependency Analysis
            </h2>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-white dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => handleTabChange('overview')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => handleTabChange('versions')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'versions'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Versions
            </button>
            <button
              onClick={() => handleTabChange('conflicts')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'conflicts'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Conflicts
            </button>
            <button
              onClick={() => handleTabChange('tree')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'tree'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Tree
            </button>
            <button
              onClick={() => handleTabChange('sbom')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'sbom'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              SBOM
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading dependency analysis...</span>
          </div>
        )}

        {error && !loading && (
          <div className="p-4">
            <ErrorDisplay
              error={{
                type: 'error',
                title: 'Analysis Failed',
                message: error,
                actions: [
                  {
                    label: 'Retry Analysis',
                    action: loadComprehensiveData,
                    variant: 'primary'
                  }
                ]
              }}
            />
          </div>
        )}

        {!comprehensiveData && !loading && !error && (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                No Analysis Data
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Click a tab above to start dependency analysis.
              </p>
            </div>
          </div>
        )}

        {/* Overview Tab - Comprehensive Analysis */}
        {activeTab === 'overview' && comprehensiveData && !loading && (
          <div className="h-full flex">
            {/* Main Content */}
            <div className={`${showDetailPanel ? 'w-2/3' : 'w-full'} flex flex-col transition-all duration-300`}>
            {/* Decision Summary */}
            <div className="flex-shrink-0 p-4 bg-gray-50 dark:bg-gray-800">
              {/* Search and Filter Controls */}
              <div className="mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 sm:space-x-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search dependencies..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={filterSource}
                      onChange={(e) => setFilterSource(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All Sources</option>
                      {availableSources.map(source => (
                        <option key={source} value={source}>
                          {source.charAt(0).toUpperCase() + source.slice(1).replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterScope}
                      onChange={(e) => setFilterScope(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All Scopes</option>
                      {availableScopes.map(scope => (
                        <option key={scope} value={scope}>
                          {scope.charAt(0).toUpperCase() + scope.slice(1)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setFilterSource('all');
                        setFilterScope('all');
                      }}
                      className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Clear
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>Export</span>
                      </button>
                      {showExportMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                          <div className="py-1">
                            <button
                              onClick={() => exportData('json')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Export as JSON
                            </button>
                            <button
                              onClick={() => exportData('csv')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Export as CSV
                            </button>
                            <button
                              onClick={() => exportData('txt')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Export as Text
                            </button>
                            <hr className="my-1 border-gray-200 dark:border-gray-600" />
                            <button
                              onClick={() => generateSBOM('cyclonedx')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Generate SBOM (CycloneDX)
                            </button>
                            <button
                              onClick={() => generateSBOM('spdx')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Generate SBOM (SPDX)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${
                    comprehensiveData.summary.risk_level === 'low' ? 'text-green-600' :
                    comprehensiveData.summary.risk_level === 'medium' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {comprehensiveData.summary.risk_level.toUpperCase()}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Risk Level</div>
                </div>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setShowDetailPanel(true);
                  }}
                  className="text-center hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg p-2 transition-colors cursor-pointer"
                >
                  <div className="text-2xl font-bold text-blue-600">{comprehensiveData.summary.total_dependencies}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Dependencies</div>
                </button>
                <button
                  onClick={() => {
                    setSelectedCategory('conflicts');
                    setShowDetailPanel(true);
                  }}
                  className="text-center hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg p-2 transition-colors cursor-pointer"
                >
                  <div className="text-2xl font-bold text-purple-600">{comprehensiveData.summary.conflicts_count}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Conflicts</div>
                </button>
              </div>
              
              {/* Recommendations */}
              {comprehensiveData.recommendations.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  <div className="font-medium mb-2">Recommendations:</div>
                  <ul className="text-sm space-y-1">
                    {comprehensiveData.recommendations.slice(0, 3).map((rec, index) => (
                      <li key={index}>• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Content Sections */}
            <div className="flex-1 overflow-auto p-4 space-y-6">
              {/* Dependency Statistics */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Dependency Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button
                    onClick={() => {
                      setSelectedCategory('direct');
                      setShowDetailPanel(true);
                    }}
                    className="text-center hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg p-3 transition-colors cursor-pointer"
                  >
                    <div className="text-2xl font-bold text-blue-600">{comprehensiveData.summary.direct_dependencies}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Direct</div>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedCategory('transitive');
                      setShowDetailPanel(true);
                    }}
                    className="text-center hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg p-3 transition-colors cursor-pointer"
                  >
                    <div className="text-2xl font-bold text-green-600">{comprehensiveData.summary.transitive_dependencies}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Transitive</div>
                  </button>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{comprehensiveData.summary.max_depth}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Max Depth</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{Object.keys(comprehensiveData.summary.source_breakdown).length}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Sources</div>
                  </div>
                </div>
              </div>

              {/* Dependencies Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Source Breakdown */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Dependencies by Source</h4>
                  <div className="space-y-2">
                    {Object.entries(comprehensiveData.summary.source_breakdown).map(([source, count]) => (
                      <div key={source} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                        <div className="font-medium capitalize">{source.replace('_', ' ')}</div>
                        <div className="text-blue-600 dark:text-blue-400">{count}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scope Breakdown */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Dependencies by Scope</h4>
                  <div className="space-y-2">
                    {Object.entries(comprehensiveData.summary.scope_breakdown).map(([scope, count]) => (
                      <div key={scope} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                        <div className="font-medium capitalize">{scope}</div>
                        <div className="text-green-600 dark:text-green-400">{count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Enhanced Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Dependency Type Distribution */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Dependency Types</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium">Direct</div>
                      <div className="text-blue-600 dark:text-blue-400">{comprehensiveData.summary.direct_dependencies}</div>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium">Transitive</div>
                      <div className="text-green-600 dark:text-green-400">{comprehensiveData.summary.transitive_dependencies}</div>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium">Optional</div>
                      <div className="text-yellow-600 dark:text-yellow-400">
                        {Object.values(comprehensiveData.dependencyTree.all_dependencies).filter(dep => dep.optional).length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Depth Analysis */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Depth Analysis</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium">Max Depth</div>
                      <div className="text-purple-600 dark:text-purple-400">{comprehensiveData.summary.max_depth}</div>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium">Avg Depth</div>
                      <div className="text-indigo-600 dark:text-indigo-400">
                        {(() => {
                          const allDeps = Object.values(comprehensiveData.dependencyTree.all_dependencies);
                          const avgDepth = allDeps.reduce((sum, dep) => sum + (dep.depth || 0), 0) / allDeps.length;
                          return avgDepth.toFixed(1);
                        })()}
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium">Deep Dependencies (>3)</div>
                      <div className="text-orange-600 dark:text-orange-400">
                        {Object.values(comprehensiveData.dependencyTree.all_dependencies).filter(dep => (dep.depth || 0) > 3).length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quality Metrics - Confidence Scores */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white flex items-center">
                    <Shield className="w-4 h-4 mr-2" />
                    Detection Quality
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                        High Confidence (>80%)
                      </div>
                      <div className="text-green-600 dark:text-green-400">
                        {Object.values(comprehensiveData.dependencyTree.all_dependencies).filter(dep => (dep.confidence || 0) > 0.8).length}
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium flex items-center">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
                        Medium (50-80%)
                      </div>
                      <div className="text-yellow-600 dark:text-yellow-400">
                        {Object.values(comprehensiveData.dependencyTree.all_dependencies).filter(dep => {
                          const conf = dep.confidence || 0;
                          return conf > 0.5 && conf <= 0.8;
                        }).length}
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                      <div className="font-medium flex items-center">
                        <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                        Low (≤50%)
                      </div>
                      <div className="text-red-600 dark:text-red-400">
                        {Object.values(comprehensiveData.dependencyTree.all_dependencies).filter(dep => (dep.confidence || 0) <= 0.5).length}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Avg Confidence: {(() => {
                        const allDeps = Object.values(comprehensiveData.dependencyTree.all_dependencies);
                        const avgConf = allDeps.reduce((sum, dep) => sum + (dep.confidence || 0), 0) / allDeps.length;
                        return Math.round(avgConf * 100);
                      })()}%
                    </div>
                  </div>
                </div>

                {/* Framework Detection */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    Detected Frameworks
                  </h4>
                  {(() => {
                    // Extract frameworks from comprehensive data
                    const frameworks = comprehensiveData.detectedFrameworks || {};
                    const frameworkEntries = Object.entries(frameworks);
                    
                    if (frameworkEntries.length === 0) {
                      return (
                        <div className="text-center py-4">
                          <div className="text-gray-400 dark:text-gray-500 text-sm">
                            No frameworks detected
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-2">
                        {frameworkEntries.slice(0, 4).map(([name, version]) => (
                          <div key={name} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                            <div className="font-medium truncate">{name}</div>
                            <div className="text-blue-600 dark:text-blue-400 text-xs">
                              {version === 'Detected' ? (
                                <span className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                                  Detected
                                </span>
                              ) : (
                                version
                              )}
                            </div>
                          </div>
                        ))}
                        {frameworkEntries.length > 4 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2">
                            +{frameworkEntries.length - 4} more frameworks
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Package Analysis Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Package Imports Analysis */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white flex items-center">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Package Imports Analysis
                  </h4>
                  {(() => {
                    // Extract package imports from comprehensive data
                    const importedPackages = comprehensiveData.importedPackages || {};
                    const importEntries = Object.entries(importedPackages);
                    
                    if (importEntries.length === 0) {
                      return (
                        <div className="text-center py-4">
                          <div className="text-gray-400 dark:text-gray-500 text-sm">
                            No package imports detected
                          </div>
                        </div>
                      );
                    }
                    
                    // Calculate total imports
                    const totalImports = importEntries.reduce((sum, [, sources]) => sum + (Array.isArray(sources) ? sources.length : 1), 0);
                    
                    return (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Total Packages:</span>
                          <span className="font-medium">{importEntries.length}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Total Imports:</span>
                          <span className="font-medium">{totalImports}</span>
                        </div>
                        <div className="max-h-32 overflow-auto space-y-1">
                          {importEntries.slice(0, 8).map(([packageName, sources]) => (
                            <div key={packageName} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                              <div className="font-mono truncate flex-1 mr-2">{packageName}</div>
                              <div className="text-blue-600 dark:text-blue-400">
                                {Array.isArray(sources) ? sources.length : 1}
                              </div>
                            </div>
                          ))}
                          {importEntries.length > 8 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-1">
                              +{importEntries.length - 8} more packages
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Package Exports Analysis */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    Package Exports Analysis
                  </h4>
                  {(() => {
                    // Extract package exports from comprehensive data
                    const exportedPackages = comprehensiveData.exportedPackages || {};
                    const exportEntries = Object.entries(exportedPackages);
                    
                    if (exportEntries.length === 0) {
                      return (
                        <div className="text-center py-4">
                          <div className="text-gray-400 dark:text-gray-500 text-sm">
                            No package exports detected
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Exported Packages:</span>
                          <span className="font-medium">{exportEntries.length}</span>
                        </div>
                        <div className="max-h-32 overflow-auto space-y-1">
                          {exportEntries.slice(0, 8).map(([packageName, version]) => (
                            <div key={packageName} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                              <div className="font-mono truncate flex-1 mr-2">{packageName}</div>
                              <div className="text-green-600 dark:text-green-400">
                                {version || 'N/A'}
                              </div>
                            </div>
                          ))}
                          {exportEntries.length > 8 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-1">
                              +{exportEntries.length - 8} more packages
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Dependencies List */}
              {(() => {
                const allDeps = Object.values(comprehensiveData.dependencyTree.all_dependencies);
                const filteredDeps = getFilteredDependencies(allDeps);
                return filteredDeps.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        Dependencies ({filteredDeps.length} of {allDeps.length})
                      </h4>
                      {(searchTerm.trim() || filterSource !== 'all' || filterScope !== 'all') && (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                            Filtered
                          </span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {searchTerm.trim() && `Search: "${searchTerm}"`}
                            {filterSource !== 'all' && ` Source: ${filterSource}`}
                            {filterScope !== 'all' && ` Scope: ${filterScope}`}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {filteredDeps.slice(0, 50).map((dep: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm border-l-4 border-gray-300 dark:border-gray-600">
                        <div className="flex-1">
                          <div className="font-medium">{highlightSearchTerm(dep.artifact_id || dep.name, searchTerm)}</div>
                          <div className="text-gray-500 text-xs">{highlightSearchTerm(dep.group_id, searchTerm)}</div>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                              {dep.source}
                            </span>
                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                              {dep.scope}
                            </span>
                            {dep.is_transitive && (
                              <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded">
                                Transitive
                              </span>
                            )}
                            {/* Confidence Score Indicator */}
                            {dep.confidence && (
                              <span className={`text-xs px-2 py-0.5 rounded flex items-center ${
                                dep.confidence > 0.8 
                                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                                  : dep.confidence > 0.5
                                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                                  : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                              }`}>
                                <Shield className="w-3 h-3 mr-1" />
                                {Math.round(dep.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-blue-600 dark:text-blue-400 font-medium">{highlightSearchTerm(dep.version || 'N/A', searchTerm)}</div>
                          {dep.depth !== undefined && (
                            <div className="text-xs text-gray-400">Depth: {dep.depth}</div>
                          )}
                          {/* Package count indicator */}
                          {dep.package_imports?.length && (
                            <div className="text-xs text-gray-500 flex items-center mt-1">
                              <Package className="w-3 h-3 mr-1" />
                              {dep.package_imports.length} packages
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {comprehensiveData.dependencyTree.root_dependencies.length > 10 && (
                      <div className="text-center text-sm text-gray-500">
                        ... and {comprehensiveData.dependencyTree.root_dependencies.length - 10} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Conflicts */}
              {comprehensiveData.conflicts.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                  <h4 className="font-semibold mb-3 text-yellow-800 dark:text-yellow-200">⚠️ Conflicts Detected</h4>
                  <div className="space-y-2">
                    {comprehensiveData.conflicts.slice(0, 5).map((conflict: any, index: number) => (
                      <div key={index} className="text-sm text-yellow-600 dark:text-yellow-400">
                        • {conflict.description || conflict.title || `Conflict ${index + 1}`}
                      </div>
                    ))}
                    {comprehensiveData.conflicts.length > 5 && (
                      <div className="text-sm text-yellow-500">
                        ... and {comprehensiveData.conflicts.length - 5} more conflicts
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>

            {/* Detail Panel */}
            {showDetailPanel && (
              <div className="w-1/3 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col">
                {/* Detail Panel Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedCategory === 'all' && 'All Dependencies'}
                    {selectedCategory === 'direct' && 'Direct Dependencies'}
                    {selectedCategory === 'transitive' && 'Transitive Dependencies'}
                    {selectedCategory === 'conflicts' && 'Conflicts'}
                  </h3>
                  <button
                    onClick={() => setShowDetailPanel(false)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  >
                    <XCircle className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                {/* Detail Panel Content */}
                <div className="flex-1 overflow-auto p-4">
                  {selectedCategory === 'all' && (
                    <div className="space-y-3">
                      {getFilteredDependencies(Object.values(comprehensiveData.dependencyTree.all_dependencies)).map((dep: any, index: number) => (
                        <div key={index} className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 dark:text-white">
                                {dep.artifact_id || dep.name}
                              </h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {dep.group_id}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                {dep.version || 'N/A'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                            <span className="bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">
                              {dep.source}
                            </span>
                            <span className="bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">
                              {dep.scope}
                            </span>
                            {dep.confidence && (
                              <span className={`px-2 py-1 rounded flex items-center ${
                                dep.confidence > 0.8 
                                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                  : dep.confidence > 0.5
                                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                                  : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                              }`}>
                                <Shield className="w-3 h-3 mr-1" />
                                {Math.round(dep.confidence * 100)}%
                              </span>
                            )}
                          </div>
                          
                          {/* Additional metadata */}
                          {(dep.description || dep.license || dep.package_imports?.length) && (
                            <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                              {dep.description && (
                                <div className="text-xs">
                                  <span className="font-medium text-gray-600 dark:text-gray-400">Description:</span>
                                  <p className="text-gray-500 dark:text-gray-400 mt-1">{dep.description}</p>
                                </div>
                              )}
                              {dep.license && (
                                <div className="text-xs">
                                  <span className="font-medium text-gray-600 dark:text-gray-400">License:</span>
                                  <span className="ml-2 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded">
                                    {dep.license}
                                  </span>
                                </div>
                              )}
                              {dep.package_imports?.length && (
                                <div className="text-xs">
                                  <span className="font-medium text-gray-600 dark:text-gray-400 flex items-center">
                                    <Package className="w-3 h-3 mr-1" />
                                    Packages ({dep.package_imports.length}):
                                  </span>
                                  <div className="mt-1 max-h-16 overflow-auto">
                                    {dep.package_imports.slice(0, 5).map((pkg, pkgIndex) => (
                                      <div key={pkgIndex} className="font-mono text-xs text-gray-400 dark:text-gray-500 truncate">
                                        {pkg}
                                      </div>
                                    ))}
                                    {dep.package_imports.length > 5 && (
                                      <div className="text-xs text-gray-400 dark:text-gray-500">
                                        +{dep.package_imports.length - 5} more packages
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {dep.description && (
                            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                              {dep.description}
                            </p>
                          )}
                          {dep.package_imports?.length && (
                            <div className="mt-2">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Package Imports:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {dep.package_imports.slice(0, 3).map((pkg: string, pkgIndex: number) => (
                                  <span key={pkgIndex} className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                    {pkg}
                                  </span>
                                ))}
                                {dep.package_imports.length > 3 && (
                                  <span className="text-xs text-gray-500">
                                    +{dep.package_imports.length - 3} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedCategory === 'direct' && (
                    <div className="space-y-3">
                      {getFilteredDependencies(comprehensiveData.dependencyTree.root_dependencies).map((dep: any, index: number) => (
                        <div key={index} className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 dark:text-white">
                                {dep.artifact_id || dep.name}
                              </h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {dep.group_id}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                {dep.version || 'N/A'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                              Direct
                            </span>
                            <span className="bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">
                              {dep.source}
                            </span>
                            {dep.confidence && (
                              <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                                {Math.round(dep.confidence * 100)}% confidence
                              </span>
                            )}
                          </div>
                          {dep.children && dep.children.length > 0 && (
                            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-medium">Children:</span> {dep.children.length} dependencies
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedCategory === 'transitive' && (
                    <div className="space-y-3">
                      {getFilteredDependencies(
                        Object.values(comprehensiveData.dependencyTree.all_dependencies)
                          .filter((dep: any) => dep.is_transitive)
                      ).map((dep: any, index: number) => (
                        <div key={index} className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 dark:text-white">
                                {dep.artifact_id || dep.name}
                              </h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {dep.group_id}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                {dep.version || 'N/A'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                              Transitive (Depth: {dep.depth})
                            </span>
                            <span className="bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">
                              {dep.source}
                            </span>
                          </div>
                          {dep.parent_id && (
                            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-medium">Parent:</span> {dep.parent_id}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedCategory === 'conflicts' && (
                    <div className="space-y-3">
                      {comprehensiveData.conflicts.length > 0 ? (
                        comprehensiveData.conflicts.map((conflict: any, index: number) => (
                          <div key={index} className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
                            <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                              {conflict.title || `Conflict ${index + 1}`}
                            </h4>
                            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                              {conflict.description}
                            </p>
                            {conflict.severity && (
                              <span className={`inline-block text-xs px-2 py-1 rounded ${
                                conflict.severity === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                conflict.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              }`}>
                                {conflict.severity} severity
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Conflicts</h4>
                          <p className="text-gray-600 dark:text-gray-400">All dependencies appear to be compatible.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tree Tab - Simple Dependency Tree */}
        {activeTab === 'tree' && comprehensiveData && !loading && (
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 p-4 bg-gray-50 dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Dependency Tree</h3>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {comprehensiveData.summary.total_dependencies} total dependencies
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="p-4">
                  {/* Root Dependencies */}
                  <div className="space-y-2">
                    {comprehensiveData.dependencyTree.root_dependencies.map((dep: any, index: number) => (
                      <div key={index} className="border-l-2 border-blue-500 pl-4">
                        <div className="flex items-start justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <Package className="w-4 h-4 text-blue-600" />
                              <h4 className="font-medium text-gray-900 dark:text-white">
                                {dep.artifact_id || dep.name}
                              </h4>
                              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                Direct
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {dep.group_id}
                            </p>
                            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>Version: {dep.version || 'N/A'}</span>
                              <span>Source: {dep.source}</span>
                              <span>Scope: {dep.scope}</span>
                              {dep.confidence && (
                                <span className="text-green-600 dark:text-green-400">
                                  {Math.round(dep.confidence * 100)}% confidence
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Children Dependencies */}
                        {dep.children && dep.children.length > 0 && (
                          <div className="ml-6 mt-2 space-y-1">
                            {dep.children.map((child: any, childIndex: number) => (
                              <div key={childIndex} className="border-l-2 border-green-500 pl-4">
                                <div className="flex items-start justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <ChevronRight className="w-3 h-3 text-green-600" />
                                      <span className="font-medium text-sm text-gray-900 dark:text-white">
                                        {child.artifact_id || child.name}
                                      </span>
                                      <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                                        Transitive
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                      {child.group_id}
                                    </p>
                                    <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      <span>{child.version || 'N/A'}</span>
                                      <span>{child.source}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Orphaned Transitive Dependencies */}
                  {Object.values(comprehensiveData.dependencyTree.all_dependencies)
                    .filter((dep: any) => dep.is_transitive && !dep.parent_id)
                    .length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-3">Other Transitive Dependencies</h4>
                      <div className="space-y-2">
                        {Object.values(comprehensiveData.dependencyTree.all_dependencies)
                          .filter((dep: any) => dep.is_transitive && !dep.parent_id)
                          .map((dep: any, index: number) => (
                          <div key={index} className="border-l-2 border-yellow-500 pl-4">
                            <div className="flex items-start justify-between p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <AlertTriangle className="w-3 h-3 text-yellow-600" />
                                  <span className="font-medium text-sm text-gray-900 dark:text-white">
                                    {dep.artifact_id || dep.name}
                                  </span>
                                  <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                                    Orphaned
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {dep.group_id}
                                </p>
                                <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  <span>{dep.version || 'N/A'}</span>
                                  <span>{dep.source}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Versions Tab */}
        {activeTab === 'versions' && versionsData && !loading && (
          <div className="h-full flex flex-col">
            {/* Search and Filter */}
            <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex space-x-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search dependencies..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="all">All Sources</option>
                    {uniqueSources.map(source => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="flex-shrink-0 p-4 bg-gray-50 dark:bg-gray-800">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{versionsData.total_versions}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Versions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{Object.keys(versionsData.framework_versions).length}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Frameworks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{uniqueSources.length}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Sources</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{filteredVersions.length}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Filtered</div>
                </div>
              </div>
            </div>

            {/* Versions List */}
            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-2">
                {filteredVersions.map((version, index) => (
                  <div
                    key={index}
                    className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">{version.name}</h3>
                          {version.version && (
                            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                              v{version.version}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{version.source}</span>
                          </span>
                          {version.source_file && (
                            <span className="flex items-center space-x-1">
                              <ExternalLink className="w-3 h-3" />
                              <span>{version.source_file}</span>
                            </span>
                          )}
                        </div>
                        {(version.group_id || version.artifact_id) && (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                            {version.group_id && <span>Group: {version.group_id}</span>}
                            {version.group_id && version.artifact_id && <span> • </span>}
                            {version.artifact_id && <span>Artifact: {version.artifact_id}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${
                          version.confidence >= 0.9 ? 'bg-green-500' :
                          version.confidence >= 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                        }`} title={`Confidence: ${Math.round(version.confidence * 100)}%`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conflicts Tab */}
        {activeTab === 'conflicts' && conflictsData && !loading && (
          <div className="h-full flex flex-col">
            {/* Conflict Summary */}
            <div className="flex-shrink-0 p-4 bg-gray-50 dark:bg-gray-800">
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{conflictsData.total_dependencies}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Dependencies</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{conflictsData.severity_breakdown.critical}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Critical</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{conflictsData.severity_breakdown.high}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">High</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{conflictsData.severity_breakdown.medium}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Medium</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{conflictsData.severity_breakdown.low}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Low</div>
                </div>
              </div>
            </div>

            {/* Conflicts List */}
            <div className="flex-1 overflow-auto p-4">
              {conflictsData.conflicts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Conflicts Detected</h3>
                  <p className="text-gray-600 dark:text-gray-400">All dependencies appear to be compatible.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conflictsData.conflicts.map((conflict, index) => (
                    <div
                      key={index}
                      className={`border rounded-lg ${getSeverityColor(conflict.severity)}`}
                    >
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => toggleConflictExpansion(index)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            {getSeverityIcon(conflict.severity)}
                            <div>
                              <h3 className="font-medium">{conflict.title}</h3>
                              <p className="text-sm mt-1">{conflict.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-1 text-xs font-medium rounded uppercase">
                              {conflict.severity}
                            </span>
                            {expandedConflicts.has(index) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>

                      {expandedConflicts.has(index) && (
                        <div className="border-t p-4 bg-white dark:bg-gray-800">
                          {/* Conflicted Dependencies */}
                          <div className="mb-4">
                            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Conflicted Dependencies:</h4>
                            <div className="space-y-2">
                              {conflict.conflicted_dependencies.map((dep, depIndex) => (
                                <div key={depIndex} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                                  <div>
                                    <span className="font-medium">{dep.name}</span>
                                    {dep.version && <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">v{dep.version}</span>}
                                  </div>
                                  <span className="text-xs text-gray-500 dark:text-gray-500">{dep.source}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Recommended Version */}
                          {conflict.recommended_version && (
                            <div className="mb-4">
                              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Recommended Version:</h4>
                              <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm">
                                v{conflict.recommended_version}
                              </span>
                            </div>
                          )}

                          {/* Resolution Steps */}
                          {conflict.resolution_steps.length > 0 && (
                            <div className="mb-4">
                              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Resolution Steps:</h4>
                              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                {conflict.resolution_steps.map((step, stepIndex) => (
                                  <li key={stepIndex}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {/* Impact Assessment */}
                          {conflict.impact_assessment && (
                            <div>
                              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Impact Assessment:</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{conflict.impact_assessment}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {conflictsData.recommendations.length > 0 && (
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2">General Recommendations:</h3>
                  <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-300">
                    {conflictsData.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SBOM Tab */}
        {activeTab === 'sbom' && sbomData && !loading && (
          <div className="h-full flex flex-col">
            {/* SBOM Header */}
            <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Software Bill of Materials ({sbomData.format.toUpperCase()})
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {sbomData.components_count} components • {Math.round(sbomData.file_size / 1024)} KB
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => exportSBOM('cyclonedx', 'json')}
                    className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export JSON</span>
                  </button>
                  <button
                    onClick={() => generateSBOM('spdx')}
                    className="flex items-center space-x-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Generate SPDX</span>
                  </button>
                </div>
              </div>
            </div>

            {/* SBOM Content */}
            <div className="flex-1 overflow-auto p-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <pre className="text-xs text-gray-800 dark:text-gray-200 overflow-auto">
                  {JSON.stringify(sbomData.sbom, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DependencyDashboard;
