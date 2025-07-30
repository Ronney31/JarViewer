# Frontend Architecture Guide

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Structure](#component-structure)
3. [State Management](#state-management)
4. [Performance Optimizations](#performance-optimizations)
5. [Code Examples](#code-examples)

## Architecture Overview

### Technology Stack

- **React 18**: Component framework with concurrent features
- **TypeScript**: Type safety and developer experience
- **Vite**: Fast build tool and development server
- **Zustand**: Lightweight state management
- **TailwindCSS**: Utility-first CSS framework
- **Framer Motion**: Animation library
- **React Query**: Server state management (planned)

### Project Structure

```
frontend/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── SingleJarDashboard.tsx
│   │   ├── ProgressiveTreeLoader.tsx
│   │   ├── DependencyTreeView.tsx
│   │   └── ...
│   ├── stores/              # Zustand stores
│   │   └── singleJarDashboardStore.ts
│   ├── services/            # API and utility services
│   │   ├── apiService.ts
│   │   └── errorHandlingService.ts
│   ├── types/               # TypeScript type definitions
│   │   └── errors.ts
│   ├── hooks/               # Custom React hooks
│   ├── utils/               # Utility functions
│   └── App.tsx              # Root component
├── tests/                   # Test files
├── public/                  # Static assets
└── package.json             # Dependencies and scripts
```

## Component Structure

### Single JAR Dashboard

**Purpose:** Main dashboard for analyzing individual JAR files.

**Key Features:**
- Tabbed interface (Overview, Tree, Conflicts, Export)
- Real-time loading states with progress indicators
- Error handling with retry mechanisms
- Responsive design for different screen sizes

**5 Whys Analysis:**

1. **Why use tabbed interface?**
   - Large amount of analysis data needs organization

2. **Why separate tabs for different views?**
   - Different data types require different visualization approaches

3. **Why include loading states and progress indicators?**
   - JAR analysis can take several minutes for large files

4. **Why implement retry mechanisms?**
   - Network issues and temporary failures are common

5. **Why responsive design?**
   - Developers use various devices and screen sizes