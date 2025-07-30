import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Download, 
  Check, 
  Eye, 
  AlertCircle, 
  X, 
  RefreshCw, 
  FileText, 
  Database, 
  Code, 
  Settings, 
  Clock, 
  Trash2,
  Copy,
  ExternalLink,
  Filter,
  BarChart3,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiService } from '../services/apiService';

interface ExportControlsProps {
  jarId: string;
  dependencyTree: any;
  analysisData: any;
}

interface ExportFormat {
  id: 'json' | 'csv' | 'text_tree' | 'xml' | 'yaml';
  name: string;
  description: string;
  extension: string;
  mime_type: string;
  icon: React.ComponentType<any>;
  features: string[];
  recommended?: boolean;
}

interface ExportPreview {
  format: string;
  filename: string;
  mime_type: string;
  estimated_size: number;
  total_dependencies: number;
  preview: string;
  is_truncated: boolean;
  statistics: {
    direct_count: number;
    transitive_count: number;
    conflict_count: number;
    scope_breakdown: Record<string, number>;
  };
}

interface ExportOptions {
  include_transitive: boolean;
  include_conflicts: boolean;
  include_metadata: boolean;
  include_statistics: boolean;
  include_licenses: boolean;
  include_vulnerabilities: boolean;
  max_depth?: number;
  scope?: string[];
  filter_conflicts?: boolean;
  custom_fields?: string[];
  compression?: 'none' | 'gzip' | 'zip';
}

