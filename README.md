# Inventory App

A modern, high-performance desktop inventory management application built with **Electron**, **Next.js** (App Router), **TypeScript**, **Tailwind CSS v4**, and **shadcn/ui**.

---

## 🏗️ Project Architecture & Structure

This repository follows a clean multi-process architecture separating the Electron main process from the Next.js renderer process.

```text
inventory-app/
├── electron/                   # Electron Main Process (Desktop Host)
│   ├── db/                     # Database Configuration & Migrations
│   │   ├── migrations/         # SQL migration scripts (e.g. 001_init.sql)
│   │   └── connection.js       # SQLite connection & transaction helpers
│   ├── ipc/                    # IPC Handlers & Envelopes
│   │   ├── auth.js             # Authentication IPC handlers (auth:login)
│   │   ├── items.js            # Items management IPC handlers (items:list, get, create, update, archive)
│   │   └── wrap.js             # Generic IPC handler wrapper & error envelope transformer
│   ├── errors.js               # Custom AppError classes (ValidationError, NotFoundError, ConflictError, etc.)
│   ├── main.js                 # Electron main window lifecycle & window configuration
│   ├── migrate.js              # Migration execution script
│   ├── preload.js              # Preload bridge for secure IPC communication
│   └── seed-admin.js           # Admin user database seeding script
│
├── renderer/                   # Next.js Renderer Process (UI Application)
│   ├── app/                    # Next.js App Router
│   │   ├── dashboard/          # Dashboard page
│   │   │   └── page.tsx        # Dashboard page wrapped in RequireAuth & AppShell
│   │   ├── items/              # Items management page
│   │   │   └── page.tsx        # Items list, search, filter & management page
│   │   ├── login/              # Login authentication page
│   │   │   └── page.tsx        # Sign-in form page
│   │   ├── favicon.ico         # Application favicon
│   │   ├── globals.css         # Global styles & Tailwind CSS setup
│   │   ├── layout.tsx          # Root layout wrapper (AuthProvider & Toaster)
│   │   └── page.tsx            # Root page with automatic redirect to /dashboard/ or /login/
│   ├── components/             # React UI components
│   │   ├── items/              # Items module UI components
│   │   │   ├── columns.tsx     # TanStack Table column definitions
│   │   │   ├── item-form-dialog.tsx # Create & Edit Item dialog form
│   │   │   └── items-table.tsx # Data table wrapper component
│   │   ├── ui/                 # Reusable shadcn/ui components (Dialog, Table, Select, Badge, etc.)
│   │   ├── app-shell.tsx       # Sidebar navigation layout shell
│   │   └── require-auth.tsx    # Client-side route guard wrapper
│   ├── hooks/                  # Custom React hooks
│   │   └── use-debounce.ts     # Search input debouncing hook
│   ├── lib/                    # Utility functions & context
│   │   ├── auth-context.tsx    # React AuthProvider & useAuth hook
│   │   ├── ipc-client.ts       # IPC promise unwrapper & error handler
│   │   ├── types.ts            # Frontend domain TypeScript interfaces (Item, ItemsListResult)
│   │   └── utils.ts            # Classnames merging (clsx & tailwind-merge)
│   ├── types/                  # TypeScript type definitions
│   │   └── electron.d.ts       # Global Window.electronAPI type definitions
│   ├── public/                 # Static assets (images, SVGs)
│   ├── components.json         # shadcn/ui configuration
│   ├── next.config.ts          # Next.js configuration
│   ├── postcss.config.mjs      # PostCSS configuration
│   ├── tsconfig.json           # TypeScript configuration
│   └── package.json            # Renderer dependencies & scripts
│
├── package.json                # Root process orchestration & electron-builder configuration
├── package-lock.json           # Root lockfile
└── README.md                   # Project documentation
```

---

## 🛠️ Tech Stack

- **Desktop Host:** [Electron](https://www.electronjs.org/)
- **Frontend Framework:** [Next.js](https://nextjs.org/) (App Router, React 19)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/) & [Radix UI](https://www.radix-ui.com/)
- **Packaging:** [electron-builder](https://www.electron.build/)

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v18+ recommended) and `npm` installed on your machine.

### Installation

1. **Install Root Dependencies:**
   ```bash
   npm install
   ```

2. **Install Renderer Dependencies:**
   ```bash
   cd renderer
   npm install
   cd ..
   ```

---

## 💻 Development & Building

### Running in Development Mode

Run the following command from the root directory to start both the Next.js dev server and the Electron application concurrently:

```bash
npm run dev
```

This will:
1. Start the Next.js development server at `http://localhost:3000`.
2. Wait for `http://localhost:3000` to be ready.
3. Launch Electron window pointing to the dev server with DevTools enabled.

### Building for Production

To build the Next.js application and package the Electron app into a executable bundle:

```bash
npm run build
```

---

# clear system data
npm run clear-data

## 📜 Available NPM Scripts

### Root Scripts (`/package.json`)

| Command | Action |
| :--- | :--- |
| `npm run dev` | Launches Next.js dev server and Electron app concurrently in development mode |
| `npm run dev:next` | Starts only the Next.js dev server (`http://localhost:3000`) |
| `npm run dev:electron` | Waits for local dev server and launches Electron app |
| `npm run build` | Builds Next.js renderer static export and packages desktop executable via `electron-builder` |
| `npm run build:next` | Builds only the Next.js application for production |

### Renderer Scripts (`/renderer/package.json`)

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts Next.js development server |
| `npm run build` | Builds Next.js renderer app |
| `npm run lint` | Runs ESLint check across renderer codebase |
