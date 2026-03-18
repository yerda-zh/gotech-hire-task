# GoTech Chat — Engineering Fix Write-Up

---

## Security

### 1. MD5 Password Hashing → bcrypt
**File:** `backend/src/auth/auth.service.ts`

**Problem:** Passwords were hashed using MD5 via Node's built-in `crypto` module. MD5 is
cryptographically broken for password storage — it is extremely fast, which allows attackers
to brute-force billions of password combinations per second using commodity hardware or
rainbow tables.

**Fix:** Replaced MD5 with bcrypt (10 salt rounds). bcrypt is intentionally slow and
computationally expensive, making brute-force attacks impractical. Also removed the
commented-out bcrypt implementation that was left alongside the broken one.

**Note:** Because bcrypt generates a different hash each time, the login query was also
refactored — instead of querying by `{ username, password }`, we now fetch the user by
username first, then use `bcrypt.compare()` to verify the password against the stored hash.

---

### 2. Hardcoded JWT Secret in Source Code
**File:** `backend/src/auth/auth.service.ts`

**Problem:** The JWT signing secret was hardcoded as `'supersecret'` directly in source
code with a TODO comment. Anyone with access to the repository can forge JWT tokens and
impersonate any user.

**Fix:** Replaced with `process.env.JWT_SECRET`, which reads the value from the environment
at runtime. The secret itself is stored in `.env` (excluded from git via `.gitignore`) and
generated using `crypto.randomBytes(32)`.

---

### 3. Hardcoded JWT Secret in Docker Compose
**File:** `docker-compose.yml`

**Problem:** `JWT_SECRET` was intentionally omitted from the backend container's environment
block. This meant `process.env.JWT_SECRET` would resolve to `undefined` at runtime inside
the container — silently breaking authentication even after fixing the source code.

**Fix:** Added `JWT_SECRET: ${JWT_SECRET}` to the backend service's environment block.
Docker Compose reads this value from the `.env` file at startup and injects it into the
container.

---

### 4. Third Hardcoded JWT Secret in Chat Controller
**File:** `backend/src/chat/chat.controller.ts`

**Problem:** A third occurrence of the hardcoded `'supersecret'` string was found in the
controller, where JWT was being manually verified outside of the auth guard.

**Fix:** Removed manual JWT parsing entirely from the controller. Authentication is now
handled exclusively by `JwtAuthGuard`, which uses `authService.verifyToken()` — a single
source of truth for token verification.

---

### 5. Exposed Password Hashes via GET /users
**File:** `backend/src/app.controller.ts`

**Problem:** A `GET /users` endpoint returned every user record including password hashes
to any authenticated caller. It accessed the repository directly via bracket notation
(`this.chatService['userRepository'].find()`) to bypass TypeScript's access modifiers —
a major security and architecture violation.

**Fix:** Deleted the endpoint entirely. There is no legitimate reason for a chat API to
expose a full user list with password data.

---

### 6. WebSocket Trusts Client-Supplied Identity
**File:** `backend/src/chat/chat.gateway.ts`

**Problem:** The `sendMessage` handler destructured `userId` and `senderName` directly
from the client-supplied payload. Any client could impersonate any user by sending an
arbitrary `userId` and `senderName` in the message body.

**Fix:** Removed `userId` and `senderName` from the accepted payload entirely. On
connection, the JWT is verified server-side and the decoded `userId` and `username` are
stored in `client.data`. All subsequent handlers read identity from `client.data`, which
the client cannot tamper with.

---

### 7. No Authentication on WebSocket Connection
**File:** `backend/src/chat/chat.gateway.ts`

**Problem:** `handleConnection` performed no authentication check — any client could
establish a WebSocket connection without a valid JWT.

**Fix:** `handleConnection` now reads the token from `client.handshake.auth.token`,
verifies it via `authService.verifyToken()`, and calls `client.disconnect()` immediately
if the token is missing or invalid.

---

### 8. No Auth Guards on HTTP Routes
**File:** `backend/src/chat/chat.controller.ts`

**Problem:** All chat routes were completely unprotected — no `@UseGuards()` decorator
was applied, meaning unauthenticated users could freely access room lists and message
history.

**Fix:** Added `@UseGuards(JwtAuthGuard)` at the controller class level, protecting all
routes automatically.

---

### 9. Magic Default userId in Controller
**File:** `backend/src/chat/chat.controller.ts`

**Problem:** When JWT verification failed or no token was provided, the controller silently
fell back to `userId = 1`, meaning requests would proceed as a real user with no error.

