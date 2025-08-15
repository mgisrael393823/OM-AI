# OM-AI: Commercial Real Estate Intelligence Platform

<div align="center">
  <img src="https://img.shields.io/badge/Next.js-15.2.3-black?style=for-the-badge&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Supabase-Database-green?style=for-the-badge&logo=supabase" alt="Supabase">
  <img src="https://img.shields.io/badge/OpenAI-GPT--4-412991?style=for-the-badge&logo=openai" alt="OpenAI">
</div>

## 🏢 Overview

OM-AI is an AI-powered commercial real estate analysis platform that helps professionals analyze documents, evaluate properties, and make data-driven investment decisions. Built with modern web technologies and secure cloud infrastructure, it provides intelligent document processing and conversational AI capabilities specifically tailored for the CRE industry.

### ✨ Key Features

- **🤖 AI-Powered Chat**: GPT-4 powered assistant specialized in commercial real estate
- **📄 Document Analysis**: Upload and analyze PDF documents (leases, contracts, financial statements)
- **💾 Persistent Chat History**: All conversations saved and searchable
- **🔒 Secure Authentication**: Enterprise-grade auth with Supabase
- **📊 File Management**: Secure document storage with user isolation
- **⚡ Real-time Streaming**: Instant AI responses with streaming support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- OpenAI API key
- **Optional**: Canvas dependencies for enhanced PDF processing (see Canvas Setup below)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/mgisrael393823/OM-AI.git
   cd OM-AI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables** ⚠️ **CRITICAL**
   
   Create a `.env.local` file in the root directory with the following **required** variables:
   ```env
   # Supabase (REQUIRED - Application will not start without these)
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   NEXT_PUBLIC_SUPABASE_BUCKET=documents  # Storage bucket name
   
   # OpenAI (REQUIRED for chat functionality)
   OPENAI_API_KEY=your_openai_api_key
   
   # Database
   DATABASE_URL=your_database_connection_string
   
   # Optional: Sentry error monitoring
   NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
   SENTRY_ORG=your_sentry_org
   SENTRY_PROJECT=your_sentry_project
   SENTRY_AUTH_TOKEN=your_sentry_auth_token
   
   # Environment
   NODE_ENV=development
   
   # Optional: PDF Canvas Processing (see Canvas Setup section)
   USE_CANVAS=false  # Set to 'true' to enable enhanced PDF processing with canvas
   ```
   
   > **Note**: As of recent updates, environment variable validation is strictly enforced. Missing required Supabase variables will prevent the application from starting.

4. **Run database migrations**
   ```bash
   npx supabase db push
   ```

5. **Set up storage bucket**
   ```bash
   node scripts/setup-storage.js
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000)

## 🎨 Canvas Setup (Optional PDF Enhancement)

OM-AI supports enhanced PDF processing with table extraction and OCR capabilities through HTML5 Canvas. This is **optional** and the application works perfectly without it.

### Canvas Options

#### Option 1: Disable Canvas (Recommended for Development)
```env
USE_CANVAS=false
```
- **Benefits**: No dependencies, fast setup, no warnings
- **Processing**: Text-only extraction (sufficient for most documents)
- **Performance**: Faster processing, smaller memory footprint

#### Option 2: Enable Canvas with @napi-rs/canvas (Recommended for Production)
```bash
npm install @napi-rs/canvas
```
```env
USE_CANVAS=true
```
- **Benefits**: Prebuilt binaries, no compilation needed
- **Processing**: Full table extraction + OCR support
- **Platform Support**: Excellent macOS/Linux support

#### Option 3: Enable Canvas with node-canvas (Advanced Users)
```bash
# macOS prerequisites
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman

npm install canvas
```
```env
USE_CANVAS=true
```
- **Benefits**: Full feature set, mature library
- **Drawbacks**: Requires system dependencies, compilation time
- **Best For**: Custom deployments with specific requirements

### Canvas Behavior

| Setting | Table Extraction | OCR | Warnings | Performance |
|---------|------------------|-----|----------|-------------|
| `USE_CANVAS=false` | ❌ | ❌ | ✅ None | ⚡ Fastest |
| `USE_CANVAS=true` + @napi-rs/canvas | ✅ | ✅ | ✅ None | 🔥 Fast |
| `USE_CANVAS=true` + node-canvas | ✅ | ✅ | ⚠️ If deps missing | 🐌 Slower |

### Troubleshooting Canvas Issues

**No Canvas Warnings**: Ensure `USE_CANVAS=false` is set if you don't need enhanced features.

**Missing Dependencies**: If you see canvas-related errors with `USE_CANVAS=true`:
```bash
# Install @napi-rs/canvas instead
npm uninstall canvas
npm install @napi-rs/canvas
```

**macOS Setup**: 
```bash
# If using node-canvas
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 15.2.3 (App Router), TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui, Radix UI primitives
- **Backend**: Next.js API Routes, Edge Functions
- **Database**: PostgreSQL via Supabase
- **Authentication**: Supabase Auth with RLS
- **File Storage**: Supabase Storage
- **AI**: OpenAI GPT-4
- **Deployment**: Vercel

