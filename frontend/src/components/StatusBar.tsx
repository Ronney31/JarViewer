import { Activity, Clock, HardDrive } from 'lucide-react'
import { useJarViewerStore } from '@/stores/jarViewerStore'

export function StatusBar() {
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
