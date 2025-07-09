import { useEffect, useState } from 'react'
import { Copy, Download, Eye, Code2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { useJarViewerStore } from '@/stores/jarViewerStore'
import { useTheme } from './ThemeProvider'

export function CodeViewer() {
  const { selectedFile, fileContent, decompileClass, autoDecompile } = useJarViewerStore()
  const { theme } = useTheme()
  const [isDecompiling, setIsDecompiling] = useState(false)

  // Determine if we're in dark mode
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // Debug logging
  console.log('🖥️ CodeViewer: Rendering with:', {
    selectedFile: selectedFile?.name,
    fileContentType: typeof fileContent,
    fileContentLength: fileContent?.length || 0,
    fileContentTruthy: !!fileContent,
    autoDecompile,
    isClassFile: selectedFile?.extension === '.class'
  })

  if (!selectedFile) {
    console.log('🖥️ CodeViewer: No selected file')
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Code2 className="mx-auto h-12 w-12 mb-4" />
          <p>Select a file to view its contents</p>
        </div>
      </div>
    )
  }

  const handleCopy = async () => {
    if (fileContent) {
      try {
        await navigator.clipboard.writeText(fileContent)
        toast.success('Content copied to clipboard')
      } catch (error) {
        toast.error('Failed to copy content')
      }
    }
  }

  const handleDownload = () => {
    if (fileContent && selectedFile) {
      const blob = new Blob([fileContent], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = selectedFile.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('File downloaded')
    }
  }

  const handleDecompile = async () => {
    if (selectedFile?.extension === '.class') {
      setIsDecompiling(true)
      try {
        console.log('🔧 CodeViewer: Starting decompilation for:', selectedFile.path)
        await decompileClass(selectedFile.path)
        toast.success('Class decompiled successfully')
        console.log('✅ CodeViewer: Decompilation completed')
      } catch (error) {
        console.error('❌ CodeViewer: Decompilation failed:', error)
        toast.error('Failed to decompile class')
      } finally {
        setIsDecompiling(false)
      }
    }
  }

  const getLanguage = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'java':
        return 'java'
      case 'json':
        return 'json'
      case 'xml':
        return 'xml'
      case 'properties':
        return 'properties'
      case 'md':
        return 'markdown'
      case 'yml':
      case 'yaml':
        return 'yaml'
      default:
        return 'text'
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center space-x-3">
          <Eye className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">{selectedFile.name}</h3>
            <p className="text-sm text-muted-foreground">
              {selectedFile.path}
              {selectedFile.size && (
                <span className="ml-2">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {selectedFile.extension === '.class' && !autoDecompile && (
            <button
              onClick={handleDecompile}
              disabled={isDecompiling}
              className="btn btn-outline btn-sm"
              title="Decompile this class file"
            >
              {isDecompiling ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Code2 className="h-4 w-4" />
              )}
              {isDecompiling ? 'Decompiling...' : 'Decompile'}
            </button>
          )}
          
          {selectedFile.extension === '.class' && autoDecompile && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Code2 className="h-4 w-4" />
              <span>Auto-decompiled</span>
            </div>
          )}
          
          <button
            onClick={handleCopy}
            className="btn btn-outline btn-sm"
            disabled={!fileContent}
            title="Copy content to clipboard"
          >
            <Copy className="h-4 w-4" />
            Copy
          </button>
          
          <button
            onClick={handleDownload}
            className="btn btn-outline btn-sm"
            disabled={!fileContent}
            title="Download file"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {fileContent !== null ? (
          <div>
            <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
              Content length: {fileContent.length} characters | Type: {typeof fileContent}
            </div>
            <pre 
              style={{
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                color: isDark ? '#f9fafb' : '#1f2937',
                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                borderRadius: '0.5rem',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                fontFamily: 'JetBrains Mono, Fira Code, Monaco, Cascadia Code, Roboto Mono, monospace',
                fontSize: '0.875rem',
                lineHeight: '1.5',
                padding: '1rem',
                margin: 0,
                minHeight: '200px',
                width: '100%',
                overflow: 'auto'
              }}
            >
              <code className={`language-${getLanguage(selectedFile.name)}`}>
                {fileContent.length > 0 ? fileContent : '(Empty file or no content available)'}
              </code>
            </pre>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
              <p>Loading file content...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
