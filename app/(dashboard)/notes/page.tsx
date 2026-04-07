'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import { Plus, Trash2, Image, ChevronLeft, StickyNote } from 'lucide-react';

interface Note {
  id: string;
  title: string;
  content: string;
  images: string[];
  created_at: string;
  updated_at: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchNotes = useCallback(async () => {
    const res = await fetch('/api/notes-v2');
    const data = await res.json();
    setNotes(data.notes ?? []);
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const selectNote = (note: Note) => {
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setImages(note.images ?? []);
    setSaved(true);
  };

  const createNote = async () => {
    const res = await fetch('/api/notes-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled Note' }),
    });
    const note = await res.json();
    await fetchNotes();
    selectNote(note);
  };

  const deleteNote = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    await fetch(`/api/notes-v2/${id}`, { method: 'DELETE' });
    if (selectedId === id) { setSelectedId(null); setTitle(''); setContent(''); setImages([]); }
    fetchNotes();
  };

  const autoSave = (updates: { title?: string; content?: string; images?: string[] }) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!selectedId) return;
      setSaving(true);
      await fetch(`/api/notes-v2/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      setSaving(false);
      setSaved(true);
      fetchNotes();
    }, 1000);
  };

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/notes-v2/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      const newImages = [...images, data.url];
      setImages(newImages);
      // Insert markdown image at cursor
      const imgMd = `\n![image](${data.url})\n`;
      const newContent = content + imgMd;
      setContent(newContent);
      autoSave({ content: newContent, images: newImages });
    }
  };

  // Handle paste event for screenshots
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await uploadImage(file);
        return;
      }
    }
  };

  // Handle file input
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        await uploadImage(file);
      }
    }
    e.target.value = '';
  };

  const selected = notes.find((n) => n.id === selectedId);

  return (
    <div className="flex h-full min-h-0">
      {/* Note list */}
      <div className={cn(
        'flex flex-col border-r border-gray-700 shrink-0',
        selected ? 'hidden md:flex md:w-72' : 'w-full md:w-72'
      )}>
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Notes</h2>
          <button
            onClick={createNote}
            className="bg-accent-600 text-white p-1.5 rounded-lg hover:bg-accent-700 transition-colors"
            title="New note"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 gap-2">
              <StickyNote size={24} className="text-gray-600" />
              <p className="text-gray-500 text-sm">No notes yet</p>
              <button onClick={createNote} className="text-accent-400 text-sm hover:underline">Create one</button>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                onClick={() => selectNote(note)}
                className={cn(
                  'px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors group',
                  selectedId === note.id ? 'bg-gray-700' : 'hover:bg-gray-800'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{note.title}</p>
                    <p className="text-gray-500 text-xs truncate mt-0.5">
                      {note.content.slice(0, 60) || 'Empty note'}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">{formatRelativeDate(note.updated_at)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className={cn('flex-1 flex flex-col min-w-0 min-h-0', !selected && 'hidden md:flex')}>
        {selected ? (
          <>
            <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button onClick={() => setSelectedId(null)} className="md:hidden text-gray-400 hover:text-white"><ChevronLeft size={20} /></button>
                <input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); autoSave({ title: e.target.value }); }}
                  className="flex-1 bg-transparent text-white font-semibold text-lg focus:outline-none"
                  placeholder="Note title..."
                />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  multiple
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-gray-500 hover:text-white p-1.5 rounded hover:bg-gray-800 transition-colors"
                  title="Upload image"
                >
                  <Image size={16} />
                </button>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${saved ? 'bg-green-400' : saving ? 'bg-yellow-400 animate-pulse' : 'bg-yellow-400'}`} />
                  <span className="text-gray-500 text-xs">{saving ? 'Saving' : saved ? 'Saved' : 'Unsaved'}</span>
                </div>
              </div>
            </div>

            {/* Paste hint */}
            <div className="px-5 py-1.5 bg-gray-900/50 text-gray-600 text-xs border-b border-gray-800 shrink-0">
              Paste screenshots directly (Ctrl+V) or click the image icon to upload
            </div>

            {/* Content editor */}
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => { setContent(e.target.value); autoSave({ content: e.target.value }); }}
              onPaste={handlePaste}
              placeholder="Start typing... Paste screenshots with Ctrl+V"
              className="flex-1 bg-transparent text-gray-300 px-5 py-4 text-sm focus:outline-none resize-none placeholder-gray-600 leading-relaxed"
            />

            {/* Pasted images gallery */}
            {images.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-700 shrink-0">
                <p className="text-gray-500 text-xs mb-2">{images.length} image{images.length !== 1 ? 's' : ''}</p>
                <div className="flex gap-2 flex-wrap">
                  {images.map((url, i) => (
                    <a key={i} href={url} target="_blank" className="block">
                      <img src={url} alt="" className="w-16 h-16 object-cover rounded border border-gray-700 hover:border-gray-500 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <StickyNote size={32} className="mx-auto text-gray-600 mb-2" />
              <p className="text-gray-500 text-sm">Select a note or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
