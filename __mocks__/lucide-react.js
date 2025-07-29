// Mock for lucide-react to avoid ES module import issues in Jest
const React = require('react')

// Create mock components for all Lucide icons used in the app
const mockIcon = (name) => React.forwardRef((props, ref) => 
  React.createElement('svg', { ...props, ref, 'data-testid': name })
)

module.exports = {
  Menu: mockIcon('Menu'),
  X: mockIcon('X'),
  ChevronDown: mockIcon('ChevronDown'),
  ChevronUp: mockIcon('ChevronUp'),
  Plus: mockIcon('Plus'),
  Trash2: mockIcon('Trash2'),
  Edit: mockIcon('Edit'),
  Settings: mockIcon('Settings'),
  User: mockIcon('User'),
  LogOut: mockIcon('LogOut'),
  Upload: mockIcon('Upload'),
  Download: mockIcon('Download'),
  Search: mockIcon('Search'),
  Filter: mockIcon('Filter'),
  MoreHorizontal: mockIcon('MoreHorizontal'),
  ExternalLink: mockIcon('ExternalLink'),
  Copy: mockIcon('Copy'),
  Check: mockIcon('Check'),
  AlertCircle: mockIcon('AlertCircle'),
  Info: mockIcon('Info'),
  HelpCircle: mockIcon('HelpCircle'),
  FileText: mockIcon('FileText'),
  Folder: mockIcon('Folder'),
  Send: mockIcon('Send'),
  MessageSquare: mockIcon('MessageSquare'),
  Bot: mockIcon('Bot'),
  Sparkles: mockIcon('Sparkles'),
  Loader2: mockIcon('Loader2')
}