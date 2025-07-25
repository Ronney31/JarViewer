import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { useJarViewerStore } from '../src/stores/jarViewerStore'

// Mock the stores
vi.mock('../src/stores/jarViewerStore')
vi.mock('../src/stores/singleJarDashboardStore')

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock SingleJarDashboard component
vi.mock('../src/components/SingleJarDashboard', () => ({
  default: ({ jarId, className }: { jarId: string; className?: string }) => (
    <div data-testid="single-jar-dashboard" data-jar-id={jarId} className={className}>
      Single JAR Dashboard for {jarId}
    </div>
  ),
}))

// Mock other components that might cause issues
vi.mock('../src/components/CodeViewer', () => ({
  CodeViewer: () => <div data-testid="code-viewer">Code Viewer</div>,
}))

vi.mock('../src/components/FileTree', () => ({
  FileTree: () => <div data-testid="file-tree">File Tree</div>,
}))

describe('JAR Viewer Integration', () => {
  const mockJar = {
    id: 'test-jar-123',
    name: 'test-app.jar',
    size: 1024 * 1024 * 5, // 5MB
    uploadedAt: new Date().toISOString(),
    stats: {
      totalFiles: 150,
      totalDirectories: 25,
    },
  }

  const mockUseJarViewerStore = vi.mocked(useJarViewerStore)

  beforeEach(() => {
    // Reset URL hash
    window.location.hash = ''
    
    // Mock store with default values
    mockUseJarViewerStore.mockReturnValue({
      currentJar: null,
      selectedFile: null,
      fileContent: null,
      sidebarCollapsed: false,
      setSidebarCollapsed: vi.fn(),
      isLoading: false,
      error: null,
      clearError: vi.fn(),
      metadata: null,
      reset: vi.fn(),
      autoDecompile: true,
      setAutoDecompile: vi.fn(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.location.hash = ''
  })

  describe('Initial State', () => {
    it('should render welcome screen when no JAR is loaded', () => {
      render(<App />)
      
      expect(screen.getByText('Welcome to JarViewer')).toBeInTheDocument()
      expect(screen.getByText('Enterprise-grade JAR file analyzer')).toBeInTheDocument()
    })

    it('should initialize view mode from URL hash', () => {
      window.location.hash = '#dependencies'
      
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
      })

      render(<App />)
      
      // Should show dependency analysis view
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
    })
  })

  describe('Navigation Integration', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
      })
    })

    it('should show navigation tabs when JAR is loaded', () => {
      render(<App />)
      
      expect(screen.getByText('File Structure')).toBeInTheDocument()
      expect(screen.getByText('Dependency Analysis')).toBeInTheDocument()
    })

    it('should switch to dependency analysis view when clicking navigation tab', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const dependencyTab = screen.getByText('Dependency Analysis')
      await user.click(dependencyTab)
      
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
      expect(window.location.hash).toBe('#dependencies')
    })

    it('should switch back to files view when clicking back button', async () => {
      const user = userEvent.setup()
      window.location.hash = '#dependencies'
      
      render(<App />)
      
      const backButton = screen.getByText('Back to Files')
      await user.click(backButton)
      
      expect(screen.getByTestId('file-tree')).toBeInTheDocument()
      expect(window.location.hash).toBe('#files')
    })

    it('should show breadcrumb navigation in dependency view', () => {
      window.location.hash = '#dependencies'
      render(<App />)
      
      expect(screen.getByText('JarViewer')).toBeInTheDocument()
      expect(screen.getByText('Dependency Analysis')).toBeInTheDocument()
    })
  })

  describe('Keyboard Shortcuts', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
      })
    })

    it('should switch to files view with Alt+1', async () => {
      window.location.hash = '#dependencies'
      render(<App />)
      
      fireEvent.keyDown(window, { key: '1', altKey: true })
      
      await waitFor(() => {
        expect(window.location.hash).toBe('#files')
      })
    })

    it('should switch to dependencies view with Alt+2', async () => {
      render(<App />)
      
      fireEvent.keyDown(window, { key: '2', altKey: true })
      
      await waitFor(() => {
        expect(window.location.hash).toBe('#dependencies')
      })
    })

    it('should not trigger shortcuts when input is focused', async () => {
      render(<App />)
      
      // Create a mock input element
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      
      fireEvent.keyDown(input, { key: '2', altKey: true })
      
      // Should remain in files view
      expect(window.location.hash).toBe('')
      
      document.body.removeChild(input)
    })
  })

  describe('MetadataPanel Integration', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
        metadata: {
          dependencies: [
            { groupId: 'org.springframework', artifactId: 'spring-core', version: '5.3.0' },
            { groupId: 'junit', artifactId: 'junit', version: '4.13.2' },
          ],
        },
      })
    })

    it('should show dependency analysis button in metadata panel', () => {
      render(<App />)
      
      expect(screen.getByText('Analyze Dependencies')).toBeInTheDocument()
    })

    it('should navigate to dependency analysis when clicking metadata panel button', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const analyzeButton = screen.getByText('Full Dependency Analysis')
      await user.click(analyzeButton)
      
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
      expect(window.location.hash).toBe('#dependencies')
    })
  })

  describe('StatusBar Integration', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
      })
    })

    it('should show current view mode in status bar', () => {
      render(<App />)
      
      expect(screen.getByText('View:')).toBeInTheDocument()
      expect(screen.getByText('Files')).toBeInTheDocument()
    })

    it('should allow switching views from status bar', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const viewButton = screen.getByTitle('Switch to Dependency Analysis')
      await user.click(viewButton)
      
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
    })
  })

  describe('URL State Management', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
      })
    })

    it('should update URL when switching views', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const dependencyTab = screen.getByText('Dependency Analysis')
      await user.click(dependencyTab)
      
      expect(window.location.hash).toBe('#dependencies')
    })

    it('should handle browser back/forward navigation', async () => {
      render(<App />)
      
      // Simulate hash change
      window.location.hash = '#dependencies'
      fireEvent(window, new HashChangeEvent('hashchange'))
      
      await waitFor(() => {
        expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
      })
    })
  })

  describe('Context Menu Integration', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
      })
    })

    it('should show context menu on right click', async () => {
      render(<App />)
      
      const mainContent = screen.getByTestId('file-tree').parentElement
      fireEvent.contextMenu(mainContent!)
      
      await waitFor(() => {
        expect(screen.getByText('File Structure')).toBeInTheDocument()
        expect(screen.getByText('Dependency Analysis')).toBeInTheDocument()
      })
    })
  })

  describe('Quick Actions Integration', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
      })
    })

    it('should show dependency analysis quick action in file select view', () => {
      render(<App />)
      
      expect(screen.getByText('Ready for dependency analysis')).toBeInTheDocument()
      expect(screen.getByText('Analyze Dependencies')).toBeInTheDocument()
    })

    it('should navigate to dependency analysis from quick action', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const quickActionButton = screen.getByText('Analyze Dependencies')
      await user.click(quickActionButton)
      
      expect(screen.getByTestId('single-jar-dashboard')).toBeInTheDocument()
    })
  })

  describe('Animation Integration', () => {
    beforeEach(() => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
      })
    })

    it('should render with animation wrapper when switching views', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const dependencyTab = screen.getByText('Dependency Analysis')
      await user.click(dependencyTab)
      
      // Check that the dashboard is rendered with proper structure
      const dashboard = screen.getByTestId('single-jar-dashboard')
      expect(dashboard).toHaveAttribute('data-jar-id', mockJar.id)
      expect(dashboard).toHaveClass('h-full')
    })
  })

  describe('Error Handling Integration', () => {
    it('should show error state when store has error', () => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
        error: 'Failed to load JAR file',
      })

      render(<App />)
      
      expect(screen.getByText('Failed to load JAR file')).toBeInTheDocument()
    })

    it('should allow clearing errors', async () => {
      const mockClearError = vi.fn()
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
        error: 'Test error',
        clearError: mockClearError,
      })

      const user = userEvent.setup()
      render(<App />)
      
      const clearButton = screen.getByRole('button', { name: /close/i })
      await user.click(clearButton)
      
      expect(mockClearError).toHaveBeenCalled()
    })
  })

  describe('Loading State Integration', () => {
    it('should show loading overlay when loading', () => {
      mockUseJarViewerStore.mockReturnValue({
        ...mockUseJarViewerStore(),
        currentJar: mockJar,
        isLoading: true,
      })

      render(<App />)
      
      expect(screen.getByText('Processing...')).toBeInTheDocument()
    })
  })
})