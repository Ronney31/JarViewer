import React, { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from './components/ThemeProvider'
import { Header } from './components/Header'
import { FileUpload } from './components/FileUpload'
import { FileTree } from './components/FileTree'
import { CodeViewer } from './components/CodeViewer'
import { MetadataPanel } from './components/MetadataPanel'
import { StatusBar } from './components/StatusBar'
import DependencyDashboard from './components/DependencyDashboard'
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

  const [viewMode, setViewMode] = useState<ViewMode>('files')

  return (
    <ThemeProvider>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header 
            currentJar={currentJar}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
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
                  <MetadataPanel />
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
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Navigation Bar for Dependency Dashboard */}
            {viewMode === 'dependencies' && currentJar && (
              <div className="flex items-center justify-between p-4 border-b bg-gray-50 dark:bg-gray-800">
                <button
                  onClick={() => setViewMode('files')}
                  className="flex items-center px-3 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Files
                </button>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Dependency Analysis - {currentJar.name}
                </h2>
                <div></div>
              </div>
            )}
            
            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              {!currentJar ? (
                <div className="flex items-center justify-center h-full">
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
                </div>
              ) : viewMode === 'dependencies' ? (
                <DependencyDashboard 
                  jarId={currentJar.id} 
                  isVisible={true}
                />
              ) : selectedFile ? (
                <CodeViewer />
              ) : (
                <div className="flex items-center justify-center h-full">
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
                    <div className="bg-card p-3 rounded-lg border text-sm mb-4">
                      <p className="text-muted-foreground">
                        <strong>JAR loaded:</strong> {currentJar.name}<br/>
                        <strong>Files:</strong> {currentJar.stats.totalFiles} files, {currentJar.stats.totalDirectories} directories
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Status Bar */}
            <StatusBar />
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
          <div className="fixed bottom-4 left-4 z-50">
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
