import { useState } from 'react'
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  File,
  FileText,
  Code,
  Settings,
  Image
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { useJarViewerStore } from '@/stores/jarViewerStore'
import type { FileNode } from '@/types'

interface FileTreeItemProps {
  node: FileNode
  level: number
  onSelect: (path: string) => void
  selectedPath?: string
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
}

function FileTreeItem({ 
  node, 
  level, 
  onSelect, 
  selectedPath, 
  expandedPaths, 
  onToggleExpand 
}: FileTreeItemProps) {
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = selectedPath === node.path
  const hasChildren = node.children && node.children.length > 0

  const getFileIcon = (node: FileNode) => {
    if (node.type === 'directory') {
      return isExpanded ? (
        <FolderOpen className="file-icon folder" />
      ) : (
        <Folder className="file-icon folder" />
      )
    }

    const ext = node.extension?.toLowerCase()
    switch (ext) {
      case '.java':
        return <Code className="file-icon java" />
      case '.class':
        return <Settings className="file-icon class" />
      case '.json':
      case '.xml':
      case '.properties':
        return <FileText className="file-icon json" />
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
        return <Image className="file-icon" />
      default:
        return <File className="file-icon" />
    }
  }

  const handleClick = () => {
    if (node.type === 'directory') {
      onToggleExpand(node.path)
    } else {
      onSelect(node.path)
    }
  }

  return (
    <div>
      <div
        className={`file-tree-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {node.type === 'directory' && (
          <button className="mr-1 p-0.5">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        
        {getFileIcon(node)}
        
        <span className="truncate">{node.name}</span>
        
        {node.size && node.type === 'file' && (
          <span className="ml-auto text-xs text-muted-foreground">
            {formatFileSize(node.size)}
          </span>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children!.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                level={level + 1}
                onSelect={onSelect}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FileTree() {
  const { currentJar, selectedFile, selectFile } = useJarViewerStore()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  if (!currentJar) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>No JAR file loaded</p>
      </div>
    )
  }

  const handleToggleExpand = (path: string) => {
    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedPaths(newExpanded)
  }

  const handleSelect = async (path: string) => {
    try {
      await selectFile(path)
    } catch (error) {
      console.error('Failed to select file:', error)
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="border-b p-3">
        <h3 className="font-medium">File Structure</h3>
        <p className="text-xs text-muted-foreground">
          {currentJar.stats.totalFiles} files, {currentJar.stats.totalDirectories} directories
        </p>
      </div>
      
      <div className="p-2">
        {currentJar.structure.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            level={0}
            onSelect={handleSelect}
            selectedPath={selectedFile?.path}
            expandedPaths={expandedPaths}
            onToggleExpand={handleToggleExpand}
          />
        ))}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
