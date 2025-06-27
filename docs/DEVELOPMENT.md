# Development Guide

## Getting Started

### Prerequisites
- **Python 3.8+**: For backend development
- **Node.js 18+**: For frontend development and tooling
- **Git**: Version control

### Quick Start

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd meeting-mind
   ```

2. **Backend Setup**
   ```bash
   cd backend
   
   # Create virtual environment (recommended)
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Copy environment configuration
   cp .env.example .env
   
   # Start development server
   python main.py
   ```
   Backend will be available at: http://localhost:8000
   API Documentation: http://localhost:8000/docs

3. **Frontend Setup**
   ```bash
   cd frontend
   
   # Install dependencies
   npm install
   
   # Start development server
   npm run dev
   ```
   Frontend will be available at: http://localhost:5173

### Development Workflow

#### Backend Development (FastAPI)

**Project Structure:**
```
backend/
├── main.py              # Application entry point
├── requirements.txt     # Python dependencies
├── .env.example        # Environment configuration template
├── models/             # Database models (coming soon)
├── routes/             # API route handlers (coming soon)
├── services/           # Business logic (coming soon)
└── tests/              # Test files (coming soon)
```

**Key Commands:**
```bash
# Start with auto-reload
python main.py

# Alternative: Use uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run tests (when implemented)
pytest

# Format code
black .

# Type checking
mypy .
```

**Adding New API Endpoints:**
```python
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

@router.get("/meetings")
async def get_meetings():
    return {"meetings": []}

# Register in main.py
app.include_router(router)
```

**WebSocket Development:**
The WebSocket endpoint at `/ws/{client_id}` handles real-time communication. Test with tools like:
- **WebSocket King** (Chrome extension)
- **wscat** (command line tool)
- **Postman** (WebSocket support)

#### Frontend Development (React + Vite)

**Project Structure:**
```
frontend/
├── src/
│   ├── App.tsx          # Main application component
│   ├── index.css        # Global styles with Tailwind
│   ├── main.tsx         # Application entry point
│   ├── components/      # Reusable UI components (coming soon)
│   ├── hooks/           # Custom React hooks (coming soon)
│   ├── services/        # API and WebSocket services (coming soon)
│   └── types/           # TypeScript type definitions (coming soon)
├── public/              # Static assets
├── index.html           # HTML template
├── vite.config.ts       # Vite configuration
├── tailwind.config.js   # Tailwind CSS configuration
└── package.json         # Dependencies and scripts
```

**Key Commands:**
```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check

# Lint code
npm run lint
```

**Component Development with Tailwind:**
```tsx
// Example component using Tailwind classes
function MeetingCard({ meeting }: { meeting: Meeting }) {
  return (
    <div className="card"> {/* Custom Tailwind component class */}
      <h3 className="text-lg font-semibold text-gray-900">
        {meeting.title}
      </h3>
      <p className="text-sm text-gray-600 mt-2">
        {meeting.description}
      </p>
      <button className="btn-primary mt-4">
        Join Meeting
      </button>
    </div>
  )
}
```

#### Shared Types Development

The `/shared` directory contains TypeScript definitions used by both frontend and backend:

```bash
shared/
├── types.ts           # Interface definitions
└── constants.ts       # Shared constants
```

**Adding New Types:**
1. Define interface in `shared/types.ts`
2. Export from the file
3. Import in frontend: `import { Meeting } from '../shared/types'`
4. Use in backend with Pydantic models

**Type Safety Best Practices:**
- Always define interfaces for API responses
- Use enums for fixed value sets
- Add JSDoc comments for complex types
- Keep types close to usage when possible

### Testing

#### Backend Testing
```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest

# Run with coverage
pytest --cov=.

# Test specific file
pytest tests/test_main.py
```

**Example Test:**
```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["message"] == "Welcome to MeetingMind API"
```

#### Frontend Testing
```bash
# Install test dependencies (included in package.json)
npm install

# Run tests
npm run test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Code Quality

#### Formatting and Linting

**Backend (Python):**
```bash
# Install development tools
pip install black mypy flake8

# Format code
black .

# Type checking
mypy .

# Linting
flake8 .
```

**Frontend (TypeScript/React):**
```bash
# Already included in package.json
npm run lint
npm run type-check
```

#### Pre-commit Hooks (Optional)
```bash
# Install pre-commit
pip install pre-commit

# Setup hooks
pre-commit install

# Create .pre-commit-config.yaml
cat > .pre-commit-config.yaml << EOF
repos:
  - repo: https://github.com/psf/black
    rev: 22.3.0
    hooks:
      - id: black
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v0.991
    hooks:
      - id: mypy
EOF
```

### Environment Configuration

#### Backend Environment Variables
Create `.env` file in backend directory:
```bash
# Database
DATABASE_URL=sqlite:///./meetingmind.db

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True

# Security
SECRET_KEY=your-secret-key-here-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# External Services (for future use)
OPENAI_API_KEY=your-openai-key
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=your-region
```

#### Frontend Environment Variables
Create `.env` file in frontend directory:
```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws

# Feature Flags
VITE_ENABLE_AI_INSIGHTS=true
VITE_ENABLE_ANALYTICS=false
```

### Debugging

#### Backend Debugging
```python
# Add debugging to FastAPI
import logging
logging.basicConfig(level=logging.DEBUG)

# Use debugger
import pdb; pdb.set_trace()

# Or with async code
import ipdb; ipdb.set_trace()
```

#### Frontend Debugging
```tsx
// React Developer Tools (Chrome/Firefox extension)
// Redux DevTools (if using Redux)

// Console debugging
console.log('Debug info:', data)

// React strict mode helps catch issues
// Already enabled in main.tsx
```

#### WebSocket Debugging
```javascript
// Browser console WebSocket testing
const ws = new WebSocket('ws://localhost:8000/ws/1')
ws.onopen = () => console.log('Connected')
ws.onmessage = (event) => console.log('Message:', event.data)
ws.send(JSON.stringify({ type: 'test', data: 'hello' }))
```

### Performance Optimization

#### Backend Performance
- Use async/await for I/O operations
- Implement connection pooling for database
- Add response caching for static data
- Use background tasks for heavy processing

#### Frontend Performance
- Code splitting with React.lazy()
- Memoization with React.memo and useMemo
- Virtual scrolling for large lists
- Optimize bundle size with Vite's tree shaking

### Common Issues and Solutions

#### CORS Issues
Make sure CORS is properly configured in `main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### WebSocket Connection Issues
- Check firewall settings
- Verify WebSocket URL format
- Test with simple WebSocket client first
- Check browser developer tools for errors

#### Tailwind CSS Not Working
- Ensure Tailwind is properly installed
- Check `tailwind.config.js` content paths
- Verify `@tailwind` directives in CSS
- Restart Vite dev server after config changes

### Next Steps

1. **Database Models**: Add SQLAlchemy models for data persistence
2. **Authentication**: Implement user registration and login
3. **Real AI Integration**: Connect to speech recognition and NLP services
4. **Testing**: Add comprehensive test coverage
5. **Deployment**: Set up Docker containers and deployment pipeline

This development setup provides a solid foundation for building the MeetingMind application with modern tools and best practices.