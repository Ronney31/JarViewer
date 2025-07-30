import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileArchive, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

import { useJarViewerStore } from '../stores/jarViewerStore'

export function FileUpload() {
  const { loadJar, isLoading } = useJarViewerStore()
  const [dragActive, setDragActive] = useState(false)

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) return

      // Validate file type
      if (!file.name.toLowerCase().endsWith('.jar')) {
        toast.error('Please select a JAR file')
        return
      }

      // Validate file size (500MB limit)
      const maxSize = 500 * 1024 * 1024 // 500MB
      if (file.size > maxSize) {
        toast.error('File size must be less than 500MB')
        return
      }

      try {
        await loadJar(file)
        toast.success('JAR file loaded successfully!')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load JAR file')
      }
    },
    [loadJar]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/java-archive': ['.jar'],
      'application/x-java-archive': ['.jar'],
      'application/zip': ['.jar'],
    },
    maxFiles: 1,
    disabled: isLoading,
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
  })

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        {/* Upload Area */}
        <div
          {...getRootProps()}
          className={`
            relative cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-all duration-200
            ${isDragActive || dragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary hover:bg-accent/50'
            }
            ${isLoading ? 'pointer-events-none opacity-50' : ''}
          `}
        >
          <input {...getInputProps()} />
          
          <div className="flex flex-col items-center space-y-4">
            {isLoading ? (
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            ) : (
              <motion.div
                animate={{ scale: isDragActive ? 1.1 : 1 }}
                transition={{ duration: 0.2 }}
              >
                <FileArchive className="h-16 w-16 text-primary" />
              </motion.div>
            )}
            
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">
                {isLoading
                  ? 'Processing JAR file...'
                  : isDragActive
                  ? 'Drop your JAR file here'
                  : 'Upload JAR File'
                }
              </h3>
              
              {!isLoading && (
                <p className="text-sm text-muted-foreground">
                  Drag and drop your JAR file here, or click to browse
                </p>
              )}
            </div>
            
            {!isLoading && (
              <button className="btn btn-primary btn-lg">
                <Upload className="mr-2 h-4 w-4" />
                Choose File
              </button>
            )}
          </div>
        </div>

        {/* File Requirements */}
        <div className="mt-6 rounded-lg bg-muted/50 p-4">
          <h4 className="mb-2 font-medium">File Requirements:</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li className="flex items-center">
              <span className="mr-2">•</span>
              File format: JAR, WAR, or EAR files
            </li>
            <li className="flex items-center">
              <span className="mr-2">•</span>
              Maximum size: 500MB
            </li>
            <li className="flex items-center">
              <span className="mr-2">•</span>
              Processing is done locally (no data leaves your machine)
            </li>
          </ul>
        </div>

        {/* Security Notice */}
        <div className="mt-4 flex items-start space-x-2 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-blue-800 dark:text-blue-200">
              Secure & Private
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              Your JAR files are processed entirely offline. No data is sent to external servers.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
