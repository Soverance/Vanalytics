import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { useEffect, useRef, useState } from 'react'
import { uploadFile } from '../../api/client'
import {
  Bold, Italic, Strikethrough, Code, Heading2, Heading3,
  List, ListOrdered, Quote, CodeSquare, Link2, Undo2, Redo2, ImagePlus
} from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_IMAGES = 5
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

interface Props {
  content?: string
  onChange?: (html: string) => void
  placeholder?: string
  editable?: boolean
}

function ToolbarButton({ onClick, active, disabled, children, title }: {
  onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode; title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        disabled ? 'text-gray-600 cursor-not-allowed' :
        active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function countImages(editor: ReturnType<typeof useEditor>): number {
  if (!editor) return 0
  let count = 0
  editor.state.doc.descendants(node => {
    if (node.type.name === 'image') count++
  })
  return count
}

export default function ForumEditor({ content = '', onChange, placeholder = 'Write something...', editable = true }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.isEmpty ? '' : editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2',
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files
        if (files?.length) {
          const imageFile = Array.from(files).find(f => ALLOWED_TYPES.includes(f.type))
          if (imageFile) {
            event.preventDefault()
            handleUpload(imageFile)
            return true
          }
        }
        return false
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files
        if (files?.length) {
          const imageFile = Array.from(files).find(f => ALLOWED_TYPES.includes(f.type))
          if (imageFile) {
            event.preventDefault()
            handleUpload(imageFile)
            return true
          }
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  const handleUpload = async (file: File) => {
    if (!editor) return
    setUploadError('')

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('File type not allowed. Use JPEG, PNG, GIF, or WebP.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File is too large. Maximum size is 5 MB.')
      return
    }

    if (countImages(editor) >= MAX_IMAGES) {
      setUploadError(`Maximum ${MAX_IMAGES} images per post.`)
      return
    }

    setUploading(true)
    try {
      const result = await uploadFile<{ id: number; url: string }>('/api/forum/attachments', file)
      editor.chain().focus().setImage({ src: result.url }).run()
    } catch {
      setUploadError('Failed to upload image.')
    } finally {
      setUploading(false)
    }
  }

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

  const imageCount = countImages(editor)
  const canAddImage = imageCount < MAX_IMAGES && !uploading

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
        <ToolbarButton onClick={() => fileInputRef.current?.click()} disabled={!canAddImage} title={uploading ? 'Uploading...' : `Image (${imageCount}/${MAX_IMAGES})`}>
          <ImagePlus className={iconSize} />
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
      {uploadError && <p className="text-red-400 text-xs px-3 py-1">{uploadError}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
