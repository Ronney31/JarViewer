import { Info, Package, Shield, Clock, BarChart3, ArrowRight } from 'lucide-react'
import { useJarViewerStore } from '../stores/jarViewerStore'

interface MetadataPanelProps {
  onNavigateToDependencies?: () => void;
}

export function MetadataPanel({ onNavigateToDependencies }: MetadataPanelProps = {}) {
  const { metadata, currentJar } = useJarViewerStore()

  if (!currentJar || !metadata) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">No metadata available</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="border-b p-3">
        <h3 className="font-medium">JAR Metadata</h3>
      </div>
      
      <div className="p-3 space-y-4">
        {/* Manifest Info */}
        {metadata.manifest && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Package className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-sm">Manifest</h4>
            </div>
            <div className="space-y-1 text-xs">
              {metadata.manifest.version && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version:</span>
                  <span>{metadata.manifest.version}</span>
                </div>
              )}
              {metadata.manifest.mainClass && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Main Class:</span>
                  <span className="font-mono">{metadata.manifest.mainClass}</span>
                </div>
              )}
              {metadata.manifest.implementationTitle && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Title:</span>
                  <span>{metadata.manifest.implementationTitle}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Build Info */}
        {metadata.buildInfo && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-sm">Build Info</h4>
            </div>
            <div className="space-y-1 text-xs">
              {metadata.buildInfo.buildTool && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Build Tool:</span>
                  <span className="capitalize">{metadata.buildInfo.buildTool}</span>
                </div>
              )}
              {metadata.buildInfo.javaVersion && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Java Version:</span>
                  <span>{metadata.buildInfo.javaVersion}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Security Info */}
        {metadata.securityInfo && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-sm">Security</h4>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Signed:</span>
                <span className={metadata.securityInfo.signed ? 'text-green-600' : 'text-muted-foreground'}>
                  {metadata.securityInfo.signed ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Dependencies */}
        {metadata.dependencies && metadata.dependencies.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Info className="h-4 w-4 text-primary" />
                <h4 className="font-medium text-sm">Dependencies</h4>
              </div>
              {onNavigateToDependencies && (
                <button
                  onClick={onNavigateToDependencies}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                  title="Analyze all dependencies"
                >
                  <BarChart3 className="h-3 w-3" />
                  <span>Analyze</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="space-y-1 text-xs">
              {metadata.dependencies.slice(0, 5).map((dep, index) => (
                <div key={index} className="font-mono text-muted-foreground">
                  {dep.groupId}:{dep.artifactId}
                  {dep.version && `:${dep.version}`}
                </div>
              ))}
              {metadata.dependencies.length > 5 && (
                <div className="text-muted-foreground">
                  +{metadata.dependencies.length - 5} more...
                </div>
              )}
            </div>
            {onNavigateToDependencies && (
              <button
                onClick={onNavigateToDependencies}
                className="w-full mt-2 px-3 py-2 text-xs bg-accent text-accent-foreground rounded hover:bg-accent/80 transition-colors flex items-center justify-center space-x-2"
              >
                <BarChart3 className="h-4 w-4" />
                <span>Full Dependency Analysis</span>
              </button>
            )}
          </div>
        )}

        {/* Quick Actions */}
        {onNavigateToDependencies && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-sm">Quick Actions</h4>
            </div>
            <button
              onClick={onNavigateToDependencies}
              className="w-full px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors flex items-center justify-center space-x-2"
            >
              <Package className="h-4 w-4" />
              <span>Analyze Dependencies</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
