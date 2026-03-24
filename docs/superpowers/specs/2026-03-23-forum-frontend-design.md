# Forum Frontend (Phase 3)

**Date:** 2026-03-23
**Phase:** 3 of 4 (Phase 1: Library — complete, Phase 2: API — complete)

## Overview

Build the frontend pages and components for the community forum. Public read, authenticated write. Tiptap WYSIWYG editor for posting. Inline moderation controls for Moderator+ roles.

## Routes

All inside `<Layout>`. Public routes have no `<ProtectedRoute>` wrapper (same pattern as server status). The new-thread route requires auth.

| Route | Page | Auth |
|-------|------|------|
| `/forum` | ForumCategoryListPage | Public |
| `/forum/:categorySlug` | ForumThreadListPage | Public |
| `/forum/:categorySlug/:threadSlug` | ForumThreadPage | Public |
| `/forum/:categorySlug/new` | ForumNewThreadPage | `<ProtectedRoute>` |

## Sidebar Navigation

Add a "Community" section to `Layout.tsx` after the "Server" section. Add `MessageSquare` to the Lucide import.

```
Community (SidebarSection, MessageSquare icon)
  → Forum (MessageSquare icon)
```

Update `getSection()` to return `'community'` for paths starting with `/forum`. Add `'community'` to the `SectionName` type.

## Backend Change: Enrich Thread Detail Response

The `GET /api/forum/categories/{categorySlug}/threads/{threadSlug}` endpoint currently returns `ThreadDetailResponse` without author info. The `ForumController` needs a small update: after fetching the thread detail, call `IForumAuthorResolver` and return an enriched response with `authorUsername` and `authorAvatarHash`. This is a minor Phase 2 patch required for the thread page header to display the author.

## Moderator Role Check Pattern

Use a helper function for consistency across all components:

```typescript
function isModerator(user: UserProfile | null): boolean {
  return user?.role === 'Moderator' || user?.role === 'Admin'
}
```

This is defined once (in a shared location or inline in each page) and used wherever moderator UI is conditionally shown.

## Relative Time Utility

Multiple components need relative time formatting ("2h ago", "3d ago"). Add a `timeAgo(dateStr: string): string` utility function (same pattern as the one in `RecentIncidents.tsx`). Define in a shared location (e.g., `src/utils/timeAgo.ts` or inline).

## Pages

### ForumCategoryListPage (`/forum`)

Card grid layout (2 columns on desktop via `grid-cols-2`, stacks on mobile). Each card shows category name, description, thread count, and last activity timestamp.

Moderators see a "Manage Categories" section at the top — a simple form to create categories, and edit/delete buttons on each card.

**States:** Loading spinner while fetching. Empty state: "No categories yet" (moderators see the create form). Error: inline error message.

### ForumThreadListPage (`/forum/:categorySlug`)

- Header: category name, description, "New Thread" button (authenticated users; unauthenticated see a login prompt button)
- Breadcrumb: `Forum > {Category Name}`
- Thread rows: compact single-line rows. Each shows:
  - Pin icon (📌) if pinned — pinned rows get `border-blue-900/50` subtle highlight
  - Title (clickable, navigates to thread)
  - Author avatar + username (small)
  - Reply count badge
  - Vote count badge (total votes across all posts in thread)
  - Last activity timestamp (relative, e.g., "2h ago")
- Pinned threads at top, then non-pinned sorted by last activity desc
- Moderator controls: pin/lock toggle buttons on each row
- Cursor-based pagination via "Load more" button at bottom

**States:** Loading spinner. Empty state: "No threads yet — be the first to start a discussion!" Error: inline error.

### ForumThreadPage (`/forum/:categorySlug/:threadSlug`)

- Breadcrumb: `Forum > {Category Name} > {Thread Title}`
- Thread title + author avatar + username + created date + pin/lock status
- Moderator controls in header: pin/lock toggle buttons
- Posts in chronological order, each rendered by `ForumPost` component
- Reply box at bottom:
  - Authenticated: `ForumReplyBox` with Tiptap editor + submit
  - Unauthenticated: "Sign in to reply" prompt
  - Locked thread: "This thread is locked" notice (no reply box)
