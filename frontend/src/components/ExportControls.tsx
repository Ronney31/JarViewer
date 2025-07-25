import React, { useState, useEffect } from 'react';
import { Download, Check, Eye, AlertCircle, X, RefreshCw } from 'lucide-react';
import { apiService } from '../services/apiService';

interface ExportControlsProps {
  jarId: string;
  dependencyTree: any;
  analysisData: any;
}

interface ExportFormat {
  id: 'json' | 'csv' | 'text_tree';
  name: string;
  description: string;
  extension: string;
  mime_type: string;
}

interface ExportPreview {
  format: string;
  filename: string;
  mime_type: string;
  estimated_size: number;
  total_dependencies: number;
  preview: string;
  is_truncated: boolean;
}

interface ExportOptions {
  include_transitive: boolean;
  include_conflicts: boolean;
  include_metadata: boolean;
  max_depth?: number;
  scope?: string[];
  filter_conflicts?: boolean;
}

const ExportControls: React.FC<ExportControlsProps> = ({ 
  jarId, 
  dependencyTree, 
  analysisData 
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'csv' | 'text_tree'>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<ExportPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [availableFormats, setAvailableFormats] = useState<ExportFormat[]>([]);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    include_transitive: true,
    include_conflicts: true,
    include_metadata: true,
    max_depth: undefined,
    scope: undefined,
    filter_conflicts: undefined
  });

  // Load available export formats on component mount
  useEffect(() => {
    const loadExportFormats = async () => {
      try {
        const response = await apiService.get(`/jars/${jarId}/exports/formats`);
        if (response.success && response.data?.formats) {
          setAvailableFormats(response.data.formats);
        } else {
          // Fallback to default formats
          setAvailableFormats([
            {
              id: 'json' as const,
              name: 'JSON',
              description: 'Complete dependency data in JSON format',
              extension: '.json',
              mime_type: 'application/json'
            },
            {
              id: 'csv' as const,
              name: 'CSV',
              description: 'Tabular format suitable for spreadsheets',
              extension: '.csv',
              mime_type: 'text/csv'
            },
            {
              id: 'text_tree' as const,
              name: 'Text Tree',
              description: 'Human-readable tree structure',
              extension: '.txt',
              mime_type: 'text/plain'
            }
          ]);
        }
      } catch (error) {
        console.error('Failed to load export formats:', error);
        // Use fallback formats
        setAvailableFormats([
          {
            id: 'json' as const,
            name: 'JSON',
            description: 'Complete dependency data in JSON format',
            extension: '.json',
            mime_type: 'application/json'
          },
          {
            id: 'csv' as const,
            name: 'CSV',
            description: 'Tabular format suitable for spreadsheets',
            extension: '.csv',
            mime_type: 'text/csv'
          },
          {
            id: 'text_tree' as const,
            name: 'Text Tree',
            description: 'Human-readable tree structure',
            extension: '.txt',
            mime_type: 'text/plain'
          }
        ]);
      }
    };

    if (jarId) {
      loadExportFormats();
    }
  }, [jarId]);

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

  // Handle export with progress tracking
  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    setExportError(null);
    setExportProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setExportProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Build export URL with parameters
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

      // Make export request
      const exportUrl = `/api/v1/jars/${jarId}/exports?${params.toString()}`;
      const response = await fetch(exportUrl);

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Export failed: ${response.statusText} - ${errorText}`);
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `dependency-analysis-${jarId}`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      } else {
        const format = availableFormats.find(f => f.id === selectedFormat);
        filename += format?.extension || '.txt';
      }

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportProgress(100);
      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
        setExportProgress(0);
      }, 3000);

    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed');
      setExportProgress(0);
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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Export Dependency Analysis
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Export the complete dependency analysis data in your preferred format.
        </p>
      </div>

      {/* Export Error */}
      {exportError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
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
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </button>
                <button
                  onClick={() => setExportError(null)}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                >
                  <X className="h-3 w-3 mr-1" />
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Format Selection */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Select Export Format
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {availableFormats.map((format) => (
            <div
              key={format.id}
              className={`relative rounded-lg border p-4 cursor-pointer transition-colors ${
                selectedFormat === format.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                  : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
              }`}
              onClick={() => setSelectedFormat(format.id)}
            >
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${
                  selectedFormat === format.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                }`}>
                  {selectedFormat === format.id ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Download className="h-5 w-5" />
                  )}
                </div>
                <div className="ml-3">
                  <h5 className={`text-sm font-medium ${
                    selectedFormat === format.id 
                      ? 'text-blue-900 dark:text-blue-100' 
                      : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {format.name}
                  </h5>
                  <p className={`text-xs ${
                    selectedFormat === format.id 
                      ? 'text-blue-700 dark:text-blue-300' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {format.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export Options */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Export Options
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={exportOptions.include_transitive}
              onChange={(e) => setExportOptions(prev => ({ ...prev, include_transitive: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Include transitive dependencies</span>
          </label>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={exportOptions.include_conflicts}
              onChange={(e) => setExportOptions(prev => ({ ...prev, include_conflicts: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Include conflict information</span>
          </label>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={exportOptions.include_metadata}
              onChange={(e) => setExportOptions(prev => ({ ...prev, include_metadata: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Include detailed metadata</span>
          </label>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-700 dark:text-gray-300">Max depth:</label>
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
              className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

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
                <pre className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded p-3 text-xs overflow-x-auto max-h-40 overflow-y-auto">
                  <code className="text-gray-900 dark:text-gray-100">{previewData.preview}</code>
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