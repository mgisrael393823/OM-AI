# Scroll Components Documentation

This document provides comprehensive documentation for the reusable scroll container components designed to standardize scrolling behavior across the OM-AI application.

## Components Overview

### 1. `useScrollPosition` Hook
A powerful hook for tracking scroll position and providing scroll control utilities.

### 2. `ScrollContainer` & `ScrollArea`
Consistent scroll containers with customizable scrollbar styling and behavior.

### 3. `VirtualScrollList` & `VariableVirtualScrollList`
Performance-optimized virtual scrolling components using react-window.

### 4. `ScrollToBottom`
Floating button component for smooth scrolling to bottom with chat-specific features.

---

## useScrollPosition Hook

### Basic Usage

```tsx
import { useScrollPosition } from '@/hooks/useScrollPosition'

function MyComponent() {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const {
    scrollPosition,
    directions,
    isAtTop,
    isAtBottom,
    isNearBottom,
    scrollToBottom,
    scrollToTop
  } = useScrollPosition({
    element: scrollRef.current,
    onScroll: (position, directions) => {
      console.log('Scroll position:', position.scrollTop)
      console.log('Is scrolling down:', directions.isScrollingDown)
    }
  })

  return (
    <div ref={scrollRef} className="h-96 overflow-auto">
      <div className="h-[2000px]">Tall content...</div>
      {!isAtBottom && (
        <button onClick={() => scrollToBottom()}>
          Scroll to bottom
        </button>
      )}
    </div>
  )
}
```

### Advanced Usage with Debouncing

```tsx
const {
  scrollPosition,
  isNearBottom
} = useScrollPosition({
  element: containerRef.current,
  debounceMs: 50,        // Debounce final position updates
  throttleMs: 16,        // Throttle during scroll (60fps)
  onScroll: (position) => {
    // This will be called at most every 16ms during scroll
    // and once more after 50ms when scrolling stops
  }
})
```

---

## ScrollContainer Component

### Basic Usage

```tsx
import { ScrollContainer } from '@/components/ui/scroll-container'

function ChatMessages() {
  return (
    <ScrollContainer 
      className="h-96"
      orientation="vertical"
      smoothScrolling={true}
      momentumScrolling={true}
    >
      {messages.map(message => (
        <div key={message.id}>{message.content}</div>
      ))}
    </ScrollContainer>
  )
}
```

### Auto-Hide Scrollbars

```tsx
<ScrollContainer
  autoHide={true}
  fadeTimeout={1500}
  onScrollStart={() => console.log('Started scrolling')}
  onScrollEnd={() => console.log('Stopped scrolling')}
>
  {content}
</ScrollContainer>
```

### Scroll Restoration

```tsx
function ChatHistory({ sessionId }: { sessionId: string }) {
  return (
    <ScrollContainer
      scrollRestoration={true}
      scrollKey={`chat-${sessionId}`}
      onReachBottom={() => console.log('Reached bottom')}
    >
      {messages}
    </ScrollContainer>
  )
}
```

### ScrollArea Variant

```tsx
import { ScrollArea } from '@/components/ui/scroll-container'

<ScrollArea className="h-96 w-full border rounded-md">
  <div className="p-4">
    {/* Content that might overflow */}
  </div>
</ScrollArea>
```

---

## VirtualScrollList Component

### Fixed Size List

```tsx
import { VirtualScrollList } from '@/components/ui/virtual-scroll-list'

interface Message {
  id: string
  content: string
  author: string
}

const MessageItem: React.FC<ListChildComponentProps> = ({ index, style, data }) => {
  const message = data[index] as Message
  
  return (
    <div style={style} className="flex p-4 border-b">
      <div className="font-semibold mr-2">{message.author}:</div>
      <div>{message.content}</div>
    </div>
  )
}

function MessageList({ messages }: { messages: Message[] }) {
  return (
    <VirtualScrollList
      height={400}
      width="100%"
      itemCount={messages.length}
      itemSize={80}
      itemData={messages}
      overscanCount={5}
      scrollRestoration={true}
      scrollKey="message-list"
    >
      {MessageItem}
    </VirtualScrollList>
  )
}
```

### Variable Size List