### Project Structure

```
OM-AI/
├── src/
│   ├── pages/           # Next.js pages
│   │   ├── api/        # API endpoints
│   │   ├── auth/       # Authentication pages
│   │   └── app.tsx     # Main application
│   ├── components/     # React components
│   ├── contexts/       # React contexts
│   ├── hooks/          # Custom React hooks
│   ├── lib/           # Utility libraries
│   ├── types/         # TypeScript types
│   └── styles/        # Global styles
├── supabase/
│   └── migrations/    # Database migrations
├── scripts/           # Utility scripts
└── public/           # Static assets
```

### Database Schema

```sql
-- Core tables with RLS enabled
├── users (extends auth.users)
├── documents (PDF storage metadata)
├── chat_sessions (conversation threads)
├── messages (chat messages)
├── document_analysis (extracted insights)
└── subscriptions (billing/tiers)
```

## 🔒 Security

### Authentication & Authorization

- **Supabase Auth**: JWT-based authentication
- **Row Level Security**: All database tables protected with RLS policies
- **API Protection**: All endpoints require authentication
- **Rate Limiting**: Token bucket algorithm for OpenAI API protection

### File Security

- **Private Storage**: User-isolated document storage
- **Signed URLs**: Time-limited access tokens (5-minute TTL)
- **File Validation**: MIME type and size restrictions (10MB limit)
- **Server-Side Verification**: Secure storage verification with service role authentication
- **Rate Limiting**: 30 verification requests per minute per user
- **Path Sanitization**: Prevents directory traversal attacks
- **Virus Scanning**: Ready for integration

## 📡 API Reference

### Core Endpoints

#### POST `/api/chat`
Unified chat endpoint supporting both Chat Completions and Responses API formats.

**API Request Format**

The endpoint accepts two valid request formats. **Never send null values** - omit fields that have no value.

**Chat Completions Format** (for gpt-4o and similar models):
```json
{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "What is the cap rate for this property?"}
  ],
  "sessionId": "optional-session-id",
  "stream": true,
  "max_tokens": 1000,
  "metadata": {"documentId": "doc-uuid"}
}
```

**Responses API Format** (for gpt-5, gpt-4.1, o-series models):
```json
{
  "model": "gpt-5", 
  "input": "What is the cap rate for this property?",
  "sessionId": "optional-session-id",
  "stream": false,
  "max_output_tokens": 1000,
  "metadata": {"documentId": "doc-uuid"}
}
```

**Important Notes:**
- ⚠️ **Never send `null` values** - omit optional fields entirely if they have no value
- ✅ **sessionId**: Must be a string or omitted (not `null`)
- ✅ **Clean payloads**: Remove `undefined` fields before sending
- ✅ **Model routing**: API automatically detects format based on model family

> **Migration Notice**
> Endpoints `/api/chat-v2` and `/api/chat-enhanced` are deprecated as of 2025-01-25 and will be removed on 2025-04-01.
> Legacy `{message: string}` format is no longer supported. Use the formats above.

#### POST `/api/upload`
Upload a PDF document
- Multipart form data
- Field name: `file`
- Max size: 10MB
- Returns document metadata

#### GET `/api/health`
Health check endpoint for monitoring
```json
{
  "status": "healthy",
  "services": {
    "database": "healthy",
    "auth": "healthy",
    "storage": "healthy",
    "openai": "healthy"
  }
}
```

### Error Response Format

All errors follow a consistent format:
```json
{
  "error": "Human readable message",
  "code": "ERROR_CODE",
  "details": "Additional context" // optional
}
```

#### POST `/api/storage/verify`
Server-side storage verification endpoint with byte-level accuracy and security hardening.

**Features:**
- ✅ **Service Role Authentication**: Uses server-side Supabase admin client
- ✅ **Direct File Verification**: HEAD/Range GET requests instead of bucket listing
- ✅ **Byte-Level Validation**: Compares expected vs actual file sizes
- ✅ **Rate Limited**: 30 requests per minute per user
- ✅ **Input Validation**: Zod schema with path sanitization
- ✅ **Retry Logic**: 7 attempts with exponential backoff (100ms → 4000ms)

**Request:**
```json
{
  "path": "userId/123456-document.pdf",
  "expectedBytes": 12345
}
```

**Success Response (200):**
```json
{
  "success": true,
  "exists": true,
  "bytes": 12345,
  "attempts": 1,
  "verifiedAt": "2025-01-15T10:30:00Z",
  "totalTimeMs": 150
}
```

