# WhatsApp Mini Inbox MVP

## Overview

This is a WhatsApp Cloud API inbox application that allows users to receive and send WhatsApp messages through a web-based admin panel. The application connects to Meta's WhatsApp Business API via webhooks to receive incoming messages and uses the Graph API to send outgoing messages. It provides a real-time conversation management interface with support for text messages, images, labels, and quick message templates.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state with polling (8-second intervals for real-time updates)
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Build Tool**: Vite with React plugin

The frontend follows a single-page application pattern with protected routes. Authentication state is managed through React Query, and the main inbox interface uses a resizable panel layout for desktop with a responsive mobile view.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ES modules)
- **Session Management**: express-session with MemoryStore
- **API Structure**: RESTful endpoints defined in shared route schemas with Zod validation

The server handles three main responsibilities:
1. Webhook endpoints for Meta's WhatsApp Cloud API (verification and message receiving)
2. REST API for the admin panel (conversations, messages, labels, quick messages)
3. Proxy for WhatsApp media files

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema**: Seven main tables - conversations, messages, labels, quick_messages, ai_settings, ai_training_data, ai_logs
- **Migrations**: Drizzle Kit for schema management (`npm run db:push`)

### AI Agent Integration
- **AI Provider**: OpenAI GPT-4o-mini via official SDK
- **Auto-Response**: When enabled, automatically responds to incoming WhatsApp messages
- **Training Data**: Supports text information, URLs, and image URLs stored in database
- **Conversation Context**: Reviews last 6 messages (optimized from 10 for token efficiency)
- **Image Responses**: Can send images via URL when included in training data using [IMAGEN: url] format
- **Logging**: All AI interactions logged for debugging (tokens used, success/error status)
- **Settings Page**: /ai-agent route for enabling/disabling, setting system prompt, and managing training data
- **Token Optimization**: 
  - max_tokens: 120 (reduced from 500)
  - shouldAttachCatalog: Only sends product info when keywords detected (precio, producto, comprar, etc.)
  - Duplicate message prevention: Excludes current message from history
  - Strict response rules: 2-5 lines max, max 2 questions, human tone (Isabella)
- **Training Data Cache**: 
  - In-memory cache to avoid DB queries on every message
  - Configurable refresh interval (1-60 minutes, default 5)
  - Manual "Actualizar ahora" button for instant refresh after training data changes

### Authentication
- Simple username/password authentication against environment variables (ADMIN_USER, ADMIN_PASS)
- Session-based authentication with express-session
- Protected API routes require active session

### WhatsApp Integration
- **Webhook Verification**: GET /webhook validates verify_token
- **Message Reception**: POST /webhook processes incoming messages and status updates
- **Message Sending**: Uses Meta Graph API v24.0 with Bearer token authentication
- **Media Handling**: Proxies media requests through /media/:mediaId endpoint

## External Dependencies

### Meta WhatsApp Cloud API
- **Purpose**: Send and receive WhatsApp messages
- **Endpoints**: Graph API v24.0 for messaging, webhook callbacks for receiving
- **Required Secrets**:
  - `META_ACCESS_TOKEN`: Access token with whatsapp_business_messaging permission
  - `WA_PHONE_NUMBER_ID`: WhatsApp Business phone number ID
  - `WA_VERIFY_TOKEN`: Token for webhook verification (default: ryztor_verify_2026)
  - `APP_SECRET`: Optional, for payload signature validation

### PostgreSQL Database
- **Purpose**: Persistent storage for conversations, messages, labels, and quick messages
- **Connection**: Via DATABASE_URL environment variable
- **ORM**: Drizzle ORM with node-postgres driver

### Session Storage
- **Purpose**: Admin session management
- **Secret**: SESSION_SECRET environment variable required

### Key NPM Packages
- `axios`: HTTP client for Meta API requests
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `express-session` / `memorystore`: Session handling
- `@tanstack/react-query`: Client-side data fetching and caching
- `zod`: Schema validation for API contracts