```tsx
import { VariableVirtualScrollList } from '@/components/ui/virtual-scroll-list'

const getItemSize = (index: number) => {
  // Dynamic sizing based on content
  const message = messages[index]
  return message.content.length > 100 ? 120 : 80
}

<VariableVirtualScrollList
  height={400}
  itemCount={messages.length}
  itemSize={getItemSize}
  estimatedItemSize={80}
  itemData={messages}
>
  {MessageItem}
</VariableVirtualScrollList>
```

### Infinite Loading

```tsx
const [messages, setMessages] = useState<Message[]>([])
const [loading, setLoading] = useState(false)
const [hasNextPage, setHasNextPage] = useState(true)

const loadMore = useCallback(async () => {
  if (loading) return
  
  setLoading(true)
  try {
    const newMessages = await fetchMoreMessages()
    setMessages(prev => [...prev, ...newMessages])
    setHasNextPage(newMessages.length > 0)
  } finally {
    setLoading(false)
  }
}, [loading])

<VirtualScrollList
  height={400}
  itemCount={messages.length}
  itemSize={80}
  itemData={messages}
  infiniteLoad={true}
  loading={loading}
  hasNextPage={hasNextPage}
  loadMore={loadMore}
>
  {MessageItem}
</VirtualScrollList>
```

### Using Virtual List Control Hook

```tsx
import { useVirtualListControl } from '@/components/ui/virtual-scroll-list'

function MessageListWithControls() {
  const listRef = useRef<List>(null)
  const { scrollToItem, scrollToBottom } = useVirtualListControl(listRef)

  return (
    <div>
      <div className="mb-4 space-x-2">
        <button onClick={() => scrollToItem(0)}>Go to First</button>
        <button onClick={() => scrollToBottom()}>Go to Bottom</button>
        <button onClick={() => scrollToItem(50, 'center')}>Go to Item 50</button>
      </div>
      
      <VirtualScrollList
        ref={listRef}
        height={400}
        itemCount={messages.length}
        itemSize={80}
        itemData={messages}
      >
        {MessageItem}
      </VirtualScrollList>
    </div>
  )
}
```

---

## ScrollToBottom Component

### Basic Usage

```tsx
import { ScrollToBottom } from '@/components/ui/scroll-to-bottom'

function ChatWindow() {
  const messagesRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative h-96">
      <div ref={messagesRef} className="h-full overflow-auto">
        {messages.map(message => (
          <div key={message.id}>{message.content}</div>
        ))}
      </div>
      
      <ScrollToBottom
        target={messagesRef}
        threshold={100}
        position="bottom-right"
        showUnreadCount={true}
        unreadCount={newMessageCount}
      />
    </div>
  )
}
```

### Advanced Configuration

```tsx
<ScrollToBottom
  target={containerRef}
  threshold={150}
  size="lg"
  variant="secondary"
  position="bottom-center"
  offset={{ x: 0, y: 20 }}
  icon="arrow"
  label="New messages"
  showLabel={true}
  autoHide={true}
  fadeDelay={3000}
  animateOnClick={true}
  onShow={() => console.log('Button shown')}
  onHide={() => console.log('Button hidden')}
  onClick={() => console.log('Scrolled to bottom')}
/>
```

### Using with Chat Auto-Scroll Hook

```tsx
import { useScrollToBottom } from '@/components/ui/scroll-to-bottom'

function ChatMessages({ messages }: { messages: Message[] }) {
  const messagesRef = useRef<HTMLDivElement>(null)
  
  const {
    isNearBottom,
    shouldAutoScroll,
    scrollToBottom,
    enableAutoScroll
  } = useScrollToBottom({
    target: messagesRef,
    threshold: 100,
    autoScroll: true,
    onNewMessage: () => console.log('Auto-scrolled for new message')
  })

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom()
    }
  }, [messages.length, shouldAutoScroll, scrollToBottom])

  return (
    <div className="relative h-96">
      <div ref={messagesRef} className="h-full overflow-auto">
        {messages.map(message => (
          <div key={message.id}>{message.content}</div>
        ))}
      </div>
      
      {!isNearBottom && (
        <button
          onClick={() => {
            scrollToBottom()
            enableAutoScroll()
          }}
          className="absolute bottom-4 right-4"
        >
          Return to bottom
        </button>
      )}
    </div>
  )
}
```