const ExportControls: React.FC<ExportControlsProps> = ({ 
  jarId, 
  dependencyTree, 
  analysisData 
}) => {
  // Core export state
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'csv' | 'text_tree' | 'xml' | 'yaml'>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportPhase, setExportPhase] = useState<string>('');
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<ExportPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Advanced features state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [activeTab, setActiveTab] = useState<'export' | 'history' | 'settings'>('export');
  
  // Format and options state
  const [availableFormats, setAvailableFormats] = useState<ExportFormat[]>([]);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    include_transitive: true,
    include_conflicts: true,
    include_metadata: true,
    include_statistics: true,
    include_licenses: false,
    include_vulnerabilities: false,
    max_depth: undefined,
    scope: undefined,
    filter_conflicts: undefined,
    custom_fields: [],
    compression: 'none'
  });

  // Enhanced format definitions
  const defaultFormats: ExportFormat[] = useMemo(() => [
    {
      id: 'json',
      name: 'JSON',
      description: 'Complete dependency data with full metadata',
      extension: '.json',
      mime_type: 'application/json',
      icon: Code,
      features: ['Full metadata', 'Nested structure', 'Machine readable'],
      recommended: true
    },
    {
      id: 'csv',
      name: 'CSV',
      description: 'Tabular format for spreadsheet analysis',
      extension: '.csv',
      mime_type: 'text/csv',
      icon: Database,
      features: ['Spreadsheet compatible', 'Flat structure', 'Easy filtering']
    },
    {
      id: 'text_tree',
      name: 'Text Tree',
      description: 'Human-readable hierarchical view',
      extension: '.txt',
      mime_type: 'text/plain',
      icon: FileText,
      features: ['Human readable', 'Tree structure', 'Console friendly']
    },
    {
      id: 'xml',
      name: 'XML',
      description: 'Structured XML format for integration',
      extension: '.xml',
      mime_type: 'application/xml',
      icon: Code,
      features: ['Structured format', 'Schema validation', 'Enterprise ready']
    },
    {
      id: 'yaml',
      name: 'YAML',
      description: 'Configuration-friendly format',
      extension: '.yaml',
      mime_type: 'application/x-yaml',
      icon: Settings,
      features: ['Config friendly', 'Human readable', 'Nested structure']
    }
  ], []);

  // Load available export formats
  useEffect(() => {
    const loadExportData = async () => {
      try {
        const formatsResponse = await apiService.get(`/jars/${jarId}/exports/formats`);
        if (formatsResponse.success && formatsResponse.data?.formats) {
          const enhancedFormats = formatsResponse.data.formats.map((serverFormat: any) => {
            const defaultFormat = defaultFormats.find(f => f.id === serverFormat.id);
            return { ...defaultFormat, ...serverFormat };
          });
          setAvailableFormats(enhancedFormats);
        } else {
          setAvailableFormats(defaultFormats);
        }
      } catch (error) {
        console.error('Failed to load export data:', error);
        setAvailableFormats(defaultFormats);
      }
    };

    if (jarId) {
      loadExportData();
    }
  }, [jarId, defaultFormats]);

  // Calculate estimated export size
  const calculateEstimatedSize = useCallback((summary: any, format: string) => {
    const baseSize = summary.total_dependencies * 200;
    const multipliers = {
      json: 1.5,
      csv: 0.8,
      text_tree: 1.2,
      xml: 2.0,
      yaml: 1.3
    };
    return Math.round(baseSize * (multipliers[format as keyof typeof multipliers] || 1));
  }, []);

  // Calculate complexity score
  const calculateComplexityScore = useCallback((summary: any) => {
    const total = summary.total_dependencies || 0;
    const conflicts = summary.conflicts_count || 0;
    
    if (total === 0) return 'Simple';
    if (total < 10 && conflicts === 0) return 'Simple';
    if (total < 50 && conflicts < 5) return 'Moderate';
    if (total < 100 && conflicts < 10) return 'Complex';
    return 'Very Complex';
  }, []);

  // Enhanced export statistics
  const exportStatistics = useMemo(() => {
    if (!analysisData?.summary) return null;
    
    const summary = analysisData.summary;
    return {
      total_dependencies: summary.total_dependencies || 0,
      direct_dependencies: summary.direct_dependencies || 0,
      transitive_dependencies: summary.transitive_dependencies || 0,
      conflicts_count: summary.conflicts_count || 0,
      scope_breakdown: summary.scope_breakdown || {},
      source_breakdown: summary.source_breakdown || {},
      estimated_export_size: calculateEstimatedSize(summary, selectedFormat),
      complexity_score: calculateComplexityScore(summary)
    };
  }, [analysisData, selectedFormat, calculateEstimatedSize, calculateComplexityScore]);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Load export preview
  const loadPreview = async () => {
    if (!jarId || !selectedFormat) return;

    setIsLoadingPreview(true);
    setExportError(null);

    try {
      const params = new URLSearchParams({
        format: selectedFormat,
        include_transitive: exportOptions.include_transitive.toString(),
        include_conflicts: exportOptions.include_conflicts.toString(),
        include_metadata: exportOptions.include_metadata.toString()
      });

      if (exportOptions.max_depth !== undefined) {
        params.append('max_depth', exportOptions.max_depth.toString());
      }

      const response = await apiService.get(`/jars/${jarId}/exports/preview?${params.toString()}`);
      
      if (response.success && response.data) {
        setPreviewData(response.data);
      } else {
        setExportError(response.error || 'Failed to load preview');
      }
    } catch (error) {
      console.error('Failed to load preview:', error);
      setExportError('Failed to load preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Enhanced export with detailed progress tracking
  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    setExportError(null);
    setExportProgress(0);
    setExportPhase('Initializing...');

    try {
      // Phase 1: Preparing export
      setExportPhase('Preparing export...');
      setExportProgress(10);
      
      const params = new URLSearchParams({
        format: selectedFormat,
        include_transitive: exportOptions.include_transitive.toString(),
        include_conflicts: exportOptions.include_conflicts.toString(),
        include_metadata: exportOptions.include_metadata.toString(),
        include_statistics: exportOptions.include_statistics.toString(),
        include_licenses: exportOptions.include_licenses.toString(),
        include_vulnerabilities: exportOptions.include_vulnerabilities.toString()
      });

      if (exportOptions.max_depth !== undefined) {
        params.append('max_depth', exportOptions.max_depth.toString());
      }
      if (exportOptions.compression && exportOptions.compression !== 'none') {
        params.append('compression', exportOptions.compression);
      }

      // Phase 2: Processing dependencies
      setExportPhase('Processing dependencies...');
      setExportProgress(30);

      const fullUrl = `http://localhost:9000/api/v1/jars/${jarId}/exports?${params.toString()}`;
      
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/octet-stream',
          'X-Export-Format': selectedFormat,
          'Content-Type': 'application/json'
        }
      });

      // Phase 3: Generating export
      setExportPhase('Generating export file...');
      setExportProgress(60);

      if (!response.ok) {
        let errorMessage = `Export failed: ${response.statusText}`;
        try {
          const errorText = await response.text();
          if (errorText) {
            errorMessage += ` - ${errorText}`;
          }
        } catch (e) {
          console.error('Could not read error response:', e);
        }
        throw new Error(errorMessage);
      }

      // Phase 4: Preparing download
      setExportPhase('Preparing download...');
      setExportProgress(80);

      const format = availableFormats.find(f => f.id === selectedFormat);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      let filename = `dependency-analysis-${jarId}-${timestamp}`;
      filename += format?.extension || '.txt';

      if (exportOptions.compression === 'gzip') {
        filename += '.gz';
      } else if (exportOptions.compression === 'zip') {
        filename += '.zip';
      }

      // Phase 5: Downloading
      setExportPhase('Downloading...');
      setExportProgress(90);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Phase 6: Complete
      setExportPhase('Export completed!');
      setExportProgress(100);
      setExportSuccess(true);

      setTimeout(() => {
        setExportSuccess(false);
        setExportProgress(0);
        setExportPhase('');
      }, 3000);

    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed');
      setExportProgress(0);
      setExportPhase('');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle preview toggle
  const handlePreviewToggle = () => {
    if (!showPreview) {
      setShowPreview(true);
      loadPreview();
    } else {
      setShowPreview(false);
      setPreviewData(null);
    }
  };

  // Handle retry export
  const handleRetryExport = () => {
    setExportError(null);
    handleExport();
  };

  return (
    <div className="h-full flex flex-col space-y-4 max-w-full overflow-hidden">
      {/* Enhanced Header with Statistics */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Export Dependency Analysis
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Export comprehensive dependency data with advanced options and real-time progress tracking.
            </p>
            
            {/* Quick Stats - Compact Grid */}
            {exportStatistics && (
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-1">
                    <Package className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                      {exportStatistics.total_dependencies}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-1">
                    <BarChart3 className="h-3 w-3 text-green-600 dark:text-green-400" />
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                      {exportStatistics.conflicts_count}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Conflicts</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-1">
                    <Database className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                      {Math.round(exportStatistics.estimated_export_size / 1024)}KB
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Size</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-1">
                    <Settings className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                      {exportStatistics.complexity_score}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Complexity</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Tab Navigation - Compact */}
          <div className="flex space-x-1 bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 flex-shrink-0">
            {[
              { id: 'export', label: 'Export', icon: Download },
              { id: 'history', label: 'History', icon: Clock },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Enhanced Export Error */}
      <AnimatePresence>
        {exportError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 shadow-sm"
          >
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Export Failed
                </h4>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {exportError}
                </p>
                <div className="mt-3 flex space-x-3">
                  <button
                    onClick={handleRetryExport}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry Export
                  </button>
                  <button
                    onClick={() => setExportError(null)}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60 transition-colors"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Content - Optimized for screen space */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'export' && (
            <motion.div
              key="export"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col space-y-4 overflow-hidden"
            >
              {/* Format Selection - Compact Grid */}
              <div className="flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-medium text-gray-900 dark:text-gray-100">
                    Export Format
                  </h4>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {availableFormats.length} formats
                  </span>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableFormats.map((format) => {
                    const Icon = format.icon || Download;
                    return (
                      <motion.div
                        key={format.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative rounded-lg border-2 p-3 cursor-pointer transition-all duration-200 ${
                          selectedFormat === format.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400 shadow-md'
                            : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedFormat(format.id)}
                      >
                        {format.recommended && (
                          <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                            ★
                          </div>
                        )}
                        
                        <div className="flex items-start space-x-2">
                          <div className={`flex-shrink-0 p-1.5 rounded-md ${
                            selectedFormat === format.id 
                              ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-400' 
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-1">
                              <h5 className={`text-sm font-semibold truncate ${
                                selectedFormat === format.id 
                                  ? 'text-blue-900 dark:text-blue-100' 
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}>
                                {format.name}
                              </h5>
                              {selectedFormat === format.id && (
                                <Check className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                              )}
                            </div>
                            
                            <p className={`text-xs mt-1 line-clamp-2 ${
                              selectedFormat === format.id 
                                ? 'text-blue-700 dark:text-blue-300' 
                                : 'text-gray-600 dark:text-gray-400'
                            }`}>
                              {format.description}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Export Options - Compact Layout */}
              <div className="flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-medium text-gray-900 dark:text-gray-100">
                    Export Options
                  </h4>
                  <button
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    {showAdvancedOptions ? 'Hide Advanced' : 'Show Advanced'}
                  </button>
                </div>

                {/* Basic Options - Compact Grid */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-start space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={exportOptions.include_transitive}
                        onChange={(e) => setExportOptions(prev => ({ ...prev, include_transitive: e.target.checked }))}
                        className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                      />
                      <div>
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                          Transitive Dependencies
                        </span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Include dependencies of dependencies
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={exportOptions.include_conflicts}
                        onChange={(e) => setExportOptions(prev => ({ ...prev, include_conflicts: e.target.checked }))}
                        className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                      />
                      <div>
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                          Conflict Information
                        </span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Include version conflicts and resolutions
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={exportOptions.include_metadata}
                        onChange={(e) => setExportOptions(prev => ({ ...prev, include_metadata: e.target.checked }))}
                        className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                      />
                      <div>
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                          Detailed Metadata
                        </span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Include descriptions, licenses, and build info
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={exportOptions.include_statistics}
                        onChange={(e) => setExportOptions(prev => ({ ...prev, include_statistics: e.target.checked }))}
                        className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                      />
                      <div>
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                          Statistics & Metrics
                        </span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Include dependency counts and analysis metrics
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Depth Control - Compact */}
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center space-x-3">
                      <label className="text-xs font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
                        Max Depth:
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={exportOptions.max_depth || 10}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          max_depth: parseInt(e.target.value)
                        }))}
                        className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                      />
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={exportOptions.max_depth || ''}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          max_depth: e.target.value ? parseInt(e.target.value) : undefined 
                        }))}
                        placeholder="All"
                        className="w-12 px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Advanced Options */}
                <AnimatePresence>
                  {showAdvancedOptions && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 mt-3"
                    >
                      <h5 className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-3">
                        Advanced Options
                      </h5>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="flex items-start space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={exportOptions.include_licenses}
                            onChange={(e) => setExportOptions(prev => ({ ...prev, include_licenses: e.target.checked }))}
                            className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                          />
                          <div>
                            <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                              License Analysis
                            </span>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              Include license compatibility analysis
                            </p>
                          </div>
                        </label>

                        <label className="flex items-start space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={exportOptions.include_vulnerabilities}
                            onChange={(e) => setExportOptions(prev => ({ ...prev, include_vulnerabilities: e.target.checked }))}
                            className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                          />
                          <div>
                            <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                              Security Vulnerabilities
                            </span>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              Include known security issues
                            </p>
                          </div>
                        </label>
                      </div>

                      {/* Compression Options */}
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <label className="block text-xs font-medium text-gray-900 dark:text-gray-100 mb-2">
                          Compression:
                        </label>
                        <div className="flex space-x-3">
                          {[
                            { value: 'none', label: 'None' },
                            { value: 'gzip', label: 'GZIP' },
                            { value: 'zip', label: 'ZIP' }
                          ].map((option) => (
                            <label key={option.value} className="flex items-center space-x-1">
                              <input
                                type="radio"
                                name="compression"
                                value={option.value}
                                checked={exportOptions.compression === option.value}
                                onChange={(e) => setExportOptions(prev => ({ 
                                  ...prev, 
                                  compression: e.target.value as 'none' | 'gzip' | 'zip'
                                }))}
                                className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300"
                              />
                              <span className="text-xs text-gray-900 dark:text-gray-100">{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Enhanced Preview Section - Optimized */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-medium text-gray-900 dark:text-gray-100">
                    Export Preview
                  </h4>
                  <div className="flex space-x-2">
                    <button
                      onClick={handlePreviewToggle}
                      disabled={isLoadingPreview}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                      {isLoadingPreview ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1"></div>
                          Loading...
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3 mr-1" />
                          {showPreview ? 'Hide Preview' : 'Show Preview'}
                        </>
                      )}
                    </button>
                    
                    {/* Always visible export button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleExport}
                      disabled={isExporting || availableFormats.length === 0}
                      className={`inline-flex items-center px-4 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white transition-all duration-200 ${
                        isExporting
                          ? 'bg-gray-400 cursor-not-allowed'
                          : exportSuccess
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
                      }`}
                    >
                      {isExporting ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                          Exporting...
                        </>
                      ) : exportSuccess ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Exported!
                        </>
                      ) : (
                        <>
                          <Download className="h-3 w-3 mr-1" />
                          Export {availableFormats.find(f => f.id === selectedFormat)?.name || 'File'}
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Preview Content */}
                <AnimatePresence>
                  {showPreview && previewData && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex-1 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col"
                    >
                      <div className="grid grid-cols-4 gap-2 mb-4 flex-shrink-0">
                        <div className="bg-white dark:bg-gray-800 rounded-md p-2 border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center space-x-1">
                            <FileText className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">File</span>
                          </div>
                          <p className="font-mono text-xs text-gray-900 dark:text-gray-100 mt-1 truncate">
                            {previewData.filename}
                          </p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-md p-2 border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center space-x-1">
                            <Database className="h-3 w-3 text-green-600 dark:text-green-400" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Size</span>
                          </div>
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 mt-1">
                            {formatFileSize(previewData.estimated_size)}
                          </p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-md p-2 border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center space-x-1">
                            <Package className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Count</span>
                          </div>
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 mt-1">
                            {previewData.total_dependencies}
                          </p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-md p-2 border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center space-x-1">
                            <BarChart3 className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Format</span>
                          </div>
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 mt-1">
                            {selectedFormat.toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <div className="flex-1 min-h-0">
                        <div className="flex items-center justify-between mb-2">
                          <h6 className="text-xs font-medium text-gray-900 dark:text-gray-100">
                            Content Preview
                          </h6>
                          <div className="flex items-center space-x-2">
                            {previewData.is_truncated && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                                Truncated
                              </span>
                            )}
                            <button
                              onClick={() => navigator.clipboard.writeText(previewData.preview)}
                              className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </button>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden h-full">
                          <pre className="p-3 text-xs overflow-auto h-full">
                            <code className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                              {previewData.preview}
                            </code>
                          </pre>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700 mt-3 flex-shrink-0">
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Ready to export {previewData.total_dependencies} dependencies
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleExport}
                          disabled={isExporting || availableFormats.length === 0}
                          className={`inline-flex items-center px-4 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white transition-all duration-200 ${
                            isExporting
                              ? 'bg-gray-400 cursor-not-allowed'
                              : exportSuccess
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
                          }`}
                        >
                          {isExporting ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                              Exporting...
                            </>
                          ) : exportSuccess ? (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Exported!
                            </>
                          ) : (
                            <>
                              <Download className="h-3 w-3 mr-1" />
                              Export {availableFormats.find(f => f.id === selectedFormat)?.name || 'File'}
                            </>
                          )}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Export Progress */}
              <AnimatePresence>
                {isExporting && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800 flex-shrink-0"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Exporting Dependencies
                      </h4>
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        {exportProgress}%
                      </span>
                    </div>
                    
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2">
                      <motion.div 
                        className="bg-blue-600 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${exportProgress}%` }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      />
                    </div>
                    
                    {exportPhase && (
                      <div className="flex items-center space-x-2 text-xs text-blue-700 dark:text-blue-300">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
                        <span>{exportPhase}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="text-center py-8"
            >
              <Clock className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                Export History
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Export history will be available in a future update.
              </p>
            </motion.div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="text-center py-8"
            >
              <Settings className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                Export Settings
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Advanced export settings will be available in a future update.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ExportControls;
