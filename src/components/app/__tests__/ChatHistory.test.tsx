import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatHistory, ChatSession } from '../ChatHistory'

// Mock react-window
jest.mock('react-window', () => ({
  FixedSizeList: ({ children, itemData, itemCount }: any) => (
    <div data-testid="virtual-list">
      {itemData.slice(0, Math.min(itemCount, 5)).map((item: any, index: number) =>
        children({ index, style: {}, data: itemData })
      )}
    </div>
  ),
}))

const mockSessions: ChatSession[] = [
  {
    id: '1',
    title: 'Test Chat 1',
    document_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: [],
  },
  {
    id: '2',
    title: 'Test Chat 2',
    document_id: 'doc-1',
    created_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    messages: [],
  },
]

const defaultProps = {
  sessions: mockSessions,
  currentSessionId: '1',
  isLoading: false,
  onSelectSession: jest.fn(),
  onDeleteSession: jest.fn(),
  onRenameSession: jest.fn(),
}

describe('ChatHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders loading state correctly', () => {
    render(<ChatHistory {...defaultProps} isLoading={true} />)
    
    expect(screen.getByLabelText('Loading conversations')).toBeInTheDocument()
    expect(screen.getAllByTestId(/skeleton/i)).toHaveLength(6)
  })

  it('renders chat sessions', () => {
    render(<ChatHistory {...defaultProps} />)
    
    expect(screen.getByText('Test Chat 1')).toBeInTheDocument()
    expect(screen.getByText('Test Chat 2')).toBeInTheDocument()
  })

  it('shows search input', () => {
    render(<ChatHistory {...defaultProps} />)
    
    const searchInput = screen.getByPlaceholderText('Search conversations...')
    expect(searchInput).toBeInTheDocument()
  })

  it('filters sessions based on search query', async () => {
    render(<ChatHistory {...defaultProps} />)
    
    const searchInput = screen.getByPlaceholderText('Search conversations...')
    fireEvent.change(searchInput, { target: { value: 'Test Chat 1' } })
    
    await waitFor(() => {
      expect(screen.getByText('Test Chat 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Chat 2')).not.toBeInTheDocument()
    })
  })

  it('calls onSelectSession when session is clicked', () => {
    render(<ChatHistory {...defaultProps} />)
    
    const sessionButton = screen.getByLabelText(/Test Chat 1/i)
    fireEvent.click(sessionButton)
    
    expect(defaultProps.onSelectSession).toHaveBeenCalledWith('1')
  })

  it('shows view mode toggle buttons', () => {
    render(<ChatHistory {...defaultProps} />)
    
    expect(screen.getByText('Compact')).toBeInTheDocument()
    expect(screen.getByText('Detailed')).toBeInTheDocument()
  })

  it('shows empty state when no sessions', () => {
    render(<ChatHistory {...defaultProps} sessions={[]} />)
    
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })

  it('shows document badge for sessions with documents', () => {
    render(<ChatHistory {...defaultProps} />)
    
    expect(screen.getByText('Doc')).toBeInTheDocument()
  })

  it('handles session rename', async () => {
    render(<ChatHistory {...defaultProps} />)
    
    // Find and click the more actions button
    const moreButtons = screen.getAllByLabelText('More actions')
    fireEvent.click(moreButtons[0])
    
    // Click rename option
    const renameButton = screen.getByText('Rename')
    fireEvent.click(renameButton)
    
    // Check if input appears
    const editInput = screen.getByLabelText('Edit conversation title')
    expect(editInput).toBeInTheDocument()
    expect(editInput).toHaveValue('Test Chat 1')
  })

  it('handles session deletion', () => {
    render(<ChatHistory {...defaultProps} />)
    
    // Find and click the more actions button
    const moreButtons = screen.getAllByLabelText('More actions')
    fireEvent.click(moreButtons[0])
    
    // Click delete option
    const deleteButton = screen.getByText('Delete')
    fireEvent.click(deleteButton)
    
    expect(defaultProps.onDeleteSession).toHaveBeenCalledWith('1')
  })
})