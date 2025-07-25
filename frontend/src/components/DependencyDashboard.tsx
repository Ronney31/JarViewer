import React, { useState, useEffect } from 'react';
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
  ChevronRight
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'versions' | 'conflicts' | 'sbom'>('overview');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [expandedConflicts, setExpandedConflicts] = useState<Set<number>>(new Set());
  
  // Data states
  const [versionsData, setVersionsData] = useState<ExtractedVersions | null>(null);
  const [conflictsData, setConflictsData] = useState<ConflictAnalysis | null>(null);
  const [sbomData, setSbomData] = useState<SBOMData | null>(null);
  const [comprehensiveData, setComprehensiveData] = useState<any | null>(null);

  useEffect(() => {
    if (isVisible && jarId) {
      loadComprehensiveData();
    }
  }, [isVisible, jarId]);

  const loadComprehensiveData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/v1/jars/${jarId}/analysis/comprehensive`);
      const result = await response.json();
      if (result.success) {
        setComprehensiveData(result.data);
      }
    } catch (error) {
      console.error('Failed to load comprehensive data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVersionsData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/v1/jars/${jarId}/analysis/versions`);
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
      const response = await fetch(`http://localhost:8000/api/v1/jars/${jarId}/analysis/conflicts`);
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
      const response = await fetch(`http://localhost:8000/api/v1/jars/${jarId}/sbom/generate?format=${format}`, {
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
      const response = await fetch(`http://localhost:8000/api/v1/jars/${jarId}/sbom/export?format=${format}&export_format=${exportFormat}`);
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
          </div>
        )}

        {/* Overview Tab - Comprehensive Analysis */}
        {activeTab === 'overview' && comprehensiveData && !loading && (
          <div className="h-full flex flex-col">
            {/* Decision Summary */}
            <div className="flex-shrink-0 p-4 bg-gray-50 dark:bg-gray-800">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${
                    comprehensiveData.summary.compatibility_score >= 80 ? 'text-green-600' :
                    comprehensiveData.summary.compatibility_score >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {comprehensiveData.summary.compatibility_score}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Compatibility Score</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{comprehensiveData.statistics.total_dependencies}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Dependencies</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{comprehensiveData.frameworks.length}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Frameworks</div>
                </div>
              </div>
              
              {/* Recommendation */}
              <div className={`p-3 rounded-lg text-center font-medium ${
                comprehensiveData.summary.recommendation.includes('RECOMMENDED') ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                comprehensiveData.summary.recommendation.includes('CAUTION') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {comprehensiveData.summary.recommendation}
              </div>
            </div>

            {/* Content Sections */}
            <div className="flex-1 overflow-auto p-4 space-y-6">
              {/* Decision Factors */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Decision Factors</h3>
                <div className="space-y-2">
                  {comprehensiveData.summary.decision_factors.map((factor: string, index: number) => (
                    <div key={index} className="flex items-start space-x-2">
                      <span className="text-sm">{factor}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dependencies Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Maven Dependencies */}
                {comprehensiveData.maven_dependencies.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                    <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Maven Dependencies ({comprehensiveData.maven_dependencies.length})</h4>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {comprehensiveData.maven_dependencies.slice(0, 10).map((dep: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                          <div>
                            <div className="font-medium">{dep.artifact_id || dep.name}</div>
                            <div className="text-gray-500 text-xs">{dep.group_id}</div>
                          </div>
                          <div className="text-blue-600 dark:text-blue-400">{dep.version || 'N/A'}</div>
                        </div>
                      ))}
                      {comprehensiveData.maven_dependencies.length > 10 && (
                        <div className="text-center text-sm text-gray-500">
                          ... and {comprehensiveData.maven_dependencies.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Detected Libraries */}
                {comprehensiveData.detected_libraries.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                    <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Detected Libraries ({comprehensiveData.detected_libraries.length})</h4>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {comprehensiveData.detected_libraries.slice(0, 10).map((dep: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                          <div>
                            <div className="font-medium">{dep.name}</div>
                            <div className="text-gray-500 text-xs">{dep.type}</div>
                          </div>
                          <div className="text-green-600 dark:text-green-400">{dep.class_count} classes</div>
                        </div>
                      ))}
                      {comprehensiveData.detected_libraries.length > 10 && (
                        <div className="text-center text-sm text-gray-500">
                          ... and {comprehensiveData.detected_libraries.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Frameworks */}
              {comprehensiveData.frameworks.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Detected Frameworks</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {comprehensiveData.frameworks.map((framework: any, index: number) => (
                      <div key={index} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <h5 className="font-medium text-blue-900 dark:text-blue-200">{framework.name}</h5>
                          <span className="text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                            {Math.round(framework.confidence * 100)}% confidence
                          </span>
                        </div>
                        {framework.version && (
                          <div className="text-sm text-blue-700 dark:text-blue-300 mb-1">Version: {framework.version}</div>
                        )}
                        <div className="text-xs text-blue-600 dark:text-blue-400">{framework.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Build Info</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-gray-500">Build Tool:</span> {comprehensiveData.build_tool || 'Unknown'}</div>
                    <div><span className="text-gray-500">Java Version:</span> {comprehensiveData.java_version || 'Unknown'}</div>
                    <div><span className="text-gray-500">JAR Size:</span> {comprehensiveData.statistics.jar_size_mb} MB</div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Code Statistics</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-gray-500">Total Classes:</span> {comprehensiveData.statistics.total_classes}</div>
                    <div><span className="text-gray-500">Total Packages:</span> {comprehensiveData.statistics.total_packages}</div>
                    <div><span className="text-gray-500">External Packages:</span> {comprehensiveData.external_packages.length}</div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                  <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Risk Assessment</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-gray-500">Outdated Deps:</span> {comprehensiveData.risk_assessment.outdated_dependencies.length}</div>
                    <div><span className="text-gray-500">Security Concerns:</span> {comprehensiveData.risk_assessment.security_concerns.length}</div>
                    <div><span className="text-gray-500">License Types:</span> {Object.keys(comprehensiveData.risk_assessment.license_info).length}</div>
                  </div>
                </div>
              </div>

              {/* Risk Details */}
              {(comprehensiveData.risk_assessment.outdated_dependencies.length > 0 || comprehensiveData.risk_assessment.security_concerns.length > 0) && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                  <h4 className="font-semibold mb-3 text-yellow-800 dark:text-yellow-200">⚠️ Attention Required</h4>
                  
                  {comprehensiveData.risk_assessment.outdated_dependencies.length > 0 && (
                    <div className="mb-3">
                      <h5 className="font-medium text-yellow-700 dark:text-yellow-300 mb-2">Potentially Outdated Dependencies:</h5>
                      <ul className="list-disc list-inside text-sm text-yellow-600 dark:text-yellow-400 space-y-1">
                        {comprehensiveData.risk_assessment.outdated_dependencies.map((dep: string, index: number) => (
                          <li key={index}>{dep}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {comprehensiveData.risk_assessment.security_concerns.length > 0 && (
                    <div>
                      <h5 className="font-medium text-yellow-700 dark:text-yellow-300 mb-2">Security Concerns:</h5>
                      <ul className="list-disc list-inside text-sm text-yellow-600 dark:text-yellow-400 space-y-1">
                        {comprehensiveData.risk_assessment.security_concerns.map((concern: string, index: number) => (
                          <li key={index}>{concern}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
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