**Fix:** Removed the fallback entirely. `JwtAuthGuard` now rejects unauthenticated requests
with a 401 before they reach the controller.

---

### 10. Weak `.env.example` Placeholder
**File:** `.env.example`

**Problem:** The placeholder value `change-me-in-production` was ambiguous and could be
left as-is by a developer setting up the project for the first time.

**Fix:** Updated to `replace-with-a-secure-random-value` to make the intent unambiguous.

---

### 11. console.log Leaking PII in Auth Paths
**File:** `backend/src/auth/auth.service.ts`

**Problem:** `console.log` statements were logging usernames on every registration and
login, leaking personally identifiable information into server logs.

**Fix:** Removed all `console.log` calls from production code paths.

---

## Architecture

### 12. Flat Module Structure
**File:** `backend/src/app.module.ts`

**Problem:** All providers, controllers, entities, and gateways were registered in a
single flat `AppModule`. NestJS is explicitly designed around feature modules — this
structure made the codebase impossible to scale and violated separation of concerns.

**Fix:** Extracted two feature modules:
- `AuthModule` — owns `AuthService`, `AuthController`, `JwtAuthGuard`, and `User` entity
- `ChatModule` — owns `ChatService`, `ChatController`, `ChatGateway`, and `Room`/`Message` entities

`AppModule` now only imports these two feature modules and configures the database
connection. `AuthModule` exports `AuthService` and `JwtAuthGuard` so `ChatModule` can
use them without re-declaring them.

---

### 13. Hardcoded Database Credentials
**File:** `backend/src/app.module.ts`

**Problem:** Database host, username, password, and name were hardcoded directly in
`app.module.ts`. These values should never appear in source code.

**Fix:** Replaced all hardcoded values with `process.env.*` variables with safe local
fallbacks. Used `??` instead of `||` for the fallback operator to avoid incorrectly
substituting falsy-but-valid values like `'0'`.

---

### 14. Business Logic in Controller
**File:** `backend/src/app.controller.ts` → `backend/src/auth/auth.controller.ts`

**Problem:** Input validation logic (`username.length < 3`) was hardcoded directly in the
controller. Controllers should only handle HTTP input/output — validation and business
rules belong in services or DTOs.

**Fix:** Moved validation to throw proper NestJS exceptions (`BadRequestException`,
`UnauthorizedException`) which return correct HTTP status codes (400/401) instead of
always returning 200 with an error body.

---

### 15. JWT Parsing Logic in Controller
**File:** `backend/src/chat/chat.controller.ts`

**Problem:** The controller was manually parsing and verifying JWTs — a cross-cutting
concern that belongs in a guard, not a controller.

**Fix:** Created `JwtAuthGuard` which handles all token verification centrally. The
controller now simply reads `req.user` which the guard populates after verification.

---

### 16. senderName Stored from Client Input
**File:** `backend/src/chat/entities/message.entity.ts`

**Problem:** The `Message` entity had a `senderName` column that stored a value supplied
by the client — tying the data model to an untrusted input.

**Fix:** Removed the `senderName` column entirely. Username is now resolved server-side
via the JOIN query in `getMessages()`.

---

### 17. Missing TypeORM Relations on Message Entity
**File:** `backend/src/chat/entities/message.entity.ts`

**Problem:** `room_id` and `user_id` were plain `@Column()` integers with no TypeORM
relation definitions. This prevented JOIN queries and forced the N+1 pattern.

**Fix:** Added proper `@ManyToOne` relations with `@JoinColumn` on both `roomId` and
`userId`, enabling efficient JOIN queries in `chat.service.ts`.

---

### 18. Removed Dead Code
**Files:** `backend/src/auth/auth.service.ts`, `backend/src/chat/chat.service.ts`

**Problem:** Two unfinished stubs existed — `refreshToken()` and `getActiveUsers()` —
both returning empty/null values and never called from anywhere.

**Fix:** Deleted both. Noted in comments that `refreshToken` would require persistent
token storage and a dedicated endpoint if implemented properly.

---

## Performance

### 19. N+1 Query Problem in getMessages
**File:** `backend/src/chat/chat.service.ts`

**Problem:** `getMessages()` first fetched all messages, then fired one additional query
per message to look up the sender's username. For a room with 100 messages this meant
101 database queries per request.

**Fix:** Replaced the loop with a single `QueryBuilder` query using `leftJoinAndSelect`
to fetch messages and their associated user in one query.

