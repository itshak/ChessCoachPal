"use client";
import {useTranslations} from "next-intl";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted hover:bg-surface-dim hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = "min-h-[140px]",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
}) {
  const t=useTranslations("richEditor");
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: placeholder ?? "",
      }),
    ],
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${minHeightClass} px-3 py-2 focus:outline-none text-sm`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  if (!editor) {
    return (
      <div
        className={`${minHeightClass} rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted`}
      >
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/40 overflow-hidden">
      <div className="flex flex-wrap gap-0.5 px-1.5 py-1 border-b border-border bg-surface-dim/50">
        <ToolbarButton
          title={t("bold")}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          title={t("italic")}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>i</em>
        </ToolbarButton>
        <ToolbarButton
          title={t("bullets")}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          {t("bulletLabel")}
        </ToolbarButton>
        <ToolbarButton
          title={t("numbers")}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          {t("numberLabel")}
        </ToolbarButton>
        <ToolbarButton
          title={t("heading")}
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
