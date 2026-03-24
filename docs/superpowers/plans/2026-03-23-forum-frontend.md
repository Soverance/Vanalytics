# Forum Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React frontend for the community forum — 4 pages, 8 components, Tiptap WYSIWYG editor, routing, and sidebar navigation.

**Architecture:** Forum pages are public-read inside `<Layout>` (no ProtectedRoute except for new-thread). Components are in `components/forum/`. Tiptap provides WYSIWYG editing. The existing `api()` client handles all API calls with optional JWT auth. Post content is stored/rendered as HTML via Tiptap.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4.2, Tiptap, React Router 7, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-23-forum-frontend-design.md`

---

## File Structure

### New files
| Path | Responsibility |
|------|---------------|
| `src/Vanalytics.Web/src/components/forum/ForumEditor.tsx` | Tiptap WYSIWYG wrapper |
| `src/Vanalytics.Web/src/components/forum/ForumAuthorBadge.tsx` | Avatar + username + stats |
| `src/Vanalytics.Web/src/components/forum/ForumVoteButton.tsx` | Upvote toggle with count |
| `src/Vanalytics.Web/src/components/forum/ForumReplyBox.tsx` | Editor + submit for replies |
| `src/Vanalytics.Web/src/components/forum/ForumPost.tsx` | Single post card |
| `src/Vanalytics.Web/src/components/forum/ForumThreadRow.tsx` | Thread list row |
| `src/Vanalytics.Web/src/components/forum/ForumCategoryCard.tsx` | Category card |
| `src/Vanalytics.Web/src/components/forum/ForumCategoryManager.tsx` | Category CRUD for mods |
| `src/Vanalytics.Web/src/pages/ForumCategoryListPage.tsx` | Category list page |
| `src/Vanalytics.Web/src/pages/ForumThreadListPage.tsx` | Thread list page |
| `src/Vanalytics.Web/src/pages/ForumThreadPage.tsx` | Thread detail + posts page |
| `src/Vanalytics.Web/src/pages/ForumNewThreadPage.tsx` | New thread form |

### Modified files
| Path | Change |
|------|--------|
| `src/Vanalytics.Web/src/types/api.ts` | Add forum TypeScript types |
| `src/Vanalytics.Web/src/App.tsx` | Add forum routes + imports |
| `src/Vanalytics.Web/src/components/Layout.tsx` | Add Community sidebar section |
| `src/Vanalytics.Api/Controllers/ForumController.cs` | Enrich GetThread response with author info |
| `src/Vanalytics.Api/DTOs/ForumEnrichedDtos.cs` | Add EnrichedThreadDetailResponse |

---

## Task 1: NPM dependencies and TypeScript types

**Files:**
- Modify: `src/Vanalytics.Web/package.json`
- Modify: `src/Vanalytics.Web/src/types/api.ts`

- [ ] **Step 1: Install Tiptap packages**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npm install @tiptap/react @tiptap/pm @tiptap/core @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder`

- [ ] **Step 2: Add forum types to api.ts**

Add after the existing server types section (after `ServerIncident` interface):

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

- [ ] **Step 3: Verify frontend compiles**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

---

## Task 2: Backend patch — Enrich thread detail with author info

**Files:**
- Modify: `src/Vanalytics.Api/DTOs/ForumEnrichedDtos.cs`
- Modify: `src/Vanalytics.Api/Controllers/ForumController.cs`

- [ ] **Step 1: Add EnrichedThreadDetailResponse to DTOs**

Add to `src/Vanalytics.Api/DTOs/ForumEnrichedDtos.cs`:

```csharp
public record EnrichedThreadDetailResponse(
    int Id, string Title, string Slug, int CategoryId, string CategoryName, string CategorySlug,
    bool IsPinned, bool IsLocked, Guid AuthorId,
    DateTimeOffset CreatedAt, DateTimeOffset LastPostAt,
    string AuthorUsername, string? AuthorAvatarHash);
```

- [ ] **Step 2: Update GetThread endpoint in ForumController**

Replace the `GetThread` method (around line 67-72) with:

```csharp
    [HttpGet("categories/{categorySlug}/threads/{threadSlug}")]
    public async Task<IActionResult> GetThread(string categorySlug, string threadSlug)
    {
        var thread = await _forum.GetThreadBySlugAsync(categorySlug, threadSlug);
        if (thread == null) return NotFound();

        var authors = await _authors.ResolveAuthorsAsync([thread.AuthorId]);
        var author = authors.GetValueOrDefault(thread.AuthorId);

        return Ok(new EnrichedThreadDetailResponse(
            thread.Id, thread.Title, thread.Slug, thread.CategoryId, thread.CategoryName, thread.CategorySlug,
            thread.IsPinned, thread.IsLocked, thread.AuthorId,
            thread.CreatedAt, thread.LastPostAt,
            author?.Username ?? "[deleted]",
            author?.AvatarHash));
    }
```

- [ ] **Step 3: Verify backend builds**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build --no-restore`
Expected: Build succeeded

- [ ] **Step 4: Commit**

---

## Task 3: ForumEditor (Tiptap wrapper)

**Files:**
- Create: `src/Vanalytics.Web/src/components/forum/ForumEditor.tsx`

- [ ] **Step 1: Create the editor component**

```tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Strikethrough, Code, Heading2, Heading3,
  List, ListOrdered, Quote, CodeSquare, Link2, Undo2, Redo2
} from 'lucide-react'

interface Props {
  content?: string
  onChange?: (html: string) => void
  placeholder?: string
  editable?: boolean
}

