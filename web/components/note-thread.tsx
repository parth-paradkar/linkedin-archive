'use client';

import { useState, useTransition } from 'react';
import type { NoteEntry } from '@archive/shared';
import { addNote, deleteNote, editNote } from '@/lib/actions';

const when = (iso: string) => new Date(iso).toLocaleString();

export function NoteThread({
  slug,
  notes,
  viewerEmail,
}: {
  slug: string;
  notes: NoteEntry[];
  viewerEmail: string;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError('');
      const { error } = await fn();
      if (error) setError(error);
    });

  return (
    <div className="thread">
      {notes.length === 0 ? <p className="muted">No notes yet.</p> : null}

      {notes.map((n) => {
        const mine = n.authorEmail === viewerEmail;
        return (
          <div key={n.id} className="note">
            <div className="note-head">
              <span className="who">{mine ? 'You' : n.authorEmail}</span>
              <span>{when(n.createdAt)}</span>
              {n.editedAt ? <span>· edited</span> : null}
            </div>

            {editing === n.id ? (
              <>
                <textarea
                  rows={3}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <div className="note-actions">
                  <button
                    onClick={() => {
                      run(() => editNote(n.id, slug, editText));
                      setEditing(null);
                    }}
                  >
                    Save
                  </button>
                  <button onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p className="note-body">{n.body}</p>
                {/* Only the author's own entries offer these; the database
                    enforces it regardless of what the UI shows. */}
                {mine ? (
                  <div className="note-actions">
                    <button
                      onClick={() => {
                        setEditing(n.id);
                        setEditText(n.body);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (confirm('Delete this note?')) run(() => deleteNote(n.id, slug));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        );
      })}

      <textarea
        rows={3}
        placeholder="Add a note…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div>
        <button
          disabled={pending || !draft.trim()}
          onClick={() => {
            const body = draft;
            setDraft('');
            run(() => addNote(slug, body));
          }}
        >
          {pending ? 'Saving…' : 'Add note'}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
