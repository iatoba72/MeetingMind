# MeetingMind Architecture

## Overview

MeetingMind is a modern AI-powered meeting assistant built with a microservices architecture that prioritizes real-time communication, scalability, and developer experience.

## Technology Stack

### Backend: FastAPI (Python)
**Why FastAPI?**
- **Async by Default**: Built-in async/await support crucial for real-time features like live transcription
- **Automatic API Documentation**: Self-generating OpenAPI/Swagger docs reduce development overhead
- **Type Safety**: Pydantic integration provides runtime validation and IDE support
- **Performance**: One of the fastest Python frameworks, comparable to Node.js and Go
- **Modern Python**: Leverages Python 3.6+ features like type hints and dataclasses

**Learning Resources:**
- [FastAPI Official Tutorial](https://fastapi.tiangolo.com/tutorial/)
- [Real Python FastAPI Guide](https://realpython.com/fastapi-python-web-apis/)
- [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices)

### Frontend: React + Vite + TypeScript
**Why React?**
- **Component Architecture**: Perfect for building complex, interactive UIs
- **Large Ecosystem**: Extensive library support and community
- **TypeScript Integration**: Excellent type safety for large applications
- **Real-time Updates**: Efficient state management for live data

**Why Vite?**
- **Lightning Fast**: 10-100x faster than traditional bundlers
- **Hot Module Replacement**: Instant updates during development
- **Modern Tooling**: Built for ES modules and modern JavaScript
- **Framework Agnostic**: Easy to migrate or add other frameworks

**Learning Resources:**
- [React Official Tutorial](https://react.dev/learn)
- [Vite Guide](https://vitejs.dev/guide/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Styling: Tailwind CSS
**Why Tailwind?**
- **Utility-First**: Rapid UI development without writing custom CSS
- **Consistent Design System**: Built-in spacing, colors, and typography scales
- **Responsive by Default**: Mobile-first responsive design utilities
- **Performance**: Purges unused CSS for minimal bundle size
- **Developer Experience**: IntelliSense support and design tokens

**Learning Resources:**
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Tailwind UI Components](https://tailwindui.com/)
- [Headless UI (Unstyled Components)](https://headlessui.com/)

### Real-time Communication: WebSockets
**Why WebSockets?**
- **Low Latency**: Essential for live transcription and real-time updates
- **Bidirectional**: Full-duplex communication between client and server
- **Efficient**: Lower overhead than HTTP polling for frequent updates
- **Event-Driven**: Perfect for meeting events, participant updates, and AI insights

### Database: SQLite (Development) → PostgreSQL (Production)
**Why SQLite for Development?**
- **Zero Configuration**: No setup required, perfect for getting started
- **Serverless**: Embedded database, easy to share and backup
- **Fast**: Excellent performance for development and testing
- **Production Ready**: Used by major applications like WhatsApp

**Migration Path to PostgreSQL:**
- **Scalability**: Better concurrent access and performance
- **Features**: Advanced indexing, full-text search, JSON support
- **Deployment**: Better cloud hosting support and tooling

## Architecture Patterns

### Monorepo Structure
```
meeting-mind/
├── backend/           # FastAPI application
├── frontend/          # React application  
├── shared/           # Shared types and constants
└── docs/             # Documentation and diagrams
```

**Benefits:**
- **Code Sharing**: Shared types ensure frontend/backend consistency
- **Atomic Changes**: Update both frontend and backend in single commits
- **Simplified Dependencies**: Easier to manage versions and updates
- **Better Collaboration**: All code in one repository

### Event-Driven Architecture
The application uses WebSocket events for real-time features:

1. **Meeting Events**: Start, end, participant join/leave
2. **Transcription Events**: Live text updates, speaker identification
3. **AI Events**: Insights, action item detection, sentiment analysis
4. **System Events**: Connection status, error handling

### Data Flow

```
Audio Input → WebSocket → FastAPI → AI Processing → WebSocket → React UI
     ↑                                     ↓
User Interface ← WebSocket ← Database ← Processed Results
```

## Key Design Decisions

### 1. TypeScript Everywhere
- **Frontend**: React components with full type safety
- **Shared**: Common types and interfaces
- **Backend**: Python with Pydantic models (equivalent type safety)

### 2. Real-time First
- **WebSocket Primary**: HTTP for initial data, WebSocket for updates
- **Optimistic Updates**: UI updates immediately, syncs with server
- **Connection Resilience**: Automatic reconnection and state recovery

### 3. AI Integration Points
- **Speech-to-Text**: Real-time transcription during meetings
- **Natural Language Processing**: Action item extraction, sentiment analysis
- **Summarization**: Meeting summaries and key points
- **Insights**: Pattern recognition and meeting analytics

### 4. Progressive Enhancement
- **Core Features First**: Basic meeting functionality without AI
- **AI as Enhancement**: AI features enhance but don't replace core functionality
- **Graceful Degradation**: Application works even if AI services are unavailable

## Development Workflow

### Local Development
1. **Backend**: `cd backend && python main.py` (or `uvicorn main:app --reload`)
2. **Frontend**: `cd frontend && npm run dev`
3. **Shared Types**: Import from `../shared/types.ts`

### Testing Strategy
- **Backend**: FastAPI TestClient with pytest
- **Frontend**: React Testing Library + Vitest
- **E2E**: Playwright for full user workflows
- **Real-time**: WebSocket testing with dedicated test clients

### Deployment Strategy
- **Development**: Local SQLite + development servers
- **Staging**: Docker containers + PostgreSQL
- **Production**: Kubernetes/Docker + managed database + CDN

## Security Considerations

### Authentication & Authorization
- **JWT Tokens**: Stateless authentication
- **Role-Based Access**: Meeting hosts, participants, observers
- **API Rate Limiting**: Prevent abuse and ensure fair usage

### Data Privacy
- **Encryption**: All data encrypted in transit and at rest
- **Minimal Storage**: Audio deleted after transcription (configurable)
- **GDPR Compliance**: Data export and deletion capabilities

### Real-time Security
- **WebSocket Authentication**: Token-based connection validation
- **Message Validation**: All messages validated against schemas
- **Rate Limiting**: Prevent WebSocket abuse

## Scalability Considerations

### Current Architecture (MVP)
- **Single Server**: FastAPI server handling all requests
- **SQLite**: Simple file-based database
- **In-Memory**: WebSocket connections and real-time state

### Future Scaling (Production)
- **Load Balancing**: Multiple FastAPI instances behind load balancer
- **Database**: PostgreSQL with read replicas
- **Message Queue**: Redis for WebSocket message distribution
- **Microservices**: Separate AI processing services
- **CDN**: Static asset delivery and global distribution

This architecture provides a solid foundation for rapid development while maintaining the flexibility to scale as the application grows.