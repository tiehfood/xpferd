<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Image from '@tiptap/extension-image';
  import Link from '@tiptap/extension-link';
  import { t } from '../i18n.js';

  let {
    content = '',
    onUpdate = (_html: string) => {},
    onReady = (_api: { insertText: (text: string) => void }) => {},
  }: {
    content?: string;
    onUpdate?: (html: string) => void;
    onReady?: (api: { insertText: (text: string) => void }) => void;
  } = $props();

  let editorElement: HTMLDivElement;
  let editor: Editor | null = null;

  // Flag to skip $effect re-sync when the content change originated from the editor itself
  let internalUpdate = false;

  // Increment to trigger re-evaluation of toolbar active states
  let editorState = $state(0);

  let isBold = $derived(editorState >= 0 && editor?.isActive('bold'));
  let isItalic = $derived(editorState >= 0 && editor?.isActive('italic'));
  let isStrike = $derived(editorState >= 0 && editor?.isActive('strike'));
  let isHeading = $derived(editorState >= 0 && editor?.isActive('heading', { level: 2 }));
  let isBulletList = $derived(editorState >= 0 && editor?.isActive('bulletList'));
  let isOrderedList = $derived(editorState >= 0 && editor?.isActive('orderedList'));

  onMount(() => {
    editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit,
        Image.configure({
          inline: true,
          allowBase64: true,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        }),
      ],
      content: content,
      editorProps: {
        handlePaste: (view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) continue;
              const reader = new FileReader();
              reader.onload = () => {
                const src = reader.result as string;
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src })
                  )
                );
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
          return false;
        },
        handleDrop: (view, event) => {
          const files = (event as DragEvent).dataTransfer?.files;
          if (!files || files.length === 0) return false;
          for (const file of Array.from(files)) {
            if (file.type.startsWith('image/')) {
              event.preventDefault();
              const reader = new FileReader();
              reader.onload = () => {
                const src = reader.result as string;
                const { state } = view;
                const coords = { left: (event as DragEvent).clientX, top: (event as DragEvent).clientY };
                const pos = view.posAtCoords(coords);
                if (pos) {
                  const tr = state.tr.insert(
                    pos.pos,
                    state.schema.nodes.image.create({ src })
                  );
                  view.dispatch(tr);
                }
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        internalUpdate = true;
        onUpdate(ed.getHTML());
      },
    });

    editor.on('transaction', () => {
      editorState++;
    });

    onReady({
      insertText: (text: string) => {
        editor?.chain().focus().insertContent(text).run();
      },
    });

    return () => {
      try { editor?.destroy(); } catch { /* editor may be partially torn down */ }
      editor = null;
    };
  });

  // Sync external content changes (e.g., switching templates)
  // Skip when the change originated from the editor's own onUpdate callback
  $effect(() => {
    const c = content;
    if (internalUpdate) {
      internalUpdate = false;
      return;
    }
    if (editor && c !== editor.getHTML()) {
      editor.commands.setContent(c, false);
    }
  });

  function insertLink() {
    if (!editor) return;
    const url = prompt(t('rte.link_url'));
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  function insertImage() {
    if (!editor) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        editor!.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
</script>

<div class="rich-editor">
  <div class="toolbar" role="toolbar" aria-label={t('rte.formatierung_loeschen')}>
    <button
      type="button"
      class="tb"
      class:active={isBold}
      onclick={() => editor?.chain().focus().toggleBold().run()}
      aria-label={t('rte.fett')}
      title={t('rte.fett')}
    >
      <strong>B</strong>
    </button>
    <button
      type="button"
      class="tb"
      class:active={isItalic}
      onclick={() => editor?.chain().focus().toggleItalic().run()}
      aria-label={t('rte.kursiv')}
      title={t('rte.kursiv')}
    >
      <em>I</em>
    </button>
    <button
      type="button"
      class="tb"
      class:active={isStrike}
      onclick={() => editor?.chain().focus().toggleStrike().run()}
      aria-label={t('rte.durchgestrichen')}
      title={t('rte.durchgestrichen')}
    >
      <s>S</s>
    </button>
    <span class="tb-sep" aria-hidden="true"></span>
    <button
      type="button"
      class="tb"
      class:active={isHeading}
      onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      aria-label={t('rte.ueberschrift')}
      title={t('rte.ueberschrift')}
    >
      H2
    </button>
    <button
      type="button"
      class="tb"
      class:active={isBulletList}
      onclick={() => editor?.chain().focus().toggleBulletList().run()}
      aria-label={t('rte.aufzaehlung')}
      title={t('rte.aufzaehlung')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
        <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>
      </svg>
    </button>
    <button
      type="button"
      class="tb"
      class:active={isOrderedList}
      onclick={() => editor?.chain().focus().toggleOrderedList().run()}
      aria-label={t('rte.nummerierung')}
      title={t('rte.nummerierung')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
        <path d="M4 6h1v4" stroke="currentColor"/><path d="M4 10h2" stroke="currentColor"/>
        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" stroke="currentColor"/>
      </svg>
    </button>
    <span class="tb-sep" aria-hidden="true"></span>
    <button
      type="button"
      class="tb"
      onclick={insertLink}
      aria-label={t('rte.link')}
      title={t('rte.link')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    </button>
    <button
      type="button"
      class="tb"
      onclick={insertImage}
      aria-label={t('rte.bild')}
      title={t('rte.bild')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
      </svg>
    </button>
    <span class="tb-sep" aria-hidden="true"></span>
    <button
      type="button"
      class="tb"
      onclick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}
      aria-label={t('rte.formatierung_loeschen')}
      title={t('rte.formatierung_loeschen')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.5 2l-7 7"/><path d="M15 7L8.5 13.5 10 15l1-1 3.5 3.5c.4.4 1 .4 1.4 0l5-5c.4-.4.4-1 0-1.4L15 7z"/>
        <path d="M3 21h8"/><path d="M12.5 15.8l-8.3-8.3"/>
      </svg>
    </button>
  </div>
  <div class="editor-content" bind:this={editorElement}></div>
</div>

<style>
  .rich-editor {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--surface);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .rich-editor:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-10);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface-alt);
  }

  .tb {
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 0.2rem 0.45rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    height: auto;
    min-width: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s;
  }

  .tb:hover {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }

  .tb.active {
    background: var(--primary-light);
    border-color: rgba(166, 47, 36, 0.2);
    color: var(--primary);
  }

  .tb-sep {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 0.2rem;
    align-self: center;
    display: inline-block;
    flex-shrink: 0;
  }

  .editor-content {
    min-height: 200px;
    max-height: 400px;
    overflow-y: auto;
  }

  /* TipTap ProseMirror content area — :global required since TipTap creates the DOM */
  .editor-content :global(.tiptap) {
    padding: 0.75rem;
    outline: none;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text);
    font-family: var(--font-body), sans-serif;
    min-height: 200px;
  }

  .editor-content :global(.tiptap p) {
    margin: 0 0 0.5em;
  }

  .editor-content :global(.tiptap p:last-child) {
    margin-bottom: 0;
  }

  .editor-content :global(.tiptap h1),
  .editor-content :global(.tiptap h2),
  .editor-content :global(.tiptap h3) {
    font-family: var(--font-display), sans-serif;
    font-weight: 600;
    margin: 0.8em 0 0.3em;
    line-height: 1.3;
  }

  .editor-content :global(.tiptap h2) {
    font-size: 1.1rem;
  }

  .editor-content :global(.tiptap h3) {
    font-size: 0.95rem;
  }

  .editor-content :global(.tiptap ul),
  .editor-content :global(.tiptap ol) {
    padding-left: 1.5em;
    margin: 0.3em 0;
  }

  .editor-content :global(.tiptap li) {
    margin-bottom: 0.15em;
  }

  .editor-content :global(.tiptap a) {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .editor-content :global(.tiptap img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius);
  }

  .editor-content :global(.tiptap blockquote) {
    border-left: 3px solid var(--border-strong);
    padding-left: 0.75em;
    margin: 0.5em 0;
    color: var(--text-secondary);
  }

  .editor-content :global(.tiptap hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1em 0;
  }

  .editor-content :global(.tiptap code) {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.1em 0.3em;
    font-size: 0.875em;
    font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  }

  .editor-content :global(.tiptap pre) {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0.75rem;
    overflow-x: auto;
    font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.8125rem;
  }

  .editor-content :global(.tiptap pre code) {
    background: none;
    border: none;
    padding: 0;
  }

  /* ProseMirror placeholder */
  .editor-content :global(.tiptap p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    color: var(--text-muted);
    opacity: 0.6;
    pointer-events: none;
    float: left;
    height: 0;
  }
</style>