- Cursor-based pagination via "Load more" button at bottom for next page

**States:** Loading spinner. Error: inline error.

### ForumNewThreadPage (`/forum/:categorySlug/new`)

- Requires authentication — wrapped in `<ProtectedRoute>`
- Breadcrumb: `Forum > {Category Name} > New Thread`
- Title input (max 200 chars)
- Tiptap editor for body
- Submit button → calls `POST /api/forum/categories/{slug}/threads` → navigates to the new thread on success (uses `categorySlug` and returned `slug` from the `ThreadDetailResponse` to build the URL)
- Cancel link → back to thread list

## Components

### ForumCategoryCard

Props: `CategoryResponse` + optional `onEdit`/`onDelete` callbacks (Moderator only)

Card with dark theme styling: `rounded-lg border border-gray-800 bg-gray-900 p-4`. Shows name (heading), description (gray text), thread count, last activity (relative time). Clickable — navigates to `/forum/:slug`. Moderators see small edit/delete icons in the card corner.

### ForumCategoryManager

Visible to Moderator+ only (use `isModerator()` check). A collapsible form at the top of the category list. Create: name input + description textarea + display order number + submit. Edit: same form, pre-filled, triggered by edit button on card. Delete: confirmation prompt.

### ForumThreadRow

Props: `EnrichedThreadSummaryResponse` + optional mod callbacks

Single row: `flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/30`. Pin icon, title (truncate on small screens), author avatar + username, reply count, vote count, relative time. Pinned rows get highlighted border.

Moderator controls: small pin/lock toggle buttons at the end of the row.

### ForumPost

Props: `EnrichedPostResponse` + `isAuthor: boolean` + `isModerator: boolean` + callbacks

Card layout:
- Left column: `ForumAuthorBadge` (avatar, username, post count, join date)
- Right column: post body (rendered HTML via Tiptap read-only), edit/delete actions, vote button
- Deleted posts: show "[This post has been deleted]" placeholder, gray italic
- Edited posts: show "edited" indicator with timestamp
- Edit mode: inline Tiptap editor replacing the post body, save/cancel buttons

### ForumAuthorBadge

Props: username, postCount, joinedAt

Vertical badge: `UserAvatar` component (using existing initials-based avatar from username — `avatarHash` is not used in this phase since `UserAvatar` only supports username), username below, then small gray text for post count and join date.

### ForumVoteButton

Props: voteCount, userVoted, onVote, disabled (for unauthenticated)

Upward arrow icon (`ChevronUp` from Lucide) + count. When voted: blue fill. When not voted: gray outline. Click calls `POST /api/forum/posts/{postId}/vote` and uses optimistic update (immediately toggle UI, revert on error). Unauthenticated users see a tooltip "Sign in to vote" on hover.

### ForumEditor

Tiptap wrapper component. Props: `content` (initial value), `onChange`, `placeholder`, `editable`.

Tiptap extensions:
- `StarterKit` (includes bold, italic, strike, code, headings H1-H3, bullet list, ordered list, blockquote, code block, horizontal rule)
- `Link` (with URL input)
- `Placeholder` (configurable text)

Toolbar with icon buttons for: Bold, Italic, Strike, Code, H2, H3, Bullet List, Ordered List, Blockquote, Code Block, Link, Undo, Redo.

Output: HTML string. The API stores HTML as the post body. Posts are rendered using Tiptap's read-only editor (safe — Tiptap sanitizes by default since it only renders known node types).

### ForumReplyBox

Props: threadId, onPostCreated

Contains `ForumEditor` + submit button. On submit, calls `POST /api/forum/threads/{threadId}/posts` with the editor's HTML content. Clears editor on success and calls `onPostCreated` callback.

## Pagination Details

