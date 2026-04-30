# TalentOps — Backend API
## TalentOps

### Tech Stack
- Node.js + Express.js
- MySQL (cPanel / phpMyAdmin)
- JWT Authentication
- Bcrypt password hashing
- Nodemailer (forgot password)
- Multer (file uploads — Phase 4)

---

## ⚡ Quick Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your cPanel MySQL credentials
```

### 3. Database Setup

#### Option A — phpMyAdmin (SQL files)
1. Open phpMyAdmin in cPanel
2. Create database: `task_mgmt_db`
3. Import `schema.sql`
4. Import `seed.sql`

#### Option B — Node.js scripts
```bash
npm run schema   # Create all tables
npm run seed     # Insert sample data
# OR run both:
npm run setup
```

### 4. Start the server
```bash
npm run dev     # Development (nodemon)
npm start       # Production
```

Server runs on: `http://localhost:5000`

---

## 📋 API Endpoints (Phase 1)

| Method | Endpoint                    | Auth | Description          |
|--------|-----------------------------|------|----------------------|
| POST   | /api/auth/login             | ❌   | Login                |
| GET    | /api/auth/me                | ✅   | Get current user     |
| POST   | /api/auth/logout            | ✅   | Logout               |
| PUT    | /api/auth/change-password   | ✅   | Change password      |
| POST   | /api/auth/forgot-password   | ❌   | Send reset email     |
| POST   | /api/auth/reset-password    | ❌   | Reset with token     |

---

## 🔑 Test Credentials (Password: `Password@123`)

| Role        | Email                  |
|-------------|------------------------|
| Admin       | admin@i2speed.com      |
|-------------|------------------------|
| Manager     | sarah@i2speed.com      |
|             | david@i2speed.com      |
|-------------|------------------------|
| Team Leader | alice@i2speed.com      |
|             | bob@i2speed.com        |
|             | carol@i2speed.com      |
|-------------|------------------------|
| Recruiter   | john@i2speed.com       |
|             | emma@i2speed.com       |
|             | liam@i2speed.com       |
|             | mia@i2speed.com        |
|             | noah@i2speed.com       |
|             | olivia@i2speed.com     |
