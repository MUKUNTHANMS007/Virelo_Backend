# 3D Animation Editor — Full Project Handoff for Backend Agent

## 1. Project Overview

This is a **web-based 3D Animation Editor SaaS platform** called **TemporalAI**. Users can create 3D scenes in the browser, manipulate objects, sculpt meshes, adjust lighting, and export their work. The product also features a marketing front-end with a home page, product showcase, news/blog section, documentation, and user authentication (sign-in/sign-up).

**The entire frontend is built and functional.** We now need the Node.js backend to power it.

---

## 2. Frontend Tech Stack

| Technology | Purpose |
|---|---|
| **React 19** + **TypeScript** | Core UI framework |
| **Vite 7** | Build tool and dev server |
| **Tailwind CSS v4** | Styling |
| **Framer Motion** | Page transitions and micro-animations |
| **React Three Fiber (R3F)** + **Three.js** | 3D rendering engine for the editor |
| **@react-three/drei** | Helpers: OrbitControls, Grid, Shadows, Stage |
| **Zustand** | Lightweight global state (editor store) |
| **Leva** | GUI controls panel for AI/Sun properties |
| **Lucide React** | Icon library |

---

## 3. Frontend Pages & What They Do

### 3.1 Home Page (`/home`)
A hero landing page with an image carousel, marketing copy ("Unleash the Power of Temporal AI"), and feature highlights (Quantum Motion, Style Coherence, Real-time Synthesis).

