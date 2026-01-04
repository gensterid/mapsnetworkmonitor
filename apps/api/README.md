# MikroTik Monitoring API

Backend API for the MikroTik router monitoring application.

## Tech Stack

- **Express.js** - Web framework
- **DrizzleORM** - Database ORM
- **PostgreSQL** - Database
- **Better Auth** - Authentication
- **Zod** - Validation
- **TypeScript** - Type safety

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Run database migrations:
```bash
npm run db:push
```

4. Start development server:
```bash
npm run dev
```

## API Endpoints

### Authentication (`/api/auth/*`)
Better Auth handles authentication automatically:
- `POST /api/auth/sign-in/email` - Login
- `POST /api/auth/sign-up/email` - Register
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/session` - Get session

### Routers (`/api/routers`)
- `GET /` - List all routers
- `GET /:id` - Get router by ID
- `POST /` - Create router (Operator+)
- `PUT /:id` - Update router (Operator+)
- `DELETE /:id` - Delete router (Admin)
- `POST /:id/test-connection` - Test connection (Operator+)
- `POST /:id/refresh` - Refresh status (Operator+)
- `POST /:id/reboot` - Reboot router (Admin)
- `GET /:id/interfaces` - Get interfaces
- `GET /:id/metrics` - Get latest metrics
- `GET /:id/metrics/history` - Get metrics history

### Alerts (`/api/alerts`)
- `GET /` - List all alerts
- `GET /unread` - Get unread count
- `GET /:id` - Get alert by ID
- `PUT /:id/acknowledge` - Acknowledge (Operator+)
- `DELETE /:id` - Delete alert (Admin)

### Groups (`/api/groups`)
- `GET /` - List all groups
- `POST /` - Create group (Admin)
- `PUT /:id` - Update group (Admin)
- `DELETE /:id` - Delete group (Admin)

### Users (`/api/users`)
- `GET /` - List all users (Admin)
- `GET /me` - Get current user
- `GET /:id` - Get user (Admin/Self)
- `PUT /:id` - Update user (Admin/Self)
- `PUT /:id/role` - Update role (Admin)
- `DELETE /:id` - Delete user (Admin)

### Dashboard (`/api/dashboard`)
- `GET /stats` - Get statistics
- `GET /map-data` - Get map markers
- `GET /recent-alerts` - Get recent alerts

### Settings (`/api/settings`)
- `GET /` - Get all settings (Admin)
- `PUT /:key` - Update setting (Admin)
- `GET /audit-logs` - Get audit logs (Admin)

## User Roles

- **Admin** - Full access to all resources
- **Operator** - Can manage routers, acknowledge alerts
- **User** - Read-only access

## Project Structure

```
src/
├── db/
│   ├── schema/         # DrizzleORM schemas
│   └── index.ts        # Database connection
├── lib/
│   ├── auth.ts         # Better Auth config
│   ├── encryption.ts   # Password encryption
│   └── mikrotik-api.ts # RouterOS API wrapper
├── middleware/
│   ├── auth.middleware.ts
│   ├── rbac.middleware.ts
│   └── error.middleware.ts
├── routes/
│   ├── auth.routes.ts
│   ├── router.routes.ts
│   ├── alert.routes.ts
│   └── ...
├── services/
│   ├── router.service.ts
│   ├── alert.service.ts
│   └── ...
├── types/
│   └── index.ts
└── index.ts            # Entry point
```