**Error Responses:**
```json
// File Not Found (404)
{
  "success": false,
  "exists": false,
  "code": "FILE_NOT_FOUND",
  "attempts": 7,
  "totalTimeMs": 8500
}

// Size Mismatch (409)
{
  "success": false,
  "exists": true,
  "code": "SIZE_MISMATCH",
  "expectedBytes": 12345,
  "actualBytes": 54321,
  "attempts": 1,
  "totalTimeMs": 200
}

// Invalid Input (422)
{
  "success": false,
  "code": "INVALID_INPUT",
  "details": ["path: Path contains invalid characters"]
}

// Rate Limited (429)
{
  "success": false,
  "code": "RATE_LIMITED",
  "message": "Too many verification requests. Try again in 45 seconds.",
  "limit": 30,
  "remaining": 0,
  "resetTime": 1705317000000
}
```

**Security Features:**
- Server-side bucket resolution (ignores client-provided bucket)
- Path sanitization (rejects `../`, leading `/`, special characters)
- Service role key never exposed to client
- Comprehensive logging with Sentry breadcrumbs

## 🧪 Testing

### Run Tests
```bash
npm test                 # Run all tests
npm run test:coverage   # With coverage report
npm run test:watch     # Watch mode
```

### E2E Tests
```bash
npm run cypress:open    # Interactive mode
npm run cypress:run     # Headless mode
```

## 🚢 Deployment

### Production Build
```bash
npm run build
npm start
```

### Environment Variables (Production)

Required for production deployment:
- All development variables
- `NEXTAUTH_URL`: Your production URL
- `NEXTAUTH_SECRET`: Random secret for session encryption

### CI/CD Pipeline

GitHub Actions workflow included for:
1. Code linting and type checking
2. Unit and integration tests
3. Build verification
4. Automatic deployment to Vercel

## 🛠️ Development

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured with Next.js rules
- **Prettier**: Auto-formatting on save
- **Tailwind**: Utility-first CSS

### Git Workflow

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and commit
3. Push and create PR
4. Merge after review

### Common Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run typecheck    # TypeScript validation
npm run format       # Prettier formatting
```

### Dev HMR Gotchas

Hot Module Replacement (HMR) issues can occasionally cause full page reloads or 404 hot-update errors. Here are quick fixes and best practices:

#### Quick Fixes

```bash
# Fresh start after HMR issues
npm run clean && npm run dev

# Use alternative port if port conflicts persist
npm run dev:alt

# Complete clean including all build artifacts
npm run clean:full && npm run dev
```

#### Best Practices

- **Avoid editing API routes during active development** - Changes to `pages/api/*` trigger server restarts that break HMR
- **Use clean scripts after git operations** - Run `npm run dev:clean` after switching branches or merging
- **Stop dev server before git operations** - Prevents file lock conflicts and stale cache states

#### Troubleshooting

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **404 hot-update errors** | Missing `/_next/static/chunks/` requests | `npm run clean && npm run dev` |
| **Full page reloads** | Components refresh entirely instead of hot updating | Check for recent API route edits, restart dev server |
| **Port conflicts** | "Port 3000 is already in use" | `npm run dev:alt` or manually kill processes on port 3000 |
| **Stale cache** | Changes not reflecting, old content showing | `npm run clean:full && npm run dev` |

#### Port Management

The dev server automatically frees port 3000 before starting. If you encounter persistent port issues:

```bash
# Check what's using port 3000
lsof -ti:3000

# Manual cleanup (automatic in npm run dev)
kill -9 $(lsof -ti:3000)

# Use dedicated development port
npm run dev:alt  # Uses port 3001
```

## 📊 Monitoring

### Health Checks

- `/api/health` - Service status
- Supabase Dashboard - Database metrics
- Vercel Analytics - Performance monitoring
- Error tracking ready for Sentry integration

### Logs

- Server logs: Vercel Functions logs
- Client errors: Browser console
- API errors: Structured JSON responses

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Update documentation
- Follow TypeScript best practices
- Ensure all checks pass

## 📝 License

This project is proprietary software. All rights reserved.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/mgisrael393823/OM-AI/issues)
- **Documentation**: This README and inline code comments
- **Email**: support@om-ai.com (placeholder)

## 🚧 Roadmap

### Phase 1 ✅ (Complete)
- Basic authentication and user management
- Chat interface with OpenAI integration
- Document upload and storage
- Session persistence

### Phase 2 🔄 (In Progress)
- PDF text extraction with OCR
- Advanced document analysis
- Table and form extraction
- Enhanced security measures

### Phase 3 📋 (Planned)
- Subscription billing (Stripe)
- Usage analytics and tracking
- Advanced CRE-specific AI features
- Mobile app development

### Phase 4 🔮 (Future)
- Multi-tenant support
- API for third-party integrations
- Advanced reporting dashboard
- Machine learning insights

## 🏗️ Infrastructure

### Services Used

- **Vercel**: Hosting and serverless functions
- **Supabase**: Database, auth, and storage
- **OpenAI**: AI/ML capabilities
- **GitHub**: Source control and CI/CD

### Performance

- **Page Load**: < 1s (optimized with Next.js)
- **API Response**: < 200ms (excluding AI)
- **AI Response**: Streaming for instant feedback
- **Uptime Target**: 99.9%

---

<div align="center">
  Built with ❤️ for the Commercial Real Estate Industry
</div>