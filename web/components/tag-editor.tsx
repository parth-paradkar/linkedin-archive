'use client';

import { useEffect, useState, useTransition } from 'react';
import { parseTagInput, splitTagInput } from '@archive/shared';
import { addTag, removeTag } from '@/lib/actions';

/**
 * Same interaction rules as the extension: a comma or Enter commits, × removes,
 * and leaving the field commits whatever is pending rather than dropping it.
 *
 * React keeps the input element across re-renders, so the focus loss that bit
 * the extension's hand-rolled version cannot happen here.
 */
export function TagEditor({ slug, tags }: { slug: string; tags: string[] }) {
  const [items, setItems] = useState(tags);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [, start] = useTransition();

  // Re-sync when a refresh brings new server state.
  useEffect(() => setItems(tags), [tags]);

  const commit = (add: string[], rest: string) => {
    if (!add.length) return;
    const fresh = add.filter((t) => !items.includes(t));
    setItems((prev) => [...prev, ...fresh]);
    setText(rest);
    start(async () => {
      for (const tag of fresh) {
        const { error } = await addTag(slug, tag);
        if (error) setError(error);
      }
    });
  };

  const drop = (tag: string) => {
    setItems((prev) => prev.filter((t) => t !== tag));
    start(async () => {
      const { error } = await removeTag(slug, tag);
      if (error) setError(error);
    });
  };

  return (
    <>
      <div className="tag-edit" onClick={(e) => e.currentTarget.querySelector('input')?.focus()}>
        {items.map((tag) => (
          <span key={tag} className="chip">
            <span>{tag}</span>
            <button
              type="button"
              className="chip-x"
              aria-label={`Remove tag ${tag}`}
              onClick={() => drop(tag)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={text}
          placeholder={items.length ? 'Add tag…' : 'type, then comma'}
          onChange={(e) => {
            const { tags: add, rest } = splitTagInput(e.target.value);
            if (add.length) commit(add, rest);
            else setText(rest);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commit(parseTagInput(text), '');
          }}
          onBlur={() => commit(parseTagInput(text), '')}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
    </>
  );
}