---

### 20. No Pagination on Message History
**Files:** `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.controller.ts`

**Problem:** `getMessages()` returned every message ever sent in a room in a single query
with no limit. This would cause severe performance degradation as message counts grow.

**Fix:** Added `page` and `limit` query parameters (defaulting to page 1, 50 messages).
`getMessages()` now returns a `PaginatedMessages` object containing `data`, `total`,
`page`, and `limit` fields. TypeORM's `.skip()` and `.take()` handle the pagination at
the database level.

---

### 21. No Indexes on Foreign Key Columns
**File:** `backend/src/chat/entities/message.entity.ts`

**Problem:** `roomId` and `userId` columns had no database indexes. Every message query
filtered by `roomId` — without an index this requires a full table scan on every request.

**Fix:** Added `@Index()` decorator to both `roomId` and `userId` columns. Also added
`@Index()` to `createdBy` on the `Room` entity.

---

## Code Quality

### 22. Mixed snake_case and camelCase in Entities
**File:** `backend/src/chat/entities/message.entity.ts`

**Problem:** `room_id` and `user_id` used `snake_case` while `senderName` and `createdAt`
used `camelCase` in the same entity — inconsistent naming within a single class.

**Fix:** Normalized all properties to `camelCase` (`roomId`, `userId`) throughout the
entity and all files that reference them.

---

### 23. any Types Throughout Codebase
**Files:** Multiple

**Problem:** `any` was used extensively for function parameters, return types, and
destructured values — defeating the purpose of TypeScript entirely.

**Fix:** Replaced all `any` with proper interfaces and types. Created `chat.types.ts`
to house shared types (`PaginatedMessages`, `MessageWithUsername`) used across
`chat.service.ts` and `chat.controller.ts`.

---

### 24. Magic Strings and Magic Numbers
**Files:** `backend/src/chat/chat.gateway.ts`, `backend/src/chat/chat.controller.ts`

**Problem:** The room key prefix `'room_'` was duplicated 3 times in the gateway. The
default `userId = 1` was a magic number with no explanation.

**Fix:** Extracted `'room_'` into a `ROOM_PREFIX` constant. Removed the magic default
userId entirely.

---

### 25. Commented-out Dead Code
**File:** `backend/src/auth/auth.service.ts`

**Problem:** A commented-out bcrypt implementation was left alongside its MD5 replacement,
and a `refreshToken` stub was left as a comment.

**Fix:** Removed all commented-out code blocks. Active code should speak for itself.

---

### 26. Class Component in React Codebase
**File:** `frontend/src/class-components/Header.class.tsx`

**Problem:** The codebase uses functional components throughout, but one component was
written as a class component — an outdated pattern that React has moved away from since
hooks were introduced in React 16.8.

**Fix:** To be addressed in the frontend section.

---

### 27. Loose TypeScript Configuration
**File:** `backend/tsconfig.json`

**Problem:** Several strict TypeScript checks were deliberately disabled:
`noImplicitAny`, `strictNullChecks`, `strictBindCallApply`,
`forceConsistentCasingInFileNames`. This allowed sloppy typing to go undetected.
Additionally `baseUrl` was set (deprecated in TS 6.0) and `rootDir` was missing.

**Fix:** Enabled all strict checks, removed deprecated `baseUrl`, added explicit
`rootDir: "./src"`. The resulting compiler errors surfaced additional typing issues
which were fixed file by file.

---

### 28. ValidationPipe Never Registered
**File:** `backend/src/main.ts`

**Problem:** The comment explicitly stated "ValidationPipe intentionally not added" —
meaning all DTO decorators (`@IsString`, `@MinLength`, etc.) were completely inactive.
Controllers used `body: any` instead of DTOs, so no incoming request data was ever
validated.

**Fix:** Added `ValidationPipe` globally in `main.ts` with three options:
- `whitelist: true` — strips unknown properties from request bodies
- `forbidNonWhitelisted: true` — throws 400 if unexpected fields are sent
- `transform: true` — auto-converts plain objects into typed DTO instances

---

### 29. CORS Allows All Origins
**File:** `backend/src/main.ts`

**Problem:** `app.enableCors({ origin: '*' })` allows any website to make requests to
the API. In production this opens the door to cross-origin attacks.

**Fix:** Replaced with `process.env.CORS_ORIGIN ?? 'http://localhost:5173'` so the
allowed origin is configurable per environment. Added `CORS_ORIGIN` to `.env`.

---

