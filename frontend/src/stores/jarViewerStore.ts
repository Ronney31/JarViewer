import { create } from 'zustand'
import type { JarFile, FileNode, JarMetadata, ProcessingProgress } from '@/types'

interface JarViewerState {
  // File Management
  currentJar: JarFile | null
  selectedFile: FileNode | null
  fileContent: string | null
  
  // UI State
  sidebarCollapsed: boolean
  theme: 'light' | 'dark' | 'system'
  activeTab: string
  searchQuery: string
  searchResults: FileNode[]
  
  // Configuration Settings
  autoDecompile: boolean
  
  // Processing State
  isLoading: boolean
  processingProgress: ProcessingProgress | null
  error: string | null
  
  // Metadata
  metadata: JarMetadata | null
  
  // Actions
  loadJar: (file: File) => Promise<void>
  selectFile: (path: string) => Promise<void>
  decompileClass: (classPath: string) => Promise<string>
  searchFiles: (query: string) => Promise<void>
  clearError: () => void
  reset: () => void
  deleteJar: (jarId: string) => Promise<void>
  
  // UI Actions
  setSidebarCollapsed: (collapsed: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setActiveTab: (tab: string) => void
  setAutoDecompile: (enabled: boolean) => void
}

export const useJarViewerStore = create<JarViewerState>((set, get) => ({
  // Initial State
  currentJar: null,
  selectedFile: null,
  fileContent: null,
  sidebarCollapsed: false,
  theme: 'system',
  activeTab: 'content',
  searchQuery: '',
  searchResults: [],
  autoDecompile: false, // Default: off
  isLoading: false,
  processingProgress: null,
  error: null,
  metadata: null,

  // Actions
  loadJar: async (file: File) => {
    console.log('🚀 Store: Starting real JAR upload for:', file.name)
    
    // Set loading state immediately
    set({ 
      isLoading: true, 
      error: null,
      processingProgress: {
        stage: 'uploading',
        progress: 0,
        message: 'Starting upload...'
      }
    })
    
    try {
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.jar')) {
        throw new Error('Please select a JAR file (.jar extension required)')
      }
      
      // Validate file size (500MB limit)
      const maxSize = 500 * 1024 * 1024 // 500MB
      if (file.size > maxSize) {
        throw new Error('File size must be less than 500MB')
      }
      
      console.log('✅ Store: File validation passed')
      
      // Update progress
      set({ 
        processingProgress: {
          stage: 'uploading',
          progress: 25,
          message: 'Uploading file to server...'
        }
      })
      
      // Import jarService dynamically to avoid circular imports
      const { jarService } = await import('@/services/jarService')
      
      // Upload and process the JAR file
      const jarFile = await jarService.uploadJar(file)
      
      set({ 
        processingProgress: {
          stage: 'extracting',
          progress: 50,
          message: 'Extracting JAR contents...'
        }
      })
      
      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 500))
      
      set({ 
        processingProgress: {
          stage: 'analyzing',
          progress: 75,
          message: 'Analyzing file structure...'
        }
      })
      
      // Get metadata if available
      let metadata = null
      try {
        metadata = await jarService.getJarMetadata(jarFile.id)
      } catch (error) {
        console.warn('Could not load metadata:', error)
      }
      
      set({ 
        processingProgress: {
          stage: 'complete',
          progress: 100,
          message: 'Processing complete!'
        }
      })
      
      console.log('✅ Store: Real JAR processing complete')
      
      // Update state with real JAR data
      set({ 
        currentJar: jarFile,
        metadata,
        isLoading: false,
        processingProgress: null,
        error: null
      })
      
    } catch (error) {
      console.error('❌ Store: JAR upload failed:', error)
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to load JAR file'
      
      set({ 
        error: errorMessage,
        isLoading: false,
        processingProgress: null,
        currentJar: null
      })
      
      // Re-throw the error so the component can handle it
      throw error
    }
  },

  selectFile: async (path: string) => {
    console.log('🔍 Store: Selecting file:', path)
    set({ isLoading: true, error: null })
    
    try {
      const { currentJar, autoDecompile } = get()
      if (!currentJar) {
        throw new Error('No JAR file loaded')
      }
      
      console.log('📦 Store: Current JAR ID:', currentJar.id)
      console.log('⚙️ Store: Auto-decompile enabled:', autoDecompile)
      console.log('📁 Store: JAR structure has', currentJar.structure.length, 'root items')
      
      // Find the file in the structure
      const findFile = (nodes: FileNode[], targetPath: string): FileNode | null => {
        for (const node of nodes) {
          console.log('🔍 Store: Checking node:', node.path, 'vs target:', targetPath)
          if (node.path === targetPath) {
            console.log('✅ Store: Found matching file:', node.name)
            return node
          }
          if (node.children) {
            const found = findFile(node.children, targetPath)
            if (found) return found
          }
        }
        return null
      }
      
      const file = findFile(currentJar.structure, path)
      if (!file) {
        console.error('❌ Store: File not found in JAR structure:', path)
        console.log('📋 Store: Available paths:', currentJar.structure.map(n => n.path))
        throw new Error('File not found in JAR structure')
      }
      
      console.log('📄 Store: Found file:', file.name, 'Type:', file.type, 'Extension:', file.extension)
      
      // Don't try to load content for directories
      if (file.type === 'directory') {
        console.log('📁 Store: File is directory, not loading content')
        set({ 
          selectedFile: file,
          fileContent: null,
          isLoading: false 
        })
        return
      }
      
      // Check if this is a .class file and auto-decompile is enabled
      const isClassFile = file.extension === '.class'
      const shouldAutoDecompile = isClassFile && autoDecompile
      
      console.log('🔍 Store: File analysis:', {
        isClassFile,
        autoDecompile,
        shouldAutoDecompile
      })
      
      if (shouldAutoDecompile) {
        console.log('🔧 Store: Auto-decompiling class file:', file.name)
        
        // Import jarService dynamically
        const { jarService } = await import('@/services/jarService')
        
        // Decompile the class file instead of loading raw content
        console.log('📡 Store: Requesting decompilation from backend...')
        const decompiledContent = await jarService.decompileClass(currentJar.id, path)
        
        console.log('✅ Store: Auto-decompilation completed, length:', decompiledContent.length)
        console.log('📝 Store: Decompiled content preview:', decompiledContent.substring(0, 100))
        
        set({ 
          selectedFile: file,
          fileContent: decompiledContent,
          isLoading: false 
        })
        
        // Verify the state was set correctly
        const { fileContent: updatedContent } = get()
        console.log('🔍 Store: Verified auto-decompile state update - fileContent length:', updatedContent?.length || 0)
        
      } else {
        console.log('📄 Store: Loading regular file content for:', file.name)
        
        // Import jarService dynamically
        const { jarService } = await import('@/services/jarService')
        
        // Load regular file content from backend
        console.log('📡 Store: Requesting file content from backend...')
        const content = await jarService.getFileContent(currentJar.id, path)
        
        console.log('✅ Store: Regular file content loaded successfully, length:', content.length)
        console.log('📝 Store: Content preview:', content.substring(0, 100))
        console.log('📊 Store: Content type:', typeof content)
        
        set({ 
          selectedFile: file,
          fileContent: content,
          isLoading: false 
        })
        
        // Verify the state was set correctly
        const { fileContent: updatedContent } = get()
        console.log('🔍 Store: Verified regular content state update - fileContent length:', updatedContent?.length || 0)
      }
      
    } catch (error) {
      console.error('❌ Store: Failed to select file:', error)
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load file',
        isLoading: false 
      })
    }
  },

  decompileClass: async (classPath: string) => {
    try {
      const { currentJar } = get()
      if (!currentJar) {
        throw new Error('No JAR file loaded')
      }
      
      console.log('🔧 Store: Decompiling class:', classPath)
      
      // Import jarService dynamically
      const { jarService } = await import('@/services/jarService')
      
      // Decompile using real backend
      const decompiledCode = await jarService.decompileClass(currentJar.id, classPath)
      
      console.log('✅ Store: Class decompiled successfully, length:', decompiledCode.length)
      console.log('📝 Store: Decompiled code preview:', decompiledCode.substring(0, 100))
      
      // Update the file content with decompiled code
      set({ fileContent: decompiledCode })
      
      // Verify the state was updated
      const { fileContent: updatedContent } = get()
      console.log('🔍 Store: Verified decompiled content update - length:', updatedContent?.length || 0)
      
      return decompiledCode
    } catch (error) {
      console.error('❌ Store: Decompilation failed:', error)
      const message = error instanceof Error ? error.message : 'Decompilation failed'
      set({ error: message })
      throw new Error(message)
    }
  },

  searchFiles: async (query: string) => {
    try {
      const { currentJar } = get()
      if (!currentJar) {
        throw new Error('No JAR file loaded')
      }
      
      console.log('🔍 Store: Searching files:', query)
      
      // Import jarService dynamically
      const { jarService } = await import('@/services/jarService')
      
      // Search using real backend
      const results = await jarService.searchFiles(currentJar.id, query)
      
      console.log('✅ Store: Search completed:', results.length, 'results')
      
      set({ searchQuery: query, searchResults: results })
    } catch (error) {
      console.error('❌ Store: Search failed:', error)
      set({ error: error instanceof Error ? error.message : 'Search failed' })
    }
  },

  clearError: () => {
    console.log('🧹 Store: Clearing error')
    set({ error: null })
  },

  reset: () => {
    console.log('🔄 Store: Resetting all state')
    set({
      currentJar: null,
      selectedFile: null,
      fileContent: null,
      searchQuery: '',
      searchResults: [],
      isLoading: false,
      processingProgress: null,
      error: null,
      metadata: null,
    })
  },

  // UI Actions
  setSidebarCollapsed: (collapsed: boolean) => {
    console.log('📱 Store: Setting sidebar collapsed:', collapsed)
    set({ sidebarCollapsed: collapsed })
  },

  setTheme: (theme: 'light' | 'dark' | 'system') => {
    console.log('🎨 Store: Setting theme:', theme)
    set({ theme })
  },

  setActiveTab: (tab: string) => {
    console.log('📑 Store: Setting active tab:', tab)
    set({ activeTab: tab })
  },

  setAutoDecompile: (enabled: boolean) => {
    console.log('⚙️ Store: Setting auto-decompile:', enabled)
    set({ autoDecompile: enabled })
  },
}))