**Thread list cursor:** The API uses `afterLastPostAtTicks` (long) + `afterId` (int). The frontend derives these from the last thread in the current list:
- `afterLastPostAtTicks`: convert `lastPostAt` ISO string to .NET ticks via `(new Date(lastPostAt).getTime() * 10000) + 621355968000000000`
- `afterId`: the thread's `id`

**Post list cursor:** The API uses `afterId` (long). The frontend passes the last post's `id`.

Both responses include `hasMore: boolean` — show "Load more" button only when true.

## TypeScript Types

Add to `src/Vanalytics.Web/src/types/api.ts`:

```typescript
// Forum
export interface CategoryResponse {
  id: number
  name: string
  slug: string
  description: string
  displayOrder: number
  threadCount: number
  lastActivityAt: string | null
}

export interface EnrichedThreadSummaryResponse {
  id: number
  title: string
  slug: string
  isPinned: boolean
  isLocked: boolean
  authorId: string
  replyCount: number
  voteCount: number
  createdAt: string
  lastPostAt: string
  authorUsername: string
  authorAvatarHash: string | null
}

export interface ThreadDetailResponse {
  id: number
  title: string
  slug: string
  categoryId: number
  categoryName: string
  categorySlug: string
  isPinned: boolean
  isLocked: boolean
  authorId: string
  createdAt: string
  lastPostAt: string
  authorUsername: string
  authorAvatarHash: string | null
}

export interface EnrichedPostResponse {
  id: number
  authorId: string
  body: string | null
  isEdited: boolean
  isDeleted: boolean
  voteCount: number
  currentUserVoted: boolean
  createdAt: string
  updatedAt: string | null
  authorUsername: string
  authorAvatarHash: string | null
  authorPostCount: number
  authorJoinedAt: string
}

export interface PaginatedThreads {
  threads: EnrichedThreadSummaryResponse[]
  hasMore: boolean
}

export interface PaginatedPosts {
  posts: EnrichedPostResponse[]
  hasMore: boolean
}
```

Note: `authorId` is `string` in TypeScript — the C# `Guid` serializes as a string in JSON.

## NPM Dependencies

Add to `package.json`:
- `@tiptap/react`
- `@tiptap/pm`
- `@tiptap/core`
- `@tiptap/starter-kit`
- `@tiptap/extension-link`
- `@tiptap/extension-placeholder`

## File Structure

```
src/Vanalytics.Web/src/
├── pages/
│   ├── ForumCategoryListPage.tsx
│   ├── ForumThreadListPage.tsx
│   ├── ForumThreadPage.tsx
│   └── ForumNewThreadPage.tsx
├── components/forum/
│   ├── ForumCategoryCard.tsx
│   ├── ForumCategoryManager.tsx
│   ├── ForumThreadRow.tsx
│   ├── ForumPost.tsx
│   ├── ForumAuthorBadge.tsx
│   ├── ForumVoteButton.tsx
│   ├── ForumEditor.tsx
│   └── ForumReplyBox.tsx
├── types/api.ts (modified — add forum types)
├── App.tsx (modified — add forum routes)
└── components/Layout.tsx (modified — add Community sidebar section)
```

## Routing Updates (App.tsx)

Add inside the `<Route element={<Layout />}>` block, in the public routes section (alongside server routes):

```tsx
{/* Public forum routes */}
<Route path="/forum" element={<ForumCategoryListPage />} />
<Route path="/forum/:categorySlug" element={<ForumThreadListPage />} />
<Route path="/forum/:categorySlug/new" element={<ProtectedRoute><ForumNewThreadPage /></ProtectedRoute>} />
<Route path="/forum/:categorySlug/:threadSlug" element={<ForumThreadPage />} />
```

The `new` route must come before the `:threadSlug` catch-all so React Router matches it first.

## Post Rendering Safety

Posts are stored as HTML (Tiptap output). For rendering, use Tiptap's read-only editor (`editable: false`) which only renders known ProseMirror node types — this is inherently safe against XSS since arbitrary HTML tags are not part of the schema. Do NOT use `dangerouslySetInnerHTML`.