### 30. console.log in main.ts
**File:** `backend/src/main.ts`

**Problem:** `console.log('Server running on port 3000')` was left in the production
bootstrap path.

**Fix:** Removed entirely.

---

### 31. DTOs Defined but Never Used
**Files:** `backend/src/auth/dto/create-user.dto.ts`,
`backend/src/chat/dto/send-message.dto.ts`

**Problem:** Both DTOs had proper `class-validator` decorators but were never referenced
in any controller — all controllers used `body: any` instead. Without `ValidationPipe`
and actual DTO usage, the decorators did nothing.

**Fix:** Wired both DTOs into their respective controllers. `CreateUserDto` is now used
in `auth.controller.ts`, replacing the inline interface. The manual `username.length < 3`
check was also removed — `@MinLength(3)` on the DTO handles it automatically via
`ValidationPipe`.

---

### 32. userId in SendMessageDto
**File:** `backend/src/chat/dto/send-message.dto.ts`

**Problem:** `SendMessageDto` included a `userId` field, meaning the client was expected
to supply their own identity in the message body. This directly contradicted the WebSocket
trust fix — having it in the DTO would re-open the client impersonation vulnerability.

**Fix:** Removed `userId` from the DTO entirely. The server resolves the sender's identity
exclusively from the verified JWT stored in `client.data`.

---

### 33. CreateUserDto in Wrong Feature Folder
**File:** `backend/src/chat/dto/create-user.dto.ts`

**Problem:** `CreateUserDto` was placed inside the `chat/dto/` folder despite being
exclusively used for authentication — a registration and login concern.

**Fix:** Moved to `backend/src/auth/dto/create-user.dto.ts` to keep it co-located with
the auth feature module.

## Frontend

### 34. XSS Vulnerability via dangerouslySetInnerHTML
**File:** `frontend/src/components/MessageItem.tsx`

**Problem:** Message content was rendered using `dangerouslySetInnerHTML={{ __html: message.content }}`.
This allowed any user to send a message containing arbitrary HTML or JavaScript — for example
`<img src=x onerror="alert('XSS')">` — which would execute in other users' browsers.

**Fix:** Replaced with `{message.content}` — React's default text rendering automatically
escapes HTML entities, making script injection impossible.

---

### 35. WebSocket Client Supplied userId and senderName
**File:** `frontend/src/components/ChatPage.tsx`

**Problem:** The `sendMessage` emit included `userId` and `senderName` from client-side
state. Any user could modify these values in DevTools and impersonate another user.

**Fix:** Removed both fields from the emit payload entirely. The server now reads identity
exclusively from the verified JWT stored in `client.data`.

---

### 36. Socket Recreated on Every Render
**File:** `frontend/src/App.tsx`

**Problem:** `const socket = io('http://localhost:3000')` was called directly in the
component body — meaning a new WebSocket connection was created on every render cycle,
causing connection leaks and unpredictable behavior.

**Fix:** Moved socket initialization into `useRef` so it is created once and persists
across renders. The socket is initialized synchronously when a token exists (page refresh
case) or immediately on login. It is disconnected and nulled on logout.

---

### 37. Socket Auth Token Not Passed on Connection
**File:** `frontend/src/App.tsx`

**Problem:** The original socket connection passed no authentication credentials, meaning
the gateway had no way to verify the connecting client.

**Fix:** Added `auth: { token }` to the socket options — the gateway now reads this in
`handleConnection` and disconnects any client that provides an invalid or missing token.

---

### 38. Re-fetch All Messages on Every WebSocket Event
**File:** `frontend/src/components/ChatPage.tsx`

**Problem:** The `newMessage` socket handler called `fetchMessages(selectedRoom.id)` on
every incoming message — discarding the existing message list and re-fetching everything
from the server. This caused unnecessary API calls and a stale closure bug since
`selectedRoom` was not in the `useEffect` dependency array.

**Fix:** Replaced with `setMessages(prev => [...prev, message])` — the new message is
appended directly to existing state with no API call required.

---

### 39. No Socket Cleanup — Memory Leak
**File:** `frontend/src/components/ChatPage.tsx`

**Problem:** The `useEffect` registered `connect`, `disconnect`, and `newMessage` handlers
but never called `socket.off()` in the cleanup function. This caused handlers to
accumulate on every render, firing multiple times per event.

**Fix:** Added a cleanup function returning `socket.off()` for all three handlers,
preventing memory leaks and duplicate event firing.

---