![Home Page](file:///C:/Users/Mukunthan/.gemini/antigravity/brain/9cb1ebc9-d95c-459d-896a-6b9e426da167/home_page_1773372945718.png)

---

### 3.2 Products Page (`/products`)
The default page. Shows "The Workspace" with upload areas for Start Frame and End Frame images. Below that, a toolkit section showcases four AI features: Temporal Transition, Motion Extend, Scene Morph, and Temporal Upscale.

![Products Page](file:///C:/Users/Mukunthan/.gemini/antigravity/brain/9cb1ebc9-d95c-459d-896a-6b9e426da167/products_page_1773372933330.png)

---

### 3.3 3D Editor Page (`/editor`)
The core feature. A full-screen, interactive 3D editor built with React Three Fiber. Features include:
- **Object Spawning**: Cubes, Spheres, Cylinders via toolbar buttons.
- **Import Models**: Load `.glb`/`.gltf` models from the local filesystem.
- **Transform Controls**: Translate (`G`), Rotate (`R`), Scale (`S`) gizmos.
- **Sculpting Mode**: Vertex deformation brush for organic modeling.
- **Sun Lighting**: Adjustable position (X,Y,Z), intensity, and color via GUI sliders (Leva).
- **Outliner Panel**: Lists all objects in the scene for selection.
- **Properties Panel**: AI properties (temporal smoothness, frame density, prompt strength, interpolation mode) and Sun settings.
- **Export**: Exports the entire Three.js scene as a `.gltf` file.

![Editor Page](file:///C:/Users/Mukunthan/.gemini/antigravity/brain/9cb1ebc9-d95c-459d-896a-6b9e426da167/editor_page_1773372983512.png)

---

### 3.4 Documentation Page (`/docs`)
A comprehensive documentation page with a collapsible sidebar and sections covering: Introduction, Object Spawning, Transform Controls, Lighting, Sculpting Tool, and Export to GLTF. Each section has step-by-step instructions and image placeholders for visual guides.

![Docs Page](file:///C:/Users/Mukunthan/.gemini/antigravity/brain/9cb1ebc9-d95c-459d-896a-6b9e426da167/docs_page_1773372965719.png)

---

### 3.5 News Page (`/news`)
A blog/news section with a featured article card, a grid of article cards, category filters (All, Product, Engineering, Community, Announcements), search, and a newsletter subscription CTA. **Currently uses hardcoded data.**

![News Page](file:///C:/Users/Mukunthan/.gemini/antigravity/brain/9cb1ebc9-d95c-459d-896a-6b9e426da167/news_page_1773372995266.png)

---

### 3.6 Sign In Page (`/signin`)
A glassmorphic login form with email/password fields, Google and GitHub social login buttons, and a link to the Sign Up page.

![Sign In Page](file:///C:/Users/Mukunthan/.gemini/antigravity/brain/9cb1ebc9-d95c-459d-896a-6b9e426da167/signin_page_1773373006803.png)

---

### 3.7 Sign Up Page (`/signup`)
Similar to Sign In but adds a Full Name field. Has social login options and a link back to the Sign In page.

---

## 4. Frontend State Management (Zustand Store)

The 3D editor uses a Zustand store ([src/store/editorStore.ts](file:///d:/Animation-Project/Animation-project/src/store/editorStore.ts)) with the following shape:

```typescript
interface KeyframeData {
  id: string;
  type?: 'default' | 'model' | 'cube' | 'sphere' | 'cylinder';
  url?: string;                          // For imported models (.glb/.gltf)
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

type TransformMode = 'translate' | 'rotate' | 'scale' | 'sculpt';

interface EditorState {
  keyframes: KeyframeData[];             // All objects in the scene
  selectedId: string | null;             // Currently selected object
  transformMode: TransformMode;          // Active gizmo mode
  addKeyframe: (kf: KeyframeData) => void;
  updateKeyframe: (id: string, updates: Partial<KeyframeData>) => void;
  removeKeyframe: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
}
```

> [!IMPORTANT]
> This is the **exact data shape** that the backend needs to persist when saving/loading projects. The `keyframes` array IS the scene state.

---

## 5. Frontend File Structure

```
src/
├── App.tsx                          # Main router (switch-based, not React Router)
├── main.tsx                         # Entry point
├── index.css                        # Global styles + Tailwind
├── App.css                          # Additional styles
├── pages/
│   ├── Home.tsx                     # Landing page with hero carousel
│   ├── Products.tsx                 # Product showcase with upload areas
│   ├── Editor.tsx                   # Full 3D editor interface
│   ├── Docs.tsx                     # Documentation with visual guides
│   ├── News.tsx                     # Blog / news articles
│   ├── SignIn.tsx                   # Login form
│   └── SignUp.tsx                   # Registration form
├── components/
│   ├── Footer.tsx                   # Global footer
│   ├── Navbar.tsx                   # Legacy navbar (unused)
│   ├── ai-image-generator-hero.tsx  # Hero section component
│   ├── ui/
│   │   └── tubelight-navbar.tsx     # Active animated navbar
│   └── editor/
│       ├── EditorCanvas.tsx         # R3F Canvas with scene setup
│       ├── KeyframeObject.tsx       # Individual 3D object renderer
│       └── KeyboardShortcuts.tsx    # Hotkey bindings
├── store/
│   └── editorStore.ts              # Zustand global state
└── lib/
    └── utils.ts                     # Utility functions (cn, etc.)
```

---

## 6. What the Backend Needs to Provide

### 6.1 User Authentication
The frontend already has Sign In and Sign Up forms. The backend must provide:

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register` | `POST` | Create user (name, email, password) |
| `/api/auth/login` | `POST` | Authenticate, return JWT |
| `/api/auth/me` | `GET` | Get current user profile (protected) |

- The forms collect: **Full Name**, **Email**, **Password**
- Social login buttons exist (Google, GitHub) — implement OAuth if desired, or stub them.
- Use **JWT** for session tokens and **bcrypt** for password hashing.

### 6.2 Project/Scene Management (3D Editor Persistence)

| Endpoint | Method | Description |
|---|---|---|
| `/api/projects` | `POST` | Create a new project |
| `/api/projects` | `GET` | List all projects for the authenticated user |
| `/api/projects/:id` | `GET` | Fetch a single project (returns scene JSON) |
| `/api/projects/:id` | `PUT` | Save/update project (auto-save the Zustand store) |
| `/api/projects/:id` | `DELETE` | Delete a project |

**Project payload shape:**
```json
{
  "id": "uuid",
  "name": "My Scene",
  "userId": "user-uuid",
  "sceneData": {
    "keyframes": [
      {
        "id": "cube-1710000000",
        "type": "cube",
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      }
    ],
    "sunPosition": [5, 10, 5],
    "sunIntensity": 1.5,
    "sunColor": "#ffffff"
  },
  "createdAt": "2026-03-13T00:00:00Z",
  "updatedAt": "2026-03-13T00:00:00Z"
}
```

### 6.3 News / Blog System

| Endpoint | Method | Description |
|---|---|---|
| `/api/news` | `GET` | Paginated list of articles (with category filter) |
| `/api/news/:slug` | `GET` | Single article by slug |
| `/api/news` | `POST` | Create article (admin only) |

**Article shape:**
```json
{
  "title": "Introducing Temporal Engine v2.0",
  "slug": "temporal-engine-v2",
  "excerpt": "Our most significant update yet...",
  "content": "Full markdown body...",
  "category": "Product",
  "author": "Engineering Team",
  "image": "https://...",
  "featured": true,
  "date": "2026-10-12"
}
```

### 6.4 Newsletter Subscription (Optional)

| Endpoint | Method | Description |
|---|---|---|
| `/api/newsletter/subscribe` | `POST` | Save email for newsletter |

---

## 7. Recommended Tech Stack for Backend

| Component | Recommendation |
|---|---|
| Runtime | Node.js with TypeScript |
| Framework | Express.js |
| Database | MongoDB with Mongoose (ideal for JSON-heavy scene data) |
| Auth | JWT + bcrypt |
| Validation | Zod |
| Security | helmet, cors, rate-limiting |
| File uploads | multer (for future model uploads) |

---

## 8. Architecture Guidelines

1. **Folder Structure**: Use `controllers/`, `services/`, `routes/`, `models/`, `middleware/` separation.
2. **Error Handling**: Global error middleware returning `{ success: false, error: 'message' }`.
3. **CORS**: Configure to allow the Vite dev server origin (`http://localhost:5173`).
4. **Environment Variables**: Provide a `.env.example` with `DATABASE_URI`, `JWT_SECRET`, `PORT`, `FRONTEND_URL`.

---

## 9. Summary of What's Been Built (Frontend)

| Feature | Status |
|---|---|
| Animated navbar with page routing | ✅ Done |
| Home page with hero carousel | ✅ Done |
| Products page with upload UI | ✅ Done |
| 3D Editor (spawn, transform, sculpt, lighting, export) | ✅ Done |
| Documentation page with visual guides | ✅ Done |
| News/Blog page with categories and newsletter | ✅ Done |
| Sign In page (email + social) | ✅ Done |
| Sign Up page (name + email + social) | ✅ Done |
| Global footer | ✅ Done |
| Backend API | ❌ Not started |
| Database & Auth integration | ❌ Not started |
| Frontend ↔ Backend wiring | ❌ Not started |
