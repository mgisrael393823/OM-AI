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
   ```
   
   > **Note**: As of recent updates, environment variable validation is strictly enforced. Missing required Supabase variables will prevent the application from starting.

4. **Run database migrations**
   Apply all SQL files in `supabase/migrations`, including
   `supabase/migrations/20250729161400_add_prompt_versioning.sql` which
   introduces the prompt versioning tables.
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
- **Virus Scanning**: Ready for integration

## 📡 API Reference

### Core Endpoints

#### POST `/api/chat`
Unified chat endpoint supporting session persistence and advanced options.
```json
{
  "message": "What are the key terms?",       // simple format
  "sessionId": "session-uuid",               // optional
  "documentId": "doc-uuid"                   // optional
}

// or

{
  "messages": [ { "role": "user", "content": "Analyze this lease" } ],
  "documentContext": { "documentIds": ["doc-uuid"] },
  "options": { "stream": true }
}
```

> **Migration Notice**
> Endpoints `/api/chat-v2` and `/api/chat-enhanced` are deprecated as of 2025-01-25 and will be removed on 2025-04-01.
> They currently redirect to the unified `/api/chat` endpoint with full backward compatibility.
> 
> **Migration Guide:**
> - Replace `/api/chat-enhanced` calls with simple format: `{ "message": "...", "sessionId": "..." }`
> - Replace `/api/chat-v2` calls with complex format: `{ "messages": [...], "options": {...} }`
> - All existing functionality is preserved with improved performance and reliability

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