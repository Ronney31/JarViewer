import { Activity, Clock, HardDrive, Code2, Package } from 'lucide-react'
import { useJarViewerStore } from '@/stores/jarViewerStore'

type ViewMode = 'files' | 'dependencies';

interface StatusBarProps {
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export function StatusBar({ viewMode, onViewModeChange }: StatusBarProps = {}) {
  const { currentJar, selectedFile, isLoading, processingProgress } = useJarViewerStore()

  return (
    <div className="flex h-6 items-center justify-between border-t bg-muted/30 px-4 text-xs text-muted-foreground">
      {/* Left side - Current status */}
      <div className="flex items-center space-x-4">
        {isLoading && processingProgress && (
          <div className="flex items-center space-x-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>{processingProgress.message}</span>
            <span>({processingProgress.progress}%)</span>
          </div>
        )}
        
        {!isLoading && currentJar && (
          <div className="flex items-center space-x-2">
            <Activity className="h-3 w-3" />
            <span>Ready</span>
          </div>
        )}
        
        {/* View Mode Indicator */}
        {currentJar && viewMode && onViewModeChange && (
          <div className="flex items-center space-x-2">
            <span>View:</span>
            <button
              onClick={() => onViewModeChange(viewMode === 'files' ? 'dependencies' : 'files')}
              className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-accent transition-colors"
              title={`Switch to ${viewMode === 'files' ? 'Dependency Analysis' : 'File Structure'}`}
            >
              {viewMode === 'files' ? (
                <>
                  <Code2 className="h-3 w-3" />
                  <span>Files</span>
                </>
              ) : (
                <>
                  <Package className="h-3 w-3" />
                  <span>Dependencies</span>
                </>
              )}
            </button>
          </div>
        )}
        
        {selectedFile && (
          <div className="flex items-center space-x-2">
            <span>Selected: {selectedFile.name}</span>
          </div>
        )}
      </div>

      {/* Right side - JAR info */}
      <div className="flex items-center space-x-4">
        {currentJar && (
          <>
            <div className="flex items-center space-x-1">
              <HardDrive className="h-3 w-3" />
              <span>{currentJar.stats.totalFiles} files</span>
            </div>
            
            <div className="flex items-center space-x-1">
              <span>{(currentJar.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
            
            <div className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>
                {new Date(currentJar.uploadedAt).toLocaleTimeString()}
              </span>
            </div>
          </>
        )}
        
        <div className="text-primary">
          JarViewer v1.0.0
        </div>
      </div>
    </div>
  )
}
