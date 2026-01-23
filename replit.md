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
- **Product Database**: Individual products stored with name, keywords, description, price, image URL
- **Smart Product Search**: AI searches products by name/keywords, only includes matching products in context
- **Accent Normalization**: Search handles Spanish accents (berberina = berbérina)
- **Conversation Context**: Reviews last 3 messages for efficiency
- **Image Responses**: Can send images via URL using [IMAGEN: url] format
- **Logging**: All AI interactions logged for debugging (tokens used, success/error status)
- **Settings Page**: /ai-agent route for enabling/disabling, setting system prompt, and managing products
- **Configurable Model Settings**:
  - maxTokens: Adjustable 50-500 (default 120) - controls response length
  - temperature: Adjustable 0-100 (default 70) - controls creativity (0=precise, 100=creative)
  - model: Selectable GPT-4o-mini, GPT-4o, or GPT-4 Turbo
- **Token Optimization**: 
  - Only includes matching products (~400-600 tokens) instead of full catalog
  - Falls back to catalog text field if no products in database
  - Strict response rules: 2-5 lines max, max 2 questions, human tone

### Push Notifications (OneSignal)
- **Provider**: OneSignal Web Push SDK v16
- **App ID**: 07dfe1e4-83b1-4623-b57c-e6e33232d4eb
- **Trigger**: Sends push notification when new WhatsApp message arrives
- **Content**: Shows contact name as title, message preview as body
- **Unique notifications**: Each message creates a separate notification (no grouping)
- **Service Worker**: OneSignalSDKWorker.js in public folder

### Authentication
- Simple username/password authentication against environment variables (ADMIN_USER, ADMIN_PASS)
- Session-based authentication with express-session
- Session duration: 7 days (extended from 24h)
- Protected API routes require active session

### Order Management (Call Center Features)
- **Order Status Field**: conversations.orderStatus ('pending', 'ready', 'delivered', null)
- **Visual Indicators**: 
  - Green highlight and checkmark icon for "ready to deliver" orders
  - Yellow icon for "pending" orders
  - Blue truck icon for "delivered" orders
- **Auto-detection**: AI marks orders as "ready" when it detects complete order info (product, quantity, address)
- **Manual control**: Dropdown in chat header to change order status
- **Location Recognition**: Webhook detects location/GPS messages and passes them to AI as delivery address

### WhatsApp Integration
- **Webhook Verification**: GET /webhook validates verify_token
- **Message Reception**: POST /webhook processes incoming messages and status updates
- **Location Messages**: Recognizes GPS/Maps locations as delivery addresses
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