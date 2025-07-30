import { useState } from 'react'
import { Moon, Sun, FileArchive, Settings, Info, X, Code2, Package } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { useJarViewerStore } from '../stores/jarViewerStore'

type ViewMode = 'files' | 'dependencies';

interface HeaderProps {
  currentJar?: any;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export function Header({ currentJar, viewMode = 'files', onViewModeChange }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const { reset, autoDecompile, setAutoDecompile } = useJarViewerStore()
  const [showSettings, setShowSettings] = useState(false)

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      {/* Logo and Title */}
      <div className="flex items-center space-x-3">
        <FileArchive className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">JarViewer</h1>
          <p className="text-xs text-muted-foreground">Enterprise JAR Analyzer</p>
        </div>
      </div>

      {/* Navigation Menu - Only show when JAR is loaded */}
      {currentJar && onViewModeChange && (
        <div className="flex items-center space-x-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => onViewModeChange('files')}
            className={`flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'files'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="Browse JAR file structure and view individual files (Alt+1)"
          >
            <Code2 className="w-4 h-4" />
            <span className="hidden sm:inline">File Structure</span>
            <span className="sm:hidden">Files</span>
          </button>
          <button
            onClick={() => onViewModeChange('dependencies')}
            className={`flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'dependencies'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="Analyze JAR dependencies, conflicts, and export data (Alt+2)"
          >
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">Dependency Analysis</span>
            <span className="sm:hidden">Dependencies</span>
          </button>
        </div>
      )}

      {/* Current JAR Info and Controls */}
      <div className="flex items-center space-x-4">
        {currentJar && (
          <div className="text-sm">
            <span className="text-muted-foreground">Current: </span>
            <span className="font-medium">{currentJar.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              ({(currentJar.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center space-x-2">
          {currentJar && (
            <button
              onClick={reset}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent transition-colors"
            >
              New JAR
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-accent transition-colors"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </button>

          {/* Settings */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-md hover:bg-accent transition-colors"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>

            {/* Settings Dropdown */}
            {showSettings && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowSettings(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-lg shadow-lg z-50">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium">Settings</h3>
                      <button
                        onClick={() => setShowSettings(false)}
                        className="p-1 rounded hover:bg-accent"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm">Auto-decompile .class files</label>
                        <input
                          type="checkbox"
                          checked={autoDecompile}
                          onChange={(e) => setAutoDecompile(e.target.checked)}
                          className="rounded"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
