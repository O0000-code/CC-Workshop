import React, { useEffect, useRef, useState } from 'react';
import type { Category } from '@/types';
import { ColorPicker } from '@/components/common';
import { isEnterCommit } from '@/utils/keyboard';

interface CategoryInlineInputProps {
  mode: 'add' | 'edit';
  category?: Category; // 编辑模式必需
  onSave: (name: string) => void;
  onCancel: () => void;
  onColorChange?: (color: string) => void; // 颜色变更回调
}

export const CategoryInlineInput: React.FC<CategoryInlineInputProps> = ({
  mode,
  category,
  onSave,
  onCancel,
  onColorChange,
}) => {
  const [value, setValue] = useState(mode === 'edit' ? category?.name || '' : '');
  const [currentColor, setCurrentColor] = useState(
    mode === 'edit' ? category?.color || '#A1A1AA' : '#A1A1AA',
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动聚焦和全选
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (mode === 'edit') {
        inputRef.current.select();
      }
    }
  }, [mode]);

  // 点击外部取消
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
    // IME guard: Enter during CJK composition (e.g. picking a Pinyin
    // candidate) must NOT commit the input — only a real Enter press
    // outside composition should.
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

  // 颜色变更处理
  const handleColorChange = (color: string) => {
    setCurrentColor(color);
    onColorChange?.(color);
  };

  return (
    <div
      ref={containerRef}
      className="flex items-center h-8 px-2.5 gap-2.5 rounded-[6px] bg-[#F4F4F5]"
    >
      {/* 颜色圆点 - ColorPicker 触发器 */}
      <ColorPicker value={currentColor} onChange={handleColorChange} />

      {/* 输入框 */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Category name..."
        className="flex-1 bg-transparent text-[13px] outline-none border-none
                   text-[#18181B] placeholder:text-[#A1A1AA]
                   selection:bg-[#0063E1] selection:text-white"
      />
    </div>
  );
};

export default CategoryInlineInput;
