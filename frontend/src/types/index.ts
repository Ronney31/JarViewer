// Core Types
export interface JarFile {
  id: string
  name: string
  size: number
  uploadedAt: string
  structure: FileNode[]
  stats: JarStats
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  extension?: string
  children?: FileNode[]
  isExpanded?: boolean
  metadata?: FileMetadata
}

export interface FileMetadata {
  lastModified?: string
  compressedSize?: number
  uncompressedSize?: number
  crc32?: string
  method?: string
}

export interface JarStats {
  totalFiles: number
  totalDirectories: number
  totalSize: number
  compressedSize: number
  compressionRatio: number
  fileTypes: Record<string, number>
}

// Metadata Types
export interface JarMetadata {
  manifest?: ManifestInfo
  dependencies?: Dependency[]
  frameworks?: Framework[]
  buildInfo?: BuildInfo
  securityInfo?: SecurityInfo
}

export interface ManifestInfo {
  version?: string
  mainClass?: string
  classPath?: string[]
  implementationTitle?: string
  implementationVersion?: string
  implementationVendor?: string
  specificationTitle?: string
  specificationVersion?: string
  specificationVendor?: string
  buildJdk?: string
  builtBy?: string
  buildTime?: string
  attributes: Record<string, string>
}

export interface Dependency {
  groupId: string
  artifactId: string
  version?: string
  scope?: string
  type?: string
  classifier?: string
}

export interface Framework {
  name: string
  version?: string
  confidence: number
  indicators: string[]
}

export interface BuildInfo {
  buildTool?: 'maven' | 'gradle' | 'ant' | 'unknown'
  javaVersion?: string
  buildTime?: string
  buildUser?: string
  gitCommit?: string
  gitBranch?: string
}

export interface SecurityInfo {
  signed: boolean
  certificates?: Certificate[]
  vulnerabilities?: Vulnerability[]
}

export interface Certificate {
  subject: string
  issuer: string
  serialNumber: string
  validFrom: string
  validTo: string
  fingerprint: string
}

export interface Vulnerability {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  component: string
  version?: string
}

// Processing Types
export interface ProcessingProgress {
  stage: 'uploading' | 'extracting' | 'analyzing' | 'indexing' | 'complete'
  progress: number // 0-100
  message: string
  details?: string
}

export interface UploadProgress {
  stage: ProcessingProgress['stage']
  progress: number
  message: string
}

// API Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
  correlationId?: string
}

export interface ErrorResponse {
  error: string
  details?: string
  timestamp: string
  correlationId?: string
}

// File Content Types
export interface FileContent {
  content: string
  type: 'text' | 'binary' | 'image'
  encoding?: string
  language?: string
  size: number
}

export interface DecompilationResult {
  success: boolean
  content?: string
  error?: string
  metadata?: {
    className: string
    packageName?: string
    decompiler: string
    decompilationTime: number
  }
}

// Search Types
export interface SearchResult {
  file: FileNode
  matches: SearchMatch[]
  score: number
}

export interface SearchMatch {
  line: number
  column: number
  text: string
  context: string
}

export interface SearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
  includeContent?: boolean
  fileTypes?: string[]
}

// Theme Types
export type Theme = 'light' | 'dark' | 'system'

// Component Props Types
export interface FileTreeProps {
  nodes: FileNode[]
  onSelect?: (node: FileNode) => void
  selectedPath?: string
  expandedPaths?: Set<string>
  onToggleExpand?: (path: string) => void
}

export interface CodeViewerProps {
  content: string
  language?: string
  fileName?: string
  readOnly?: boolean
  showLineNumbers?: boolean
  theme?: 'light' | 'dark'
}

export interface FileUploadProps {
  onUpload: (file: File) => void
  accept?: string
  maxSize?: number
  disabled?: boolean
}

// Utility Types
export type FileExtension = 
  | '.java' 
  | '.class' 
  | '.json' 
  | '.xml' 
  | '.properties' 
  | '.md' 
  | '.txt' 
  | '.yml' 
  | '.yaml'
  | '.html'
  | '.css'
  | '.js'
  | '.ts'
  | '.sql'

export type FileCategory = 
  | 'source' 
  | 'compiled' 
  | 'config' 
  | 'documentation' 
  | 'resource' 
  | 'image' 
  | 'archive'
  | 'unknown'

// Configuration Types
export interface AppConfig {
  api: {
    baseUrl: string
    timeout: number
  }
  upload: {
    maxFileSize: number
    allowedExtensions: string[]
    chunkSize: number
  }
  editor: {
    theme: string
    fontSize: number
    tabSize: number
    wordWrap: boolean
  }
  features: {
    enableDecompilation: boolean
    enableSearch: boolean
    enableMetadataAnalysis: boolean
  }
}
