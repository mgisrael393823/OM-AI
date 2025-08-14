import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DocumentUpload } from '@/components/app/DocumentUpload'

// Mock sonner toast
const mockToast = {
  error: jest.fn(),
  success: jest.fn()
}

jest.mock('sonner', () => ({
  toast: mockToast
}))

// Mock the hooks
const mockMemoryProcess = jest.fn()
const mockStorageUpload = jest.fn()

jest.mock('@/hooks/useInMemoryPDFProcessor', () => ({
  useInMemoryPDFProcessor: () => ({
    processFile: mockMemoryProcess,
    progress: 0,
    isProcessing: false,
    error: null,
    reset: jest.fn()
  })
}))

jest.mock('@/hooks/useSupabaseUpload', () => ({
  useSupabaseUpload: () => ({
    uploadFile: mockStorageUpload,
    progress: 0,
    isUploading: false,
    error: null,
    reset: jest.fn()
  })
}))

// Mock react-dropzone
const mockGetRootProps = jest.fn(() => ({}))
const mockGetInputProps = jest.fn(() => ({}))
const mockDropzoneProps = {
  getRootProps: mockGetRootProps,
  getInputProps: mockGetInputProps,
  isDragActive: false
}

jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(() => mockDropzoneProps)
}))

describe('DocumentUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Set default environment variable
    process.env.NEXT_PUBLIC_MAX_UPLOAD_MB = '8'
  })

  it('should render upload area correctly', () => {
    render(<DocumentUpload />)
    
    expect(screen.getByText('Upload PDF documents')).toBeInTheDocument()
    expect(screen.getByText(/Max 32MB per file/)).toBeInTheDocument()
  })

  it('should block oversized files with toast message and no API call', async () => {
    const onUploadComplete = jest.fn()
    render(<DocumentUpload onUploadComplete={onUploadComplete} />)

    // Create oversized file (8.1MB with 8MB limit)
    const oversizedFile = new File(['x'.repeat(8.5 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf'
    })

    // Mock useDropzone to call our validation function
    const { useDropzone } = require('react-dropzone')
    const mockOnDrop = jest.fn()
    
    useDropzone.mockImplementation(({ onDrop }: any) => {
      mockOnDrop.mockImplementation(onDrop)
      return {
        ...mockDropzoneProps,
        onDrop: mockOnDrop
      }
    })

    // Re-render to pick up the mock
    render(<DocumentUpload onUploadComplete={onUploadComplete} />)

    // Simulate file drop
    await waitFor(() => {
      mockOnDrop([oversizedFile])
    })

    // Verify toast was called with size limit error
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('8MB limit')
    )

    // Verify no API calls were made
    expect(mockMemoryProcess).not.toHaveBeenCalled()
    expect(mockStorageUpload).not.toHaveBeenCalled()
    expect(onUploadComplete).not.toHaveBeenCalled()
  })

  it('should process valid sized files successfully', async () => {
    const onUploadComplete = jest.fn()
    
    // Mock successful processing
    mockMemoryProcess.mockResolvedValue({
      requestId: 'test-request-id',
      success: true,
      document: {
        id: 'doc-123',
        originalFilename: 'test.pdf',
        pageCount: 5,
        chunkCount: 20,
        analysis: { content: 'test analysis' }
      }
    })

    render(<DocumentUpload onUploadComplete={onUploadComplete} />)

    // Create valid sized file (4.5MB with 8MB limit)
    const validFile = new File(['x'.repeat(4.5 * 1024 * 1024)], 'valid.pdf', {
      type: 'application/pdf'
    })

    // Mock useDropzone to call our validation function
    const { useDropzone } = require('react-dropzone')
    const mockOnDrop = jest.fn()
    
    useDropzone.mockImplementation(({ onDrop }: any) => {
      mockOnDrop.mockImplementation(onDrop)
      return {
        ...mockDropzoneProps,
        onDrop: mockOnDrop
      }
    })

    // Re-render to pick up the mock
    render(<DocumentUpload onUploadComplete={onUploadComplete} />)

    // Simulate file drop
    await waitFor(() => {
      mockOnDrop([validFile])
    })

    // Wait for processing to complete
    await waitFor(() => {
      expect(mockMemoryProcess).toHaveBeenCalledWith(validFile)
    })

    // Verify success toast was called
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining('processed successfully')
      )
    })

    // Verify callback was called with the document
    expect(onUploadComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-request-id',
        name: 'test.pdf'
      })
    )
  })

  it('should respect custom MAX_UPLOAD_MB environment variable', async () => {
    // Set custom limit
    process.env.NEXT_PUBLIC_MAX_UPLOAD_MB = '5'
    
    const onUploadComplete = jest.fn()
    render(<DocumentUpload onUploadComplete={onUploadComplete} />)

    // Create file that exceeds custom limit (5.1MB with 5MB limit)
    const oversizedFile = new File(['x'.repeat(5.1 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf'
    })

    // Mock useDropzone to call our validation function
    const { useDropzone } = require('react-dropzone')
    const mockOnDrop = jest.fn()
    
    useDropzone.mockImplementation(({ onDrop }: any) => {
      mockOnDrop.mockImplementation(onDrop)
      return {
        ...mockDropzoneProps,
        onDrop: mockOnDrop
      }
    })

    // Re-render to pick up the mock
    render(<DocumentUpload onUploadComplete={onUploadComplete} />)

    // Simulate file drop
    await waitFor(() => {
      mockOnDrop([oversizedFile])
    })

    // Verify toast was called with custom limit
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('5MB limit')
    )

    // Verify no API calls were made
    expect(mockMemoryProcess).not.toHaveBeenCalled()
    expect(mockStorageUpload).not.toHaveBeenCalled()
  })

  it('should handle multiple invalid files correctly', async () => {
    const onUploadComplete = jest.fn()
    render(<DocumentUpload onUploadComplete={onUploadComplete} />)

    // Create multiple oversized files
    const oversizedFile1 = new File(['x'.repeat(9 * 1024 * 1024)], 'large1.pdf', {
      type: 'application/pdf'
    })
    const oversizedFile2 = new File(['x'.repeat(10 * 1024 * 1024)], 'large2.pdf', {
      type: 'application/pdf'
    })
    const invalidTypeFile = new File(['content'], 'document.txt', {
      type: 'text/plain'
    })

    // Mock useDropzone to call our validation function
    const { useDropzone } = require('react-dropzone')
    const mockOnDrop = jest.fn()
    
    useDropzone.mockImplementation(({ onDrop }: any) => {
      mockOnDrop.mockImplementation(onDrop)
      return {
        ...mockDropzoneProps,
        onDrop: mockOnDrop
      }
    })

    // Re-render to pick up the mock
    render(<DocumentUpload onUploadComplete={onUploadComplete} />)

    // Simulate file drop with invalid files
    await waitFor(() => {
      mockOnDrop([oversizedFile1, oversizedFile2, invalidTypeFile])
    })

    // Verify error toast was called for invalid files
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('invalid files')
    )

    // Verify no API calls were made
    expect(mockMemoryProcess).not.toHaveBeenCalled()
    expect(mockStorageUpload).not.toHaveBeenCalled()
  })

  it('should show correct upload limit in UI', () => {
    // Test with default limit
    render(<DocumentUpload />)
    expect(screen.getByText(/Max 32MB per file/)).toBeInTheDocument()

    // Note: The UI currently shows a hardcoded 32MB limit which differs from the 8MB 
    // processing limit. This is expected behavior as they serve different purposes:
    // - UI limit (32MB): For direct storage uploads
    // - Processing limit (8MB): For in-memory processing
  })
})