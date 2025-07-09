import type { JarFile, FileNode, JarMetadata } from '@/types'

// Try multiple API endpoints as fallback
const API_ENDPOINTS = [
  '/api/v1', // Proxy first
  'http://localhost:8000/api/v1' // Direct fallback
]

console.log('🔧 JarService: Available API endpoints:', API_ENDPOINTS)

export class JarService {
  private apiBase: string = API_ENDPOINTS[0]
  
  /**
   * Try to find a working API endpoint
   */
  private async findWorkingEndpoint(): Promise<string> {
    for (const endpoint of API_ENDPOINTS) {
      try {
        console.log('🔍 Testing endpoint:', endpoint)
        const response = await fetch(`${endpoint}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        })
        if (response.ok) {
          console.log('✅ Working endpoint found:', endpoint)
          this.apiBase = endpoint
          return endpoint
        }
      } catch (error) {
        console.log('❌ Endpoint failed:', endpoint, error.message)
      }
    }
    
    // If no endpoint works, use the first one and let the error bubble up
    console.warn('⚠️ No working endpoint found, using default:', API_ENDPOINTS[0])
    this.apiBase = API_ENDPOINTS[0]
    return API_ENDPOINTS[0]
  }

  /**
   * Upload and process a JAR file
   */
  async uploadJar(file: File): Promise<JarFile> {
    console.log('🚀 JarService: Uploading JAR file:', file.name, 'Size:', file.size, 'Type:', file.type)
    
    // Find working endpoint first
    await this.findWorkingEndpoint()
    
    const formData = new FormData()
    formData.append('file', file)
    
    console.log('📤 JarService: FormData created, sending request to:', `${this.apiBase}/jars/upload`)
    
    try {
      const response = await fetch(`${this.apiBase}/jars/upload`, {
        method: 'POST',
        body: formData,
      })
      
      console.log('📥 JarService: Response received:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ JarService: Upload failed with response:', errorText)
        
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { detail: errorText }
        }
        
        throw new Error(errorData.detail || `Upload failed: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ JarService: JAR uploaded successfully:', result)
      
      // Transform backend response to our JarFile format
      return this.transformBackendJar(result, file)
    } catch (error) {
      console.error('❌ JarService: Upload error:', error)
      throw error
    }
  }
  
  /**
   * Get JAR metadata
   */
  async getJarMetadata(jarId: string): Promise<JarMetadata> {
    console.log('🔍 JarService: Getting metadata for JAR:', jarId)
    console.log('📡 JarService: Making request to:', `${this.apiBase}/jars/${jarId}/metadata`)
    
    try {
      const response = await fetch(`${this.apiBase}/jars/${jarId}/metadata`)
      
      console.log('📥 JarService: Metadata response:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ JarService: Metadata request failed:', errorText)
        throw new Error(`Failed to get metadata: ${response.statusText}`)
      }
      
      const metadata = await response.json()
      console.log('✅ JarService: Metadata retrieved successfully:', metadata)
      
      return metadata
    } catch (error) {
      console.error('❌ JarService: Metadata error:', error)
      throw error
    }
  }
  
  /**
   * Get file content from JAR
   */
  async getFileContent(jarId: string, filePath: string): Promise<string> {
    console.log('📄 JarService: Getting file content for:', filePath, 'from JAR:', jarId)
    
    // Use GET with query parameter - backend expects 'path' not 'file_path'
    const url = `${this.apiBase}/jars/${jarId}/files/content?path=${encodeURIComponent(filePath)}`
    console.log('📡 JarService: Making GET request to:', url)
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      console.log('📥 JarService: File content response:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ JarService: File content request failed:', errorText)
        throw new Error(`Failed to get file content: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('📋 JarService: Full response object:', result)
      console.log('📄 JarService: Content field:', result.content)
      console.log('📄 JarService: Data field:', result.data)
      console.log('📄 JarService: Data.content field:', result.data?.content)
      console.log('📄 JarService: All response keys:', Object.keys(result))
      
      // Extract content from the correct nested structure
      const content = result.data?.content || result.content || ''
      console.log('✅ JarService: File content retrieved, final length:', content.length)
      console.log('📝 JarService: Content preview:', content.substring(0, 100))
      
      return content
    } catch (error) {
      console.error('❌ JarService: File content error:', error)
      throw error
    }
  }
  
  /**
   * Decompile a class file
   */
  async decompileClass(jarId: string, classPath: string): Promise<string> {
    console.log('🔧 JarService: Decompiling class:', classPath, 'from JAR:', jarId)
    
    // Use POST with query parameter - backend expects 'path' as query param
    const url = `${this.apiBase}/jars/${jarId}/decompile?path=${encodeURIComponent(classPath)}`
    console.log('📡 JarService: Making POST request to:', url)
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      console.log('📥 JarService: Decompile response:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ JarService: Decompile request failed:', errorText)
        throw new Error(`Failed to decompile class: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('📋 JarService: Full decompile response:', result)
      console.log('🔧 JarService: Decompiled code field:', result.decompiled_code)
      console.log('🔧 JarService: Data field:', result.data)
      console.log('🔧 JarService: Data.content field:', result.data?.content)
      console.log('🔧 JarService: Data.decompiled_code field:', result.data?.decompiled_code)
      
      // Extract decompiled code from the correct field - it's in data.content, not data.decompiled_code
      const decompiledCode = result.data?.content || result.data?.decompiled_code || result.decompiled_code || ''
      console.log('✅ JarService: Class decompiled successfully, final length:', decompiledCode.length)
      console.log('📝 JarService: Decompiled code preview:', decompiledCode.substring(0, 200))
      
      return decompiledCode
    } catch (error) {
      console.error('❌ JarService: Decompile error:', error)
      throw error
    }
  }
  
  /**
   * Search files in JAR
   */
  async searchFiles(jarId: string, query: string): Promise<FileNode[]> {
    console.log('🔍 JarService: Searching files with query:', query, 'in JAR:', jarId)
    
    // Use GET with query parameter - backend expects 'q' as query param
    const url = `${this.apiBase}/jars/${jarId}/search?q=${encodeURIComponent(query)}`
    console.log('📡 JarService: Making GET request to:', url)
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      console.log('📥 JarService: Search response:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ JarService: Search request failed:', errorText)
        throw new Error(`Search failed: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ JarService: Search completed, results:', result.results?.length || 0)
      
      return result.results || []
    } catch (error) {
      console.error('❌ JarService: Search error:', error)
      throw error
    }
  }
  
  /**
   * Transform backend JAR response to frontend format
   */
  private transformBackendJar(backendJar: any, originalFile: File): JarFile {
    console.log('🔄 JarService: Transforming backend response:', backendJar)
    
    // Handle the actual backend response structure: { success: true, data: { jarFile: {...}, metadata: {...} } }
    const jarData = backendJar.data?.jarFile || backendJar.data || backendJar
    
    console.log('📊 JarService: JAR data extracted:', jarData)
    
    const transformFileNode = (node: any): FileNode => {
      const transformed = {
        name: node.name,
        path: node.path,
        type: node.type,
        size: node.size,
        extension: node.extension,
        children: node.children ? node.children.map(transformFileNode) : undefined,
      }
      console.log('📁 JarService: Transformed file node:', transformed.name, transformed.type)
      return transformed
    }
    
    const jarFile: JarFile = {
      id: jarData.id || `jar_${Date.now()}`, // Use the actual JAR ID from backend
      name: originalFile.name,
      size: originalFile.size,
      uploadedAt: new Date().toISOString(),
      structure: jarData.structure ? jarData.structure.map(transformFileNode) : [],
      stats: {
        totalFiles: jarData.stats?.total_files || 0,
        totalDirectories: jarData.stats?.total_directories || 0,
        totalSize: jarData.stats?.total_size || originalFile.size,
        compressedSize: jarData.stats?.compressed_size || originalFile.size,
        compressionRatio: jarData.stats?.compression_ratio || 0.8,
        fileTypes: jarData.stats?.file_types || {},
      },
    }
    
    console.log('✅ JarService: Final transformed JAR file:', {
      id: jarFile.id,
      name: jarFile.name,
      structureCount: jarFile.structure.length,
      stats: jarFile.stats
    })
    
    return jarFile
  }
}

// Export singleton instance
export const jarService = new JarService()
