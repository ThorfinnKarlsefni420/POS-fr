# POS-fr: Kenyan POS System

A comprehensive Point of Sale and Inventory Management system built with React, Supabase, and Prisma.

## Tech Stack
- **Frontend:** React (Vite), TypeScript, Tailwind CSS 4, Zustand, TanStack Query.
- **Backend:** Supabase (PostgreSQL, Auth), Prisma 7.
- **Testing:** Vitest, Playwright.

## Getting Started

### Prerequisites
- Node.js (Latest LTS)
- Supabase account

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Start both frontend and backend (where applicable):
```bash
npm run dev
```

### Database
Database management is handled in `packages/database`.
```bash
cd packages/database
npx prisma generate
```

## Project Structure
- `apps/web`: React frontend.
- `apps/supabase`: Supabase migrations and edge functions.
- `packages/database`: Prisma schema and shared client.