---

## Integration Examples

### Complete Chat Interface

```tsx
import { ScrollContainer } from '@/components/ui/scroll-container'
import { ScrollToBottom, useScrollToBottom } from '@/components/ui/scroll-to-bottom'

function ChatInterface({ messages, onSendMessage }: ChatProps) {
  const messagesRef = useRef<HTMLDivElement>(null)
  const [newMessageCount, setNewMessageCount] = useState(0)
  
  const {
    isNearBottom,
    scrollToBottom,
    shouldAutoScroll
  } = useScrollToBottom({
    target: messagesRef,
    autoScroll: true
  })

  // Track unread messages when not at bottom
  useEffect(() => {
    if (!isNearBottom && messages.length > 0) {
      setNewMessageCount(prev => prev + 1)
    } else {
      setNewMessageCount(0)
    }
  }, [messages.length, isNearBottom])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative">
        <ScrollContainer
          ref={messagesRef}
          className="h-full p-4"
          smoothScrolling={true}
          momentumScrolling={true}
          onReachBottom={() => setNewMessageCount(0)}
        >
          {messages.map(message => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ScrollContainer>
        
        <ScrollToBottom
          target={messagesRef}
          showUnreadCount={true}
          unreadCount={newMessageCount}
          onShow={() => console.log('Scroll button visible')}
        />
      </div>
      
      <MessageInput onSend={onSendMessage} />
    </div>
  )
}
```

### Document List with Virtual Scrolling

```tsx
import { VirtualScrollList, useVirtualListControl } from '@/components/ui/virtual-scroll-list'

const DocumentItem: React.FC<ListChildComponentProps> = ({ index, style, data }) => {
  const document = data[index]
  
  return (
    <div style={style} className="p-4 border-b hover:bg-muted/50">
      <h3 className="font-semibold">{document.title}</h3>
      <p className="text-sm text-muted-foreground">{document.summary}</p>
      <div className="mt-2 text-xs text-muted-foreground">
        {document.uploadDate} • {document.size}
      </div>
    </div>
  )
}

function DocumentList({ documents, onLoadMore }: DocumentListProps) {
  const listRef = useRef<List>(null)
  const { scrollToTop, scrollToItem } = useVirtualListControl(listRef)
  const [loading, setLoading] = useState(false)
  
  const handleLoadMore = useCallback(async () => {
    setLoading(true)
    await onLoadMore()
    setLoading(false)
  }, [onLoadMore])

  return (
    <div className="h-full">
      <div className="p-4 border-b">
        <button onClick={scrollToTop} className="text-sm text-primary">
          Back to top
        </button>
      </div>
      
      <VirtualScrollList
        ref={listRef}
        height={600}
        itemCount={documents.length}
        itemSize={120}
        itemData={documents}
        infiniteLoad={true}
        loading={loading}
        hasNextPage={true}
        loadMore={handleLoadMore}
        scrollRestoration={true}
        scrollKey="document-list"
      >
        {DocumentItem}
      </VirtualScrollList>
    </div>
  )
}
```

---

## Performance Tips

1. **Use Virtual Scrolling** for lists with >100 items
2. **Enable momentum scrolling** on mobile for better UX
3. **Use scroll restoration** for navigation between pages
4. **Debounce scroll handlers** to prevent excessive updates
5. **Use `overscanCount`** to render items outside viewport for smoother scrolling
6. **Implement infinite loading** for large datasets
7. **Cache item sizes** in variable lists when possible

## Accessibility Features

- All components support keyboard navigation
- Proper ARIA labels and roles
- High contrast mode compatibility
- Screen reader friendly
- Focus management for scroll actions

## Browser Support

- ✅ Chrome/Edge 88+
- ✅ Firefox 85+
- ✅ Safari 14+
- ✅ iOS Safari 14+
- ✅ Android Chrome 88+

## CSS Custom Properties

The components respect these CSS custom properties from your design system:

- `--border` - Scrollbar thumb color
- `--background` - Container background
- `--foreground` - Text color
- `--muted` - Subtle backgrounds
- `--muted-foreground` - Subtle text