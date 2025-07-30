import React, { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { Package } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemeProvider } from './components/ThemeProvider'
import { Header } from './components/Header'
import { FileUpload } from './components/FileUpload'
import { FileTree } from './components/FileTree'
import { CodeViewer } from './components/CodeViewer'
import { MetadataPanel } from './components/MetadataPanel'
import { StatusBar } from './components/StatusBar'
import SingleJarDashboard from './components/SingleJarDashboard'
import { useJarViewerStore } from './stores/jarViewerStore'
import './index.css'

type ViewMode = 'files' | 'dependencies';

function App() {
  console.log('🚀 JarViewer: Full application rendering...')
  
  const { 
    currentJar, 
    selectedFile, 
    fileContent, 
    sidebarCollapsed, 
    setSidebarCollapsed,
    isLoading,
    error,
    clearError
  } = useJarViewerStore()

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Initialize view mode from URL hash
    const hash = window.location.hash.slice(1)
    return hash === 'dependencies' ? 'dependencies' : 'files'
  })

  // Handle view mode changes and URL updates
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    // Update URL hash to reflect current view
    window.history.replaceState(null, '', mode === 'dependencies' ? '#dependencies' : '#files')
  }

  // Keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when a JAR is loaded and no input is focused
      if (!currentJar || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      // Alt + 1: Switch to Files view
      if (event.altKey && event.key === '1') {
        event.preventDefault()
        handleViewModeChange('files')
      }
      
      // Alt + 2: Switch to Dependencies view
      if (event.altKey && event.key === '2') {
        event.preventDefault()
        handleViewModeChange('dependencies')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentJar])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      const newMode = hash === 'dependencies' ? 'dependencies' : 'files'
      if (newMode !== viewMode) {
        setViewMode(newMode)
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [viewMode])

  return (
    <ThemeProvider>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header 
            currentJar={currentJar}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 pt-14 overflow-hidden">
          {/* Sidebar */}
          <div className={`
            transition-all duration-300 ease-in-out
            ${sidebarCollapsed ? 'w-0' : 'w-80'}
            border-r bg-card overflow-hidden
          `}>
            <div className="flex flex-col h-full">
              {/* Upload Area */}
              {!currentJar && (
                <div className="p-4 border-b">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-2">Welcome to JarViewer</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload a JAR file to start analyzing
                    </p>
                  </div>
                  <FileUpload />
                </div>
              )}

              {/* File Tree */}
              {currentJar && (
                <div className="flex-1 overflow-hidden">
                  <FileTree />
                </div>
              )}

              {/* Metadata Panel */}
              {currentJar && (
                <div className="border-t">
                  <MetadataPanel 
                    onNavigateToDependencies={() => handleViewModeChange('dependencies')}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="
              fixed left-0 top-1/2 -translate-y-1/2 z-40
              bg-card border border-l-0 rounded-r-md
              p-2 hover:bg-accent transition-colors
              shadow-md
            "
            style={{ left: sidebarCollapsed ? '0' : '320px' }}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <svg 
              className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Main Content */}
          <div 
            className="flex-1 flex flex-col overflow-hidden"
            onContextMenu={(e) => {
              if (currentJar) {
                e.preventDefault()
                // Show context menu for view switching
                const contextMenu = document.createElement('div')
                contextMenu.className = 'fixed bg-card border border-border rounded-lg shadow-lg p-2 z-50'
                contextMenu.style.left = `${e.clientX}px`
                contextMenu.style.top = `${e.clientY}px`
                
                const filesOption = document.createElement('button')
                filesOption.className = 'w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors'
                filesOption.textContent = 'File Structure'
                filesOption.onclick = () => {
                  handleViewModeChange('files')
                  document.body.removeChild(contextMenu)
                }
                
                const depsOption = document.createElement('button')
                depsOption.className = 'w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors'
                depsOption.textContent = 'Dependency Analysis'
                depsOption.onclick = () => {
                  handleViewModeChange('dependencies')
                  document.body.removeChild(contextMenu)
                }
                
                contextMenu.appendChild(filesOption)
                contextMenu.appendChild(depsOption)
                document.body.appendChild(contextMenu)
                
                // Remove context menu when clicking elsewhere
                const removeMenu = () => {
                  if (document.body.contains(contextMenu)) {
                    document.body.removeChild(contextMenu)
                  }
                  document.removeEventListener('click', removeMenu)
                }
                setTimeout(() => document.addEventListener('click', removeMenu), 100)
              }
            }}
          >
            {/* Navigation Bar for Dependency Dashboard */}
            {viewMode === 'dependencies' && currentJar && (
              <div className="flex items-center justify-between p-4 border-b bg-card border-border">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => handleViewModeChange('files')}
                    className="flex items-center px-3 py-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
                    title="Back to File Structure"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Files
                  </button>
                  
                  {/* Breadcrumb Navigation */}
                  <nav className="flex items-center space-x-2 text-sm">
                    <span className="text-muted-foreground">JarViewer</span>
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <button
                      onClick={() => handleViewModeChange('files')}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {currentJar.name}
                    </button>
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-foreground font-medium">Dependency Analysis</span>
                  </nav>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">{currentJar.name}</span>
                    <span className="ml-2">
                      ({(currentJar.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleViewModeChange('files')}
                      className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent transition-colors"
                      title="View File Structure"
                    >
                      Files
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {!currentJar ? (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center justify-center h-full"
                >
                  <div className="text-center max-w-md">
                    <div className="mb-6">
                      <svg className="w-20 h-20 mx-auto text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-semibold mb-3">Welcome to JarViewer</h2>
                    <p className="text-muted-foreground mb-6">
                      Enterprise-grade JAR file analyzer with decompilation, 
                      metadata extraction, and security scanning capabilities.
                    </p>
                    <div className="bg-card p-4 rounded-lg border">
                      <h3 className="font-medium mb-2">Get Started</h3>
                      <p className="text-sm text-muted-foreground">
                        Upload a JAR file using the sidebar or drag and drop it anywhere on this page.
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : viewMode === 'dependencies' ? (
                <motion.div
                  key="dependencies"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  <SingleJarDashboard 
                    jarId={currentJar.id}
                    className="h-full"
                  />
                </motion.div>
              ) : selectedFile ? (
                <motion.div
                  key="codeviewer"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  <CodeViewer />
                </motion.div>
              ) : (
                <motion.div
                  key="fileselect"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center justify-center h-full"
                >
                  <div className="text-center">
                    <div className="mb-4">
                      <svg className="w-16 h-16 mx-auto text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-medium mb-2">Select a file to view</h3>
                    <p className="text-muted-foreground mb-4">
                      Choose a file from the tree on the left to view its contents
                    </p>
                    <div className="bg-card p-4 rounded-lg border text-sm mb-4">
                      <div className="space-y-2">
                        <p className="text-muted-foreground">
                          <strong>JAR loaded:</strong> {currentJar.name}<br/>
                          <strong>Files:</strong> {currentJar.stats.totalFiles} files, {currentJar.stats.totalDirectories} directories
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="text-muted-foreground">Ready for dependency analysis</span>
                          <button
                            onClick={() => handleViewModeChange('dependencies')}
                            className="flex items-center space-x-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
                          >
                            <Package className="h-4 w-4" />
                            <span>Analyze Dependencies</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            </div>

            {/* Status Bar */}
            <StatusBar 
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />
          </div>
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-card p-6 rounded-lg shadow-lg border">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span>Processing...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error Toast */}
        {error && (
          <div className="fixed top-20 right-4 z-50">
            <div className="bg-destructive text-destructive-foreground p-4 rounded-lg shadow-lg max-w-md border">
              <div className="flex items-start justify-between">
                <div className="flex">
                  <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm">{error}</span>
                </div>
                <button
                  onClick={clearError}
                  className="ml-2 text-destructive-foreground/70 hover:text-destructive-foreground"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Toast Notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'hsl(var(--card))',
              color: 'hsl(var(--card-foreground))',
              border: '1px solid hsl(var(--border))',
            },
            success: {
              iconTheme: {
                primary: 'hsl(var(--primary))',
                secondary: 'hsl(var(--primary-foreground))',
              },
            },
            error: {
              iconTheme: {
                primary: 'hsl(var(--destructive))',
                secondary: 'hsl(var(--destructive-foreground))',
              },
            },
          }}
        />

        {/* Debug Panel (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed bottom-4 left-4 z-50 opacity-60">
            <div className="bg-card border rounded-lg p-3 shadow-lg text-xs">
              <div className="font-medium mb-1">🚀 JarViewer Debug</div>
              <div className="space-y-1 text-muted-foreground">
                <div>JAR: {currentJar ? '✅' : '❌'}</div>
                <div>Selected: {selectedFile ? '✅' : '❌'}</div>
                <div>Content: {fileContent ? '✅' : '❌'}</div>
                <div>Loading: {isLoading ? '🔄' : '✅'}</div>
                <div>Sidebar: {sidebarCollapsed ? '📱' : '📖'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  )
}

export default App
