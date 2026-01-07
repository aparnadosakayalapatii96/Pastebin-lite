# Pastebin-Lite

A secure, ephemeral text sharing service built with the MERN stack (MongoDB, Express, React, Node.js). Users can create text pastes that automatically expire after a specific time or a set number of views.

## 🔗 Live Demo
* **Frontend:** [https://pastebin-lite-qkxr.vercel.app/](https://pastebin-lite-qkxr.vercel.app/)
* **Backend:** [https://pastebin-lite-alpha-two.vercel.app/](https://pastebin-lite-alpha-two.vercel.app/)

## 🚀 Persistence Layer Choice
**Database:** MongoDB (via MongoDB Atlas)

**Why MongoDB?**
* **Data Persistence:** Meets the requirement to survive server restarts in a serverless environment (Vercel).
* **TTL Indexes:** Native support for time-based document expiry.
* **Atomic Operations:** `findOneAndUpdate` allows for race-condition-safe view counting, ensuring a paste with `max_views=1` is never shown twice even under concurrent load.

## 🛠 Tech Stack
* **Frontend:** React (Vite) - Dark Professional Theme
* **Backend:** Node.js / Express
* **Database:** MongoDB Atlas
* **Deployment:** Vercel (Separate Frontend & Backend)

## ⚙️ Prerequisites
* Node.js (v14 or higher)
* A MongoDB Atlas Connection String

## 📥 Installation & Local Development

This project uses a monorepo structure. You can run the client and server locally by setting them up in separate terminals.

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd Pastebin-lite
    ```

2.  **Setup Backend:**
    Open a terminal, go to the server folder, and install dependencies:
    ```bash
    cd server
    npm install
    ```
    Create a `.env` file in `server/`:
    ```env
    MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/pastebin
    TEST_MODE=1
    CLIENT_URL=http://localhost:5173
    ```
    Run the server:
    ```bash
    node index.js
    ```

3.  **Setup Frontend:**
    Open a **new** terminal, go to the client folder, and install dependencies:
    ```bash
    cd client
    npm install
    ```
    Create a `.env` file in `client/`:
    ```env
    VITE_API_URL=http://localhost:5000
    ```
    Run the frontend:
    ```bash
    npm run dev
    ```
    * **Frontend:** http://localhost:5173
    * **Backend:** http://localhost:5000

## 🔌 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/healthz` | Health check (Returns HTTP 200 JSON) |
| `POST` | `/api/pastes` | Create a new paste (Accepts JSON body) |
| `GET` | `/api/pastes/:id` | Fetch paste data (JSON) |
| `GET` | `/p/:id` | View paste (Rendered HTML) |

## 🧠 Design Decisions & Trade-offs

1.  **Atomic View Counting:**
    To satisfy the strict view limit constraints, the application uses `findOneAndUpdate` with a query filter `{ $lt: ["$currentViews", "$maxViews"] }`. This ensures that the check and increment happen in a single atomic database operation, preventing race conditions.

2.  **Server-Side Rendering for /p/:id:**
    While the creation UI is a React Single Page Application (SPA), the viewing route (`/p/:id`) is server-rendered using Express. This ensures compatibility with automated testing tools (like `curl`) that expect immediate HTML content rather than a JavaScript hydration process.

3.  **Deterministic Testing:**
    The backend implements a custom helper `getCurrentTime()` that respects the `x-test-now-ms` header when `TEST_MODE=1`. This allows the grader to simulate "future" requests to test expiry logic accurately.
