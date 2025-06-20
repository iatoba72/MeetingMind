# MeetingMind - AI Meeting Assistant

A modern, AI-powered meeting assistant that provides real-time transcription, intelligent insights, and automated action item extraction.

## 🎯 Features

- **Real-time Transcription**: Live speech-to-text conversion during meetings
- **AI Insights**: Automated meeting summaries and key point extraction
- **Action Item Detection**: Automatically identify and track follow-up tasks
- **WebSocket Communication**: Low-latency real-time updates
- **Modern UI**: Responsive design built with React and Tailwind CSS
- **Type Safety**: Full TypeScript support across frontend and backend

## 🏗️ Architecture

### Technology Stack

- **Backend**: Python with FastAPI for high-performance async API
- **Frontend**: React with Vite for lightning-fast development
- **Styling**: Tailwind CSS for rapid, consistent UI development
- **Real-time**: WebSockets for live communication
- **Database**: SQLite (development) → PostgreSQL (production)
- **Types**: Shared TypeScript definitions for type safety

### Why These Technologies?

**FastAPI** was chosen for its:
- Native async/await support (crucial for real-time features)
- Automatic API documentation generation
- Excellent performance (comparable to Node.js and Go)
- Built-in data validation with Pydantic

**React + Vite** provides:
- Component-based architecture for complex UIs
- Hot module replacement for instant development feedback
- Excellent TypeScript integration
- Modern build tooling with ES modules

**Tailwind CSS** enables:
- Rapid prototyping with utility classes
- Consistent design system
- Optimized bundle sizes with purging
- Responsive design by default

## 🚀 Quick Start

### Prerequisites
- Python 3.8+ 
- Node.js 18+
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd meeting-mind
   ```

2. **Backend Setup**
   ```bash
   cd backend
   
   # Create virtual environment
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Configure environment
   cp .env.example .env
   
   # Start backend server
   python main.py
   ```
   
   Backend available at: http://localhost:8000
   API docs at: http://localhost:8000/docs

3. **Frontend Setup**
   ```bash
   cd frontend
   
   # Install dependencies
   npm install
   
   # Start development server
   npm run dev
   ```
   
   Frontend available at: http://localhost:5173

### Development Workflow

The application automatically connects the frontend to the backend via WebSocket. You'll see connection status in the UI and can test real-time communication immediately.

## 📁 Project Structure

```
meeting-mind/
├── backend/              # FastAPI application
│   ├── main.py          # Application entry point with WebSocket setup
│   ├── requirements.txt # Python dependencies
│   └── .env.example     # Environment configuration template
├── frontend/            # React application
│   ├── src/
│   │   ├── App.tsx      # Main component with WebSocket integration
│   │   ├── index.css    # Tailwind CSS configuration
│   │   └── main.tsx     # Application entry point
│   ├── tailwind.config.js
│   └── package.json
├── shared/              # Shared TypeScript definitions
│   ├── types.ts         # Interface definitions for meetings, AI, etc.
│   └── constants.ts     # Shared configuration and constants
└── docs/                # Documentation
    ├── ARCHITECTURE.md  # Detailed architecture explanations
    └── DEVELOPMENT.md   # Development setup and guidelines
```

## 🎓 Learning Resources

This project is designed to be educational. Each technology choice includes learning resources:

### FastAPI (Backend)
- [FastAPI Official Tutorial](https://fastapi.tiangolo.com/tutorial/) - Start here for basics
- [Real Python FastAPI Guide](https://realpython.com/fastapi-python-web-apis/) - In-depth tutorial
- [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices) - Production tips

### React + Vite (Frontend)
- [React Official Tutorial](https://react.dev/learn) - Modern React concepts
- [Vite Guide](https://vitejs.dev/guide/) - Build tool fundamentals
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - Type system mastery

### Tailwind CSS (Styling)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs) - Complete utility reference
- [Tailwind UI Components](https://tailwindui.com/) - Professional component examples
- [Headless UI](https://headlessui.com/) - Unstyled, accessible components

### WebSockets (Real-time)
- [WebSocket API MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) - Browser API reference
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/) - Backend implementation
- [Real-time Apps Guide](https://ably.com/topic/websockets) - Concepts and patterns

## 🧪 Testing the Setup

1. **Start both servers** (backend and frontend)
2. **Open http://localhost:5173** in your browser
3. **Check connection status** - should show "Connected" with green indicator
4. **Open browser developer tools** to see WebSocket messages
5. **Test real-time communication** by examining the System Messages panel

## 🔧 Development Commands

### Backend
```bash
# Start with auto-reload
python main.py

# Run tests (when implemented)
pytest

# Format code
black .

# Type checking
mypy .
```

### Frontend
```bash
# Development server
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check

# Lint code
npm run lint
```

## 🎯 Next Steps

This foundation provides everything needed to build a production-ready meeting assistant:

1. **Database Models**: Add SQLAlchemy models for data persistence
2. **Authentication**: Implement user registration and JWT-based auth
3. **AI Integration**: Connect to speech recognition services (Azure Speech, OpenAI Whisper)
4. **Advanced Features**: 
   - Speaker identification
   - Sentiment analysis
   - Meeting analytics
   - Calendar integration
5. **Deployment**: Docker containerization and cloud deployment

## 🤝 Contributing

This project follows modern development practices:

- **Type Safety**: All code uses TypeScript or Python type hints
- **Code Quality**: Linting and formatting tools configured
- **Testing**: Test structure ready for implementation
- **Documentation**: Comprehensive guides and inline comments

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed development guidelines.

## 📖 Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) - Detailed technical decisions and patterns
- [Development Guide](docs/DEVELOPMENT.md) - Setup, workflow, and best practices

## 🚀 Why This Stack?

This technology combination was specifically chosen for learning modern web development:

- **Full-Stack TypeScript**: Type safety from database to UI
- **Real-time Architecture**: WebSockets for live collaboration features
- **Modern Tooling**: Latest build tools and development experience
- **Production Ready**: Technologies used by major companies
- **Educational Value**: Each tool teaches transferable concepts
- **AI Integration**: Foundation for machine learning features

The result is a codebase that demonstrates professional development practices while building genuinely useful software.

---

**Built with ❤️ for learning modern web development**