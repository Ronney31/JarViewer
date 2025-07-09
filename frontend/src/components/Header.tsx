import { useState } from 'react'
import { Moon, Sun, FileArchive, Settings, Info, X, Code2 } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { useJarViewerStore } from '@/stores/jarViewerStore'

export function Header() {
  const { theme, setTheme } = useTheme()
  const { currentJar, reset, autoDecompile, setAutoDecompile } = useJarViewerStore()
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

      {/* Current JAR Info */}
      {currentJar && (
        <div className="flex items-center space-x-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Current: </span>
            <span className="font-medium">{currentJar.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              ({(currentJar.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </div>
          <button
            onClick={reset}
            className="btn btn-outline btn-sm"
          >
            New JAR
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center space-x-2">
        <button
          onClick={toggleTheme}
          className="btn btn-ghost btn-sm"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </button>
        
        {/* Settings Button with Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="btn btn-ghost btn-sm" 
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* Settings Dropdown */}
          {showSettings && (
            <div className="absolute right-0 top-10 z-50 w-80 rounded-md border bg-card p-4 shadow-lg">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Settings</h3>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="h-6 w-6 rounded-sm opacity-70 hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Auto-Decompile Setting */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <label className="text-sm font-medium">Auto-Decompile</label>
                        <p className="text-xs text-muted-foreground">
                          Automatically decompile .class files when selected
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setAutoDecompile(!autoDecompile)
                        console.log('⚙️ Header: Auto-decompile toggled to:', !autoDecompile)
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoDecompile ? 'bg-primary' : 'bg-muted'
                      }`}
                      role="switch"
                      aria-checked={autoDecompile}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                          autoDecompile ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground pl-6">
                    {autoDecompile ? (
                      <span className="text-green-600">✓ Enabled - .class files will be auto-decompiled</span>
                    ) : (
                      <span>Disabled - Use decompile button manually</span>
                    )}
                  </div>
                </div>

                {/* Theme Setting */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {theme === 'light' ? (
                        <Sun className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Moon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <label className="text-sm font-medium">Theme</label>
                        <p className="text-xs text-muted-foreground">
                          Choose your preferred theme
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={toggleTheme}
                      className="btn btn-outline btn-sm"
                    >
                      {theme === 'light' ? 'Light' : 'Dark'}
                    </button>
                  </div>
                </div>

                {/* Info Section */}
                <div className="border-t pt-3">
                  <div className="text-xs text-muted-foreground">
                    <p><strong>JarViewer v1.0.0</strong></p>
                    <p>Enterprise JAR File Analyzer</p>
                    <p className="mt-1">
                      Auto-decompile: {autoDecompile ? 'ON' : 'OFF'} | 
                      Theme: {theme}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <button className="btn btn-ghost btn-sm" aria-label="About">
          <Info className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