function ToolbarButton({ onClick, active, children, title }: {
  onClick: () => void; active?: boolean; children: React.ReactNode; title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

export default function ForumEditor({ content = '', onChange, placeholder = 'Write something...', editable = true }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2',
      },
    },
  })

  if (!editor) return null

  if (!editable) {
    return <EditorContent editor={editor} />
  }

  const setLink = () => {
    const url = window.prompt('URL')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const iconSize = 'h-4 w-4'

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
      <div className="flex flex-wrap gap-0.5 border-b border-gray-700 p-1.5 bg-gray-900/50">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline Code">
          <Code className={iconSize} />
        </ToolbarButton>
        <div className="w-px bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 className={iconSize} />
        </ToolbarButton>
        <div className="w-px bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          <List className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
          <ListOrdered className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
          <Quote className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
          <CodeSquare className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Link">
          <Link2 className={iconSize} />
        </ToolbarButton>
        <div className="w-px bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo2 className={iconSize} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

---

## Task 4: Small reusable components (AuthorBadge, VoteButton, ReplyBox)

**Files:**
- Create: `src/Vanalytics.Web/src/components/forum/ForumAuthorBadge.tsx`
- Create: `src/Vanalytics.Web/src/components/forum/ForumVoteButton.tsx`
- Create: `src/Vanalytics.Web/src/components/forum/ForumReplyBox.tsx`

- [ ] **Step 1: Create ForumAuthorBadge**

```tsx
import UserAvatar from '../UserAvatar'

interface Props {
  username: string
  postCount: number
  joinedAt: string
}

export default function ForumAuthorBadge({ username, postCount, joinedAt }: Props) {
  return (
    <div className="flex flex-col items-center gap-1 w-24 shrink-0 py-2">
      <UserAvatar username={username} size="sm" />
      <span className="text-xs font-medium text-gray-300 truncate max-w-full">{username}</span>
      <span className="text-[10px] text-gray-600">{postCount} posts</span>
      <span className="text-[10px] text-gray-600">Joined {new Date(joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
    </div>
  )
}
```

- [ ] **Step 2: Create ForumVoteButton**

```tsx
import { useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { api } from '../../api/client'

interface Props {
  postId: number
  voteCount: number
  userVoted: boolean
  disabled?: boolean
}

export default function ForumVoteButton({ postId, voteCount: initialCount, userVoted: initialVoted, disabled }: Props) {
  const [count, setCount] = useState(initialCount)
  const [voted, setVoted] = useState(initialVoted)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (disabled || loading) return

    // Optimistic update
    const prevCount = count
    const prevVoted = voted
    setCount(voted ? count - 1 : count + 1)
    setVoted(!voted)

    try {
      setLoading(true)
      const result = await api<{ voteCount: number; userVoted: boolean }>(`/api/forum/posts/${postId}/vote`, { method: 'POST' })
      setCount(result.voteCount)
      setVoted(result.userVoted)
    } catch {
      // Revert on error
      setCount(prevCount)
      setVoted(prevVoted)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={disabled ? 'Sign in to vote' : voted ? 'Remove vote' : 'Upvote'}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
        voted
          ? 'bg-blue-900/50 text-blue-400 border border-blue-800/50'
          : 'text-gray-500 hover:text-gray-300 border border-transparent hover:border-gray-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <ChevronUp className={`h-3.5 w-3.5 ${voted ? 'text-blue-400' : ''}`} />
      <span>{count}</span>
    </button>
  )
}
```

- [ ] **Step 3: Create ForumReplyBox**

```tsx
import { useState } from 'react'
import { api } from '../../api/client'
import ForumEditor from './ForumEditor'

interface Props {
  threadId: number
  onPostCreated: () => void
}

export default function ForumReplyBox({ threadId, onPostCreated }: Props) {
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!body.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      await api(`/api/forum/threads/${threadId}/posts`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
      setBody('')
      onPostCreated()
    } catch {
      setError('Failed to post reply')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <ForumEditor content={body} onChange={setBody} placeholder="Write a reply..." />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={submit}
        disabled={loading || !body.trim()}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? 'Posting...' : 'Reply'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Verify all compile**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 5: Commit**

---

## Task 5: ForumPost and ForumThreadRow components

**Files:**
- Create: `src/Vanalytics.Web/src/components/forum/ForumPost.tsx`
- Create: `src/Vanalytics.Web/src/components/forum/ForumThreadRow.tsx`

- [ ] **Step 1: Create ForumPost**

```tsx
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import type { EnrichedPostResponse } from '../../types/api'
import ForumAuthorBadge from './ForumAuthorBadge'
import ForumVoteButton from './ForumVoteButton'
import ForumEditor from './ForumEditor'

interface Props {
  post: EnrichedPostResponse
  isAuthor: boolean
  isModerator: boolean
  isAuthenticated: boolean
  onUpdated: () => void
}

export default function ForumPost({ post, isAuthor, isModerator, isAuthenticated, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body ?? '')

  const canEdit = (isAuthor || isModerator) && !post.isDeleted
  const canDelete = (isAuthor || isModerator) && !post.isDeleted

  const saveEdit = async () => {
    if (!editBody.trim()) return
    const endpoint = isModerator && !isAuthor
      ? `/api/forum/posts/${post.id}/moderate`
      : `/api/forum/posts/${post.id}`
    await api(endpoint, { method: 'PUT', body: JSON.stringify({ body: editBody }) })
    setEditing(false)
    onUpdated()
  }

  const deletePost = async () => {
    if (!confirm('Delete this post?')) return
    const endpoint = isModerator && !isAuthor
      ? `/api/forum/posts/${post.id}/moderate`
      : `/api/forum/posts/${post.id}`
    await api(endpoint, { method: 'DELETE' })
    onUpdated()
  }

  if (post.isDeleted) {
    return (
      <div className="flex gap-4 rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
        <ForumAuthorBadge username={post.authorUsername} postCount={post.authorPostCount} joinedAt={post.authorJoinedAt} />
        <div className="flex-1">
          <p className="text-gray-600 italic text-sm">[This post has been deleted]</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <ForumAuthorBadge username={post.authorUsername} postCount={post.authorPostCount} joinedAt={post.authorJoinedAt} />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <ForumEditor content={editBody} onChange={setEditBody} />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">Save</button>
              <button onClick={() => setEditing(false)} className="rounded px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <ForumEditor content={post.body ?? ''} editable={false} />
            <div className="flex items-center gap-3 mt-3">
              <ForumVoteButton postId={post.id} voteCount={post.voteCount} userVoted={post.currentUserVoted} disabled={!isAuthenticated} />
              <span className="text-xs text-gray-600">{new Date(post.createdAt).toLocaleString()}</span>
              {post.isEdited && <span className="text-xs text-gray-600 italic">edited</span>}
              <div className="flex-1" />
              {canEdit && (
                <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-gray-300 p-1" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button onClick={deletePost} className="text-gray-600 hover:text-red-400 p-1" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ForumThreadRow**

```tsx
import { useNavigate } from 'react-router-dom'
import { Pin, Lock, LockOpen } from 'lucide-react'
import type { EnrichedThreadSummaryResponse } from '../../types/api'
import UserAvatar from '../UserAvatar'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  thread: EnrichedThreadSummaryResponse
  categorySlug: string
  isModerator: boolean
  onTogglePin?: (threadId: number) => void
  onToggleLock?: (threadId: number) => void
}

export default function ForumThreadRow({ thread, categorySlug, isModerator, onTogglePin, onToggleLock }: Props) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/forum/${categorySlug}/${thread.slug}`)}
      className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors ${
        thread.isPinned ? 'border-l-2 border-l-blue-600' : ''
      }`}
    >
      {thread.isPinned && <Pin className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
      {thread.isLocked && <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
      <span className="text-sm text-gray-200 truncate flex-1 font-medium">{thread.title}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <UserAvatar username={thread.authorUsername} size="sm" />
        <span className="text-xs text-gray-500 hidden sm:inline">{thread.authorUsername}</span>
      </div>
      <span className="text-xs text-gray-600 shrink-0 w-16 text-right">{thread.replyCount} replies</span>
      <span className="text-xs text-gray-600 shrink-0 w-14 text-right">{thread.voteCount} votes</span>
      <span className="text-xs text-gray-600 shrink-0 w-16 text-right hidden sm:block">{timeAgo(thread.lastPostAt)}</span>
      {isModerator && (
        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onTogglePin?.(thread.id)} className="p-1 text-gray-600 hover:text-blue-400" title={thread.isPinned ? 'Unpin' : 'Pin'}>
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onToggleLock?.(thread.id)} className="p-1 text-gray-600 hover:text-amber-400" title={thread.isLocked ? 'Unlock' : 'Lock'}>
            {thread.isLocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify compile**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

---

## Task 6: ForumCategoryCard and ForumCategoryManager

**Files:**
- Create: `src/Vanalytics.Web/src/components/forum/ForumCategoryCard.tsx`
- Create: `src/Vanalytics.Web/src/components/forum/ForumCategoryManager.tsx`

- [ ] **Step 1: Create ForumCategoryCard**

```tsx
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import type { CategoryResponse } from '../../types/api'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  category: CategoryResponse
  isModerator: boolean
  onEdit?: (category: CategoryResponse) => void
  onDelete?: (id: number) => void
}

export default function ForumCategoryCard({ category, isModerator, onEdit, onDelete }: Props) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/forum/${category.slug}`)}
      className="rounded-lg border border-gray-800 bg-gray-900 p-4 cursor-pointer hover:bg-gray-800/50 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold text-gray-100 group-hover:text-blue-400">{category.name}</h3>
        {isModerator && (
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit?.(category)} className="p-1 text-gray-600 hover:text-gray-300" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete?.(category.id)} className="p-1 text-gray-600 hover:text-red-400" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {category.description && <p className="text-sm text-gray-500 mt-1">{category.description}</p>}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
        <span>{category.threadCount} threads</span>
        {category.lastActivityAt && <span>Last activity {timeAgo(category.lastActivityAt)}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ForumCategoryManager**

```tsx
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { api } from '../../api/client'
import type { CategoryResponse } from '../../types/api'

interface Props {
  onCategoryChanged: () => void
  editingCategory: CategoryResponse | null
  onCancelEdit: () => void
}

export default function ForumCategoryManager({ onCategoryChanged, editingCategory, onCancelEdit }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [displayOrder, setDisplayOrder] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isEditing = editingCategory != null

  // Sync form when editing category changes
  if (isEditing && name === '' && editingCategory.name !== '') {
    setName(editingCategory.name)
    setDescription(editingCategory.description)
    setDisplayOrder(editingCategory.displayOrder)
    setOpen(true)
  }

  const reset = () => {
    setName('')
    setDescription('')
    setDisplayOrder(0)
    setError('')
    setOpen(false)
    onCancelEdit()
  }

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      if (isEditing) {
        await api(`/api/forum/categories/${editingCategory.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, description, displayOrder }),
        })
      } else {
        await api('/api/forum/categories', {
          method: 'POST',
          body: JSON.stringify({ name, description, displayOrder }),
        })
      }
      reset()
      onCategoryChanged()
    } catch {
      setError(isEditing ? 'Failed to update category' : 'Failed to create category')
    } finally {
      setLoading(false)
    }
  }

  if (!open && !isEditing) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
        <Plus className="h-4 w-4" /> New Category
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">{isEditing ? 'Edit Category' : 'New Category'}</h3>
        <button onClick={reset} className="text-gray-500 hover:text-gray-300"><X className="h-4 w-4" /></button>
      </div>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Category name"
        maxLength={100}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        maxLength={500}
        rows={2}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none resize-none"
      />
      <input
        type="number"
        value={displayOrder}
        onChange={e => setDisplayOrder(Number(e.target.value))}
        placeholder="Display order"
        className="w-32 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button onClick={submit} disabled={loading || !name.trim()} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
        {loading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Verify compile**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

---

## Task 7: Forum pages

**Files:**
- Create: `src/Vanalytics.Web/src/pages/ForumCategoryListPage.tsx`
- Create: `src/Vanalytics.Web/src/pages/ForumThreadListPage.tsx`
- Create: `src/Vanalytics.Web/src/pages/ForumThreadPage.tsx`
- Create: `src/Vanalytics.Web/src/pages/ForumNewThreadPage.tsx`

This is the largest task. The subagent should create all 4 page files. Each page follows the same pattern as existing pages: `useState`/`useEffect` for data fetching, `api()` calls, Tailwind styling.

**ForumCategoryListPage:**
- Fetches `GET /api/forum/categories`
- Shows card grid via `ForumCategoryCard`
- Moderators see `ForumCategoryManager` at top
- Loading spinner, empty state

**ForumThreadListPage:**
- Uses `useParams` for `categorySlug`
- Fetches category info (`GET /api/forum/categories/{slug}`) and threads (`GET /api/forum/categories/{slug}/threads`)
- Breadcrumb: `Forum > {Category Name}`
- "New Thread" button → navigates to `/forum/:categorySlug/new`
- Thread rows via `ForumThreadRow`
- "Load more" pagination
- Moderator pin/lock via API calls

**ForumThreadPage:**
- Uses `useParams` for `categorySlug` and `threadSlug`
- Fetches thread detail and posts
- Breadcrumb: `Forum > {Category} > {Thread}`
- Posts via `ForumPost` component
- Reply box at bottom (or "Sign in to reply" / "Thread locked")
- "Load more" pagination for posts
- Moderator pin/lock in header

**ForumNewThreadPage:**
- Uses `useParams` for `categorySlug`
- Title input + `ForumEditor` + submit
- On success, navigates to new thread

The subagent should read the spec at `docs/superpowers/specs/2026-03-23-forum-frontend-design.md` for detailed styling and behavior requirements, and follow existing page patterns in the codebase (e.g., `ServerStatusDashboard.tsx` for public page structure).

- [ ] **Step 1: Create all 4 pages**
- [ ] **Step 2: Verify compile**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

---

## Task 8: Routing and sidebar updates

**Files:**
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`

- [ ] **Step 1: Update App.tsx**

Add imports for the 4 new pages. Add routes inside `<Route element={<Layout />}>`, after the server routes:

```tsx
{/* Public forum routes */}
<Route path="/forum" element={<ForumCategoryListPage />} />
<Route path="/forum/:categorySlug" element={<ForumThreadListPage />} />
<Route path="/forum/:categorySlug/new" element={<ProtectedRoute><ForumNewThreadPage /></ProtectedRoute>} />
<Route path="/forum/:categorySlug/:threadSlug" element={<ForumThreadPage />} />
```

- [ ] **Step 2: Update Layout.tsx**

1. Add `MessageSquare` to the Lucide import
2. Update `SectionName` type: add `'community'`
3. Update `getSection()`: add `if (pathname.startsWith('/forum')) return 'community'`
4. Add Community sidebar section after the Server section (before Setup Guide):

```tsx
<SidebarSection label="Community" icon={<MessageSquare className="h-4 w-4 shrink-0" />} isOpen={openSection === 'community'} onToggle={() => toggleSection('community')}>
  <SidebarLink to="/forum" end={false} label="Forum" icon={<MessageSquare className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
</SidebarSection>
```

- [ ] **Step 3: Verify compile**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 4: Verify backend still builds**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build --no-restore`

- [ ] **Step 5: Commit**

---

## Task 9: Verification

- [ ] **Step 1: Full frontend compile check**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 2: Full backend build**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build --no-restore`

- [ ] **Step 3: Forum library tests still pass**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/tests/Soverance.Forum.Tests && dotnet test -v minimal`

- [ ] **Step 4: Manual testing checklist**

Run the app and verify:
- `/forum` shows category list (empty initially)
- Sidebar "Community > Forum" link works
- Moderator can create a category
- Clicking category navigates to thread list
- Authenticated user can create a new thread
- Thread page shows posts with author badges
- Tiptap editor works (bold, italic, lists, etc.)
- Vote button toggles with optimistic update
- Moderator can pin/lock threads
- Reply box works for authenticated users
- Unauthenticated users see "Sign in to reply" prompt
- Breadcrumbs navigate correctly