### 40. Prop Drilling Through 4-5 Component Levels
**Files:** `frontend/src/App.tsx`, `frontend/src/components/ChatPage.tsx`,
`frontend/src/components/RoomList.tsx`, `frontend/src/components/MessageItem.tsx`

**Problem:** `token`, `userId`, `socket`, and `apiUrl` were passed from `App` → `ChatPage`
→ `RoomList` → `MessageItem` even though middle components never used them — they only
passed them further down.

**Fix:** Created `AuthContext` with a `useAuth()` hook that provides `token`, `userId`,
and `username` to any component that needs them directly. `RoomList` and `MessageItem`
now only receive the props they actually use. `socket` is passed only to `ChatPage` which
is the only component that needs it.

---

### 41. fetchCurrentUser Called Deleted Endpoint
**File:** `frontend/src/components/ChatPage.tsx`

**Problem:** `fetchCurrentUser()` called `GET /users` to find the current user's username
by scanning the full user list — an endpoint we deleted for exposing password hashes.
Even before deletion, fetching all users just to find one was extremely inefficient.

**Fix:** Removed `fetchCurrentUser` entirely. Username is now decoded directly from the
JWT payload client-side via `getUsernameFromToken()` in `App.tsx` and provided through
`AuthContext` — zero API calls needed.

---

### 42. Hardcoded API URL in 4 Files
**Files:** `frontend/src/App.tsx`, `frontend/src/components/LoginPage.tsx`,
`frontend/src/components/RegisterPage.tsx`, `frontend/src/components/ChatPage.tsx`

**Problem:** `http://localhost:3000` was hardcoded in four separate files. Changing the
API URL would require finding and updating every occurrence.

**Fix:** Extracted to `frontend/src/constants.ts` as `export const API_URL`. All
components now import from this single source of truth.

---

### 43. Class Component in Functional Codebase
**File:** `frontend/src/class-components/Header.class.tsx`

**Problem:** `Header` was implemented as a class component using `Component<Props, State>`
with `componentDidUpdate` lifecycle method — an outdated pattern that React has moved away
from since hooks were introduced in 16.8. It also used magic numbers (`status === 2` for
connected, `status === 1` for disconnected) stored in local state unnecessarily.

**Fix:** Converted to a functional component. The `status` state was removed entirely —
`isConnected` boolean prop is used directly. Username is now read from `AuthContext` via
`useAuth()` instead of being passed as a prop, reducing the prop surface.

---

### 44. Array Index Used as React List Key
**File:** `frontend/src/components/ChatPage.tsx`

**Problem:** `messages.map((msg, index) => <MessageItem key={index} ...>)` used the
array index as the key. This causes React to incorrectly reuse DOM nodes when messages
are inserted or removed, leading to rendering bugs.

**Fix:** Replaced with `key={msg.id}` — stable unique IDs from the database ensure
correct DOM reconciliation.

---

### 45. Missing Error Handling and Loading States
**Files:** `frontend/src/components/LoginPage.tsx`,
`frontend/src/components/RegisterPage.tsx`

**Problem:** Both forms had no `try/catch`, no loading state, and no error display.
Network failures silently did nothing, and users had no feedback while requests were
in flight.

**Fix:** Added `error` and `loading` state to both components. Errors from the server
(like "password too short") are displayed inline below the form title. The submit button
is disabled and shows a loading label while the request is in flight.

---

### 46. Missing Space in JWT Bearer Token Parsing
**File:** `backend/src/auth/jwt-auth.guard.ts`

**Problem:** `auth.replace('Bearer', '')` was missing the trailing space, leaving a
leading space on the extracted token string. This caused `jwt.verify()` to fail on every
request, making `JwtAuthGuard` reject all valid tokens with a 401.

**Fix:** Corrected to `auth.replace('Bearer ', '')` — a single character fix that made
all protected routes functional.

### 47. ChatPage Exceeded 400 Lines With Mixed Responsibilities
**File:** `frontend/src/components/ChatPage.tsx`

**Problem:** ChatPage handled room creation, message input, WebSocket events, data
fetching, and layout all in one component — violating the single responsibility principle
and making the component difficult to maintain.

**Fix:** Extracted two focused components:
- `CreateRoom.tsx` — owns room creation form state and the POST request
- `MessageInput.tsx` — owns message input state and the sendMessage emit

`ChatPage` is now reduced to layout, data fetching, and WebSocket event coordination.
`CreateRoom` reads `token` directly from `AuthContext` rather than receiving it as a prop.