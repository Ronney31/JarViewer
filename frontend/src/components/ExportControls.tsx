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

interface ExportHistory {
  id: string;
  timestamp: Date;
  format: string;
  filename: string;
  size: number;
  options: ExportOptions;
  status: 'completed' | 'failed' | 'expired';
  download_url?: string;
}

interface ExportStats {
  total_exports: number;
  successful_exports: number;
  failed_exports: number;
  total_size: number;
  most_used_format: string;
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
  const [showExportHistory, setShowExportHistory] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportHistory[]>([]);
  const [exportStats, setExportStats] = useState<ExportStats | null>(null);
  
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
  
  // UI state
  const [activeTab, setActiveTab] = useState<'export' | 'history' | 'settings'>('export');

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

  // Load available export formats and history
  useEffect(() => {
    const loadExportData = async () => {
      try {
        // Load formats
        const formatsResponse = await apiService.get(`/jars/${jarId}/exports/formats`);
        if (formatsResponse.success && formatsResponse.data?.formats) {
          // Enhance server formats with our metadata
          const enhancedFormats = formatsResponse.data.formats.map((serverFormat: any) => {
            const defaultFormat = defaultFormats.find(f => f.id === serverFormat.id);
            return { ...defaultFormat, ...serverFormat };
          });
          setAvailableFormats(enhancedFormats);
        } else {
          setAvailableFormats(defaultFormats);
        }

        // Load export history
        try {
          const historyResponse = await apiService.get(`/jars/${jarId}/exports/history`);
          if (historyResponse.success && historyResponse.data?.history) {
            setExportHistory(historyResponse.data.history);
          }
        } catch (historyError) {
          console.warn('Export history not available:', historyError);
        }

        // Load export statistics
        try {
          const statsResponse = await apiService.get(`/jars/${jarId}/exports/stats`);
          if (statsResponse.success && statsResponse.data?.stats) {
            setExportStats(statsResponse.data.stats);
          }
        } catch (statsError) {
          console.warn('Export stats not available:', statsError);
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
  }, [analysisData, selectedFormat]);

  // Calculate estimated export size
  const calculateEstimatedSize = useCallback((summary: any, format: string) => {
    const baseSize = summary.total_dependencies * 200; // Base bytes per dependency
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
    const maxDepth = summary.max_depth || 0;
    
    if (total === 0) return 'Simple';
    if (total < 10 && conflicts === 0) return 'Simple';
    if (total < 50 && conflicts < 5) return 'Moderate';
    if (total < 100 && conflicts < 10) return 'Complex';
    return 'Very Complex';
  }, []);

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

      if (exportOptions.scope && exportOptions.scope.length > 0) {
        exportOptions.scope.forEach(scope => params.append('scope', scope));
      }

      if (exportOptions.filter_conflicts !== undefined) {
        params.append('filter_conflicts', exportOptions.filter_conflicts.toString());
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
      const startTime = Date.now();
      
      // Phase 1: Preparing export
      setExportPhase('Preparing export...');
      setExportProgress(10);
      
      // Build comprehensive export parameters
      const params = new URLSearchParams({
        format: selectedFormat,
        include_transitive: exportOptions.include_transitive.toString(),
        include_conflicts: exportOptions.include_conflicts.toString(),
        include_metadata: exportOptions.include_metadata.toString(),
        include_statistics: exportOptions.include_statistics.toString(),
        include_licenses: exportOptions.include_licenses.toString(),
        include_vulnerabilities: exportOptions.include_vulnerabilities.toString()
      });

      // Add optional parameters
      if (exportOptions.max_depth !== undefined) {
        params.append('max_depth', exportOptions.max_depth.toString());
      }
      if (exportOptions.scope && exportOptions.scope.length > 0) {
        exportOptions.scope.forEach(scope => params.append('scope', scope));
      }
      if (exportOptions.filter_conflicts !== undefined) {
        params.append('filter_conflicts', exportOptions.filter_conflicts.toString());
      }
      if (exportOptions.compression && exportOptions.compression !== 'none') {
        params.append('compression', exportOptions.compression);
      }
      if (exportOptions.custom_fields && exportOptions.custom_fields.length > 0) {
        params.append('custom_fields', exportOptions.custom_fields.join(','));
      }

      // Phase 2: Processing dependencies
      setExportPhase('Processing dependencies...');
      setExportProgress(30);

      // Make export request with timeout
      const exportUrl = `/api/v1/jars/${jarId}/exports?${params.toString()}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      const response = await fetch(exportUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/octet-stream',
          'X-Export-Format': selectedFormat
        }
      });

      clearTimeout(timeoutId);

      // Phase 3: Generating export
      setExportPhase('Generating export file...');
      setExportProgress(60);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Export failed: ${response.statusText} - ${errorText}`);
      }

      // Phase 4: Preparing download
      setExportPhase('Preparing download...');
      setExportProgress(80);

      // Enhanced filename generation
      const contentDisposition = response.headers.get('Content-Disposition');
      const format = availableFormats.find(f => f.id === selectedFormat);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      let filename = `dependency-analysis-${jarId}-${timestamp}`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      } else {
        filename += format?.extension || '.txt';
      }

      // Add compression suffix if applicable
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

      // Add to export history
      const exportRecord: ExportHistory = {
        id: `export-${Date.now()}`,
        timestamp: new Date(),
        format: selectedFormat,
        filename,
        size: blob.size,
        options: { ...exportOptions },
        status: 'completed',
        download_url: url
      };
      setExportHistory(prev => [exportRecord, ...prev.slice(0, 9)]); // Keep last 10

      // Show success for 3 seconds
      setTimeout(() => {
        setExportSuccess(false);
        setExportProgress(0);
        setExportPhase('');
      }, 3000);

      // Track export analytics
      const duration = Date.now() - startTime;
      console.log(`Export completed in ${duration}ms`, {
        format: selectedFormat,
        size: blob.size,
        options: exportOptions
      });

    } catch (error) {
      console.error('Export failed:', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        setExportError('Export timed out. Please try again with fewer dependencies or simpler options.');
      } else {
        setExportError(error instanceof Error ? error.message : 'Export failed');
      }
      
      setExportProgress(0);
      setExportPhase('');
      
      // Add failed export to history
      const failedRecord: ExportHistory = {
        id: `export-failed-${Date.now()}`,
        timestamp: new Date(),
        format: selectedFormat,
        filename: `failed-export-${selectedFormat}`,
        size: 0,
        options: { ...exportOptions },
        status: 'failed'
      };
      setExportHistory(prev => [failedRecord, ...prev.slice(0, 9)]);
      
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

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };



  return (
    <div className="space-y-6 max-w-full">
      {/* Enhanced Header with Statistics */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Export Dependency Analysis
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Export comprehensive dependency data with advanced options and real-time progress tracking.
            </p>
            
            {/* Quick Stats */}
            {exportStatistics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {exportStatistics.total_dependencies}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total Dependencies</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {exportStatistics.conflicts_count}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Conflicts</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <Database className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {Math.round(exportStatistics.estimated_export_size / 1024)}KB
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Est. Size</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <Settings className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {exportStatistics.complexity_score}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Complexity</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
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
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
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

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'export' && (
          <motion.div
            key="export"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Enhanced Format Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Select Export Format
                </h4>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {availableFormats.length} formats available
                </span>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {availableFormats.map((format) => {
                  const Icon = format.icon || Download;
                  return (
                    <motion.div
                      key={format.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`relative rounded-xl border-2 p-5 cursor-pointer transition-all duration-200 ${
                        selectedFormat === format.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400 shadow-lg'
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600 hover:shadow-md'
                      }`}
                      onClick={() => setSelectedFormat(format.id)}
                    >
                      {/* Recommended Badge */}
                      {format.recommended && (
                        <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          Recommended
                        </div>
                      )}
                      
                      <div className="flex items-start space-x-4">
                        <div className={`flex-shrink-0 p-2 rounded-lg ${
                          selectedFormat === format.id 
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-400' 
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h5 className={`text-base font-semibold ${
                              selectedFormat === format.id 
                                ? 'text-blue-900 dark:text-blue-100' 
                                : 'text-gray-900 dark:text-gray-100'
                            }`}>
                              {format.name}
                            </h5>
                            {selectedFormat === format.id && (
                              <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          
                          <p className={`text-sm mt-1 ${
                            selectedFormat === format.id 
                              ? 'text-blue-700 dark:text-blue-300' 
                              : 'text-gray-600 dark:text-gray-400'
                          }`}>
                            {format.description}
                          </p>
                          
                          {/* Features */}
                          {format.features && (
                            <div className="flex flex-wrap gap-1 mt-3">
                              {format.features.map((feature, index) => (
                                <span
                                  key={index}
                                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                    selectedFormat === format.id
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300'
                                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                  }`}
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Enhanced Export Options */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Export Options
                </h4>
                <button
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  {showAdvancedOptions ? 'Hide Advanced' : 'Show Advanced'}
                </button>
              </div>

              {/* Basic Options */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Content Options
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={exportOptions.include_transitive}
                      onChange={(e) => setExportOptions(prev => ({ ...prev, include_transitive: e.target.checked }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Transitive Dependencies
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Include dependencies of dependencies
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={exportOptions.include_conflicts}
                      onChange={(e) => setExportOptions(prev => ({ ...prev, include_conflicts: e.target.checked }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Conflict Information
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Include version conflicts and resolutions
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={exportOptions.include_metadata}
                      onChange={(e) => setExportOptions(prev => ({ ...prev, include_metadata: e.target.checked }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Detailed Metadata
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Include descriptions, licenses, and build info
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={exportOptions.include_statistics}
                      onChange={(e) => setExportOptions(prev => ({ ...prev, include_statistics: e.target.checked }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Statistics & Metrics
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Include dependency counts and analysis metrics
                      </p>
                    </div>
                  </label>
                </div>

                {/* Depth Control */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-4">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Maximum Depth:
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={exportOptions.max_depth || 10}
                        onChange={(e) => setExportOptions(prev => ({ 
                          ...prev, 
                          max_depth: parseInt(e.target.value)
                        }))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
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
                        className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
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
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
                  >
                    <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
                      Advanced Options
                    </h5>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={exportOptions.include_licenses}
                          onChange={(e) => setExportOptions(prev => ({ ...prev, include_licenses: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            License Analysis
                          </span>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Include license compatibility analysis
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={exportOptions.include_vulnerabilities}
                          onChange={(e) => setExportOptions(prev => ({ ...prev, include_vulnerabilities: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Security Vulnerabilities
                          </span>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Include known security issues
                          </p>
                        </div>
                      </label>
                    </div>

                    {/* Compression Options */}
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Compression:
                      </label>
                      <div className="flex space-x-4">
                        {[
                          { value: 'none', label: 'None', description: 'No compression' },
                          { value: 'gzip', label: 'GZIP', description: 'Standard compression' },
                          { value: 'zip', label: 'ZIP', description: 'Archive format' }
                        ].map((option) => (
                          <label key={option.value} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="compression"
                              value={option.value}
                              checked={exportOptions.compression === option.value}
                              onChange={(e) => setExportOptions(prev => ({ 
                                ...prev, 
                                compression: e.target.value as 'none' | 'gzip' | 'zip'
                              }))}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <div>
                              <span className="text-sm text-gray-900 dark:text-gray-100">{option.label}</span>
                              <p className="text-xs text-gray-600 dark:text-gray-400">{option.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Enhanced Preview Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Export Preview
                </h4>
                <div className="flex space-x-2">
                  <button
                    onClick={handlePreviewToggle}
                    disabled={isLoadingPreview}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                  >
                    {isLoadingPreview ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                        Loading...
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        {showPreview ? 'Hide Preview' : 'Show Preview'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showPreview && previewData && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm"
                  >
                    {/* Preview Header */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">Filename</span>
                        </div>
                        <p className="font-mono text-sm text-gray-900 dark:text-gray-100 mt-1 truncate">
                          {previewData.filename}
                        </p>
                      </div>
                      
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-2">
                          <Database className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">Size</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                          {formatFileSize(previewData.estimated_size)}
                        </p>
                      </div>
                      
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-2">
                          <Package className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">Dependencies</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                          {previewData.total_dependencies}
                        </p>
                      </div>
                      
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-2">
                          <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">Format</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                          {selectedFormat.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    {/* Preview Statistics */}
                    {previewData.statistics && (
                      <div className="mb-6">
                        <h6 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                          Export Statistics
                        </h6>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="text-center">
                            <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                              {previewData.statistics.direct_count}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">Direct</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                              {previewData.statistics.transitive_count}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">Transitive</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                              {previewData.statistics.conflict_count}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">Conflicts</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                              {Object.keys(previewData.statistics.scope_breakdown).length}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">Scopes</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Content Preview */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h6 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Content Preview
                        </h6>
                        <div className="flex items-center space-x-2">
                          {previewData.is_truncated && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                              Truncated
                            </span>
                          )}
                          <button
                            onClick={() => navigator.clipboard.writeText(previewData.preview)}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <pre className="p-4 text-xs overflow-auto max-h-80 min-h-32">
                          <code className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                            {previewData.preview}
                          </code>
                        </pre>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Enhanced Export Progress */}
            <AnimatePresence>
              {isExporting && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-medium text-blue-900 dark:text-blue-100">
                      Exporting Dependencies
                    </h4>
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {exportProgress}%
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3 mb-3">
                    <motion.div 
                      className="bg-blue-600 h-3 rounded-full flex items-center justify-end pr-2"
                      initial={{ width: 0 }}
                      animate={{ width: `${exportProgress}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      {exportProgress > 20 && (
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      )}
                    </motion.div>
                  </div>
                  
                  {/* Current Phase */}
                  {exportPhase && (
                    <div className="flex items-center space-x-2 text-sm text-blue-700 dark:text-blue-300">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                      <span>{exportPhase}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Export Actions */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">
                    {exportStatistics?.total_dependencies || 0}
                  </span> dependencies ready for export
                </div>
                {exportStatistics && (
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    Est. {Math.round(exportStatistics.estimated_export_size / 1024)}KB
                  </div>
                )}
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handlePreviewToggle}
                  disabled={isExporting || isLoadingPreview}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleExport}
                  disabled={isExporting || availableFormats.length === 0}
                  className={`inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white transition-all duration-200 ${
                    isExporting
                      ? 'bg-gray-400 cursor-not-allowed'
                      : exportSuccess
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'
                  }`}
                >
                  {isExporting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Exporting...
                    </>
                  ) : exportSuccess ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Exported!
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Export {availableFormats.find(f => f.id === selectedFormat)?.name || 'File'}
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Export History Tab */}
        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Export History
              </h4>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {exportHistory.length} exports
                </span>
                {exportHistory.length > 0 && (
                  <button
                    onClick={() => setExportHistory([])}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {exportHistory.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                  No Export History
                </h3>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Your export history will appear here after you create exports.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {exportHistory.map((record) => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-white dark:bg-gray-800 rounded-lg border p-4 ${
                      record.status === 'completed'
                        ? 'border-green-200 dark:border-green-800'
                        : record.status === 'failed'
                        ? 'border-red-200 dark:border-red-800'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${
                          record.status === 'completed'
                            ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                            : record.status === 'failed'
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {record.status === 'completed' ? (
                            <Check className="h-4 w-4" />
                          ) : record.status === 'failed' ? (
                            <X className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        
                        <div>
                          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {record.filename}
                          </h5>
                          <div className="flex items-center space-x-4 mt-1 text-xs text-gray-600 dark:text-gray-400">
                            <span>{record.format.toUpperCase()}</span>
                            <span>{formatFileSize(record.size)}</span>
                            <span>{record.timestamp.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {record.status === 'completed' && record.download_url && (
                          <button
                            onClick={() => window.open(record.download_url, '_blank')}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Download
                          </button>
                        )}
                        <button
                          onClick={() => setExportHistory(prev => prev.filter(h => h.id !== record.id))}
                          className="inline-flex items-center px-2 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Export Statistics */}
            {exportStats && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                <h5 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Export Statistics
                </h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {exportStats.total_exports}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Exports</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {exportStats.successful_exports}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Successful</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {exportStats.failed_exports}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {formatFileSize(exportStats.total_size)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Size</div>
                  </div>
                </div>
              </div>
            )}
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
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Export Settings
              </h4>
            </div>

            {/* Default Export Preferences */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h5 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-4">
                Default Export Preferences
              </h5>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Default Format
                  </label>
                  <select
                    value={selectedFormat}
                    onChange={(e) => setSelectedFormat(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {availableFormats.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.name} - {format.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Auto-save Exports
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="auto-save"
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="auto-save" className="text-sm text-gray-700 dark:text-gray-300">
                      Automatically save export history for future reference
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Export Timeout (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    defaultValue="5"
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>

            {/* Export Templates */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h5 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-4">
                Export Templates
              </h5>
              
              <div className="space-y-3">
                {[
                  { name: 'Quick Export', description: 'Basic dependency information only' },
                  { name: 'Detailed Analysis', description: 'Full metadata and conflict analysis' },
                  { name: 'Security Audit', description: 'Focus on vulnerabilities and licenses' },
                  { name: 'Custom Template', description: 'Create your own export template' }
                ].map((template, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div>
                      <h6 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {template.name}
                      </h6>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {template.description}
                      </p>
                    </div>
                    <button className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                      {template.name === 'Custom Template' ? 'Create' : 'Use'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Export Preview
          </h4>
          <button
            onClick={handlePreviewToggle}
            disabled={isLoadingPreview}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {isLoadingPreview ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-2"></div>
                Loading...
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </>
            )}
          </button>
        </div>

        {showPreview && previewData && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Filename:</span>
                <span className="font-mono text-gray-900 dark:text-gray-100">{previewData.filename}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Estimated size:</span>
                <span className="text-gray-900 dark:text-gray-100">{formatFileSize(previewData.estimated_size)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Dependencies:</span>
                <span className="text-gray-900 dark:text-gray-100">{previewData.total_dependencies}</span>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Content Preview:</span>
                  {previewData.is_truncated && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Truncated for display</span>
                  )}
                </div>
                <pre className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded p-3 text-xs overflow-auto max-h-60 min-h-20">
                  <code className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{previewData.preview}</code>
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Export Progress */}
      {isExporting && exportProgress > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Export Progress</span>
            <span className="text-gray-900 dark:text-gray-100">{exportProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${exportProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {analysisData?.summary?.total_dependencies || 0} dependencies will be exported
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handlePreviewToggle}
            disabled={isExporting || isLoadingPreview}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || availableFormats.length === 0}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white transition-colors ${
              isExporting
                ? 'bg-gray-400 cursor-not-allowed'
                : exportSuccess
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Exporting...
              </>
            ) : exportSuccess ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Exported!
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export {availableFormats.find(f => f.id === selectedFormat)?.name || 'File'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportControls;