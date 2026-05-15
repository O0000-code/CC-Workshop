import React, { useEffect, useRef, useState } from 'react';
import type { Tag } from '@/types';
import { isEnterCommit } from '@/utils/keyboard';

interface TagInlineInputProps {
  mode: 'add' | 'edit';
  tag?: Tag;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export const TagInlineInput: React.FC<TagInlineInputProps> = ({ mode, tag, onSave, onCancel }) => {
  const [value, setValue] = useState(mode === 'edit' ? tag?.name || '' : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto focus and select all
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (mode === 'edit') {
        inputRef.current.select();
      }
    }
  }, [mode]);

  // Click outside to cancel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME guard — see CategoryInlineInput for the same reasoning.
    if (isEnterCommit(e)) {
      e.preventDefault();
      if (value.trim()) {
        onSave(value.trim());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      ref={containerRef}
      className="inline-flex items-center px-2.5 py-[5px] rounded border border-[#E5E5E5] bg-[#F4F4F5]"
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Tag name..."
        className="bg-transparent text-[11px] font-medium outline-none border-none
                   w-16 min-w-0
                   text-[#52525B] placeholder:text-[#A1A1AA]
                   selection:bg-[#0063E1] selection:text-white"
      />
    </div>
  );
};

export default TagInlineInput;
