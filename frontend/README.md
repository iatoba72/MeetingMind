# MeetingMind Frontend

Modern React application built with Vite and Tailwind CSS for the MeetingMind AI meeting assistant.

## 🎯 Overview

This frontend provides a responsive, real-time user interface featuring:
- **Real-time WebSocket communication** with visual connection status
- **Modern React patterns** with hooks and TypeScript
- **Tailwind CSS styling** for rapid, consistent UI development
- **Responsive design** that works on desktop and mobile
- **Development-optimized** with Vite's hot module replacement

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at http://localhost:5173

## 🏗️ Architecture

### Why React + Vite?

**React** provides the component-based architecture perfect for complex UIs:
```tsx
// Component composition with props and state
function MeetingCard({ meeting }: { meeting: Meeting }) {
  const [isJoined, setIsJoined] = useState(false);
  
  return (
    <div className="card">
      <h3>{meeting.title}</h3>
      <button onClick={() => setIsJoined(true)}>
        Join Meeting
      </button>
    </div>
  );
}
```

**Vite** delivers lightning-fast development experience:
- ⚡ **Instant Server Start**: No bundling during development
- 🔥 **Hot Module Replacement**: Updates without losing state
- 📦 **Optimized Builds**: Rollup-based production bundling
- 🔧 **Zero Configuration**: Works out of the box

### Why Tailwind CSS?

Tailwind enables rapid UI development with utility classes for consistent design and rapid prototyping.

## 🔧 Development Commands

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Type checking
npm run type-check
```

## 🎓 Learning Resources

### React Fundamentals
- [React Official Tutorial](https://react.dev/learn) - Modern React with hooks
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/) - TypeScript patterns

### Vite Build Tool
- [Vite Guide](https://vitejs.dev/guide/) - Getting started with Vite
- [Vite Features](https://vitejs.dev/guide/features.html) - Advanced features

### Tailwind CSS
- [Tailwind Documentation](https://tailwindcss.com/docs) - Complete utility reference
- [Tailwind Components](https://tailwindui.com/components) - Professional examples

This frontend provides a modern, scalable foundation for building sophisticated meeting applications with excellent developer experience.