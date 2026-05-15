import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { isEnterCommit } from '@/utils/keyboard';

// ============================================================================
// 预设颜色
// ============================================================================

export const PRESET_COLORS = [
  // Row 1: 中性色 (Zinc)
  '#18181B',
  '#3F3F46',
  '#71717A',
  '#A1A1AA',
  '#D4D4D8',
  '#E4E4E7',
  // Row 2: 暖色调
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#10B981',
  '#06B6D4',
  // Row 3: 冷色调
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#EC4899',
  '#F43F5E',
] as const;

// ============================================================================
// 类型定义
// ============================================================================

export interface ColorPickerProps {
  /** 当前颜色值 (HEX 格式) */
  value: string;
  /** 颜色变更回调 */
  onChange: (color: string) => void;
  /** 关闭回调 */
  onClose?: () => void;
  /** 自定义预设颜色 */
  presetColors?: readonly string[];
  /** 禁用状态 */
  disabled?: boolean;
  /** 自定义触发器类名 */
  triggerClassName?: string;
  /** 触发器尺寸 - 默认 8x8 */
  triggerSize?: 'sm' | 'md';
}

// ============================================================================
// ColorPicker 组件
// ============================================================================

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  onClose,
  presetColors = PRESET_COLORS,
  disabled = false,
  triggerClassName = '',
  triggerSize = 'sm',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value.replace('#', '').toUpperCase());
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 同步外部 value 变化
  useEffect(() => {
    setInputValue(value.replace('#', '').toUpperCase());
  }, [value]);

  // 计算弹出位置
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const PANEL_WIDTH = 180;
    const PANEL_HEIGHT = 140;
    const OFFSET_Y = 8;

    let top = rect.bottom + OFFSET_Y;
    let left = rect.left;

    // 右边界
    if (left + PANEL_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - PANEL_WIDTH - 8;
    }

    // 下边界
    if (top + PANEL_HEIGHT > window.innerHeight - 8) {
      top = rect.top - PANEL_HEIGHT - OFFSET_Y;
    }

    // 左边界
    if (left < 8) {
      left = 8;
    }

    setPosition({ top, left });
  }, []);

  // 打开时更新位置
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
      onClose?.();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Escape 关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // HEX 输入处理
  const handleHexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value
      .replace(/^#/, '')
      .replace(/[^0-9A-Fa-f]/g, '')
      .slice(0, 6)
      .toUpperCase();

    setInputValue(hex);

    if (hex.length === 6) {
      onChange(`#${hex}`);
    }
  };

  const handleBlur = () => {
    if (inputValue.length === 6) {
      onChange(`#${inputValue}`);
    } else {
      setInputValue(value.replace('#', '').toUpperCase());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME guard — never commit a hex value during composition. A hex
    // input has no realistic CJK use case, but matching the global
    // pattern keeps behavior consistent and future-proof.
    if (isEnterCommit(e) && inputValue.length === 6) {
      onChange(`#${inputValue}`);
    }
  };

  // 颜色行
  const colorRows = [
    presetColors.slice(0, 6),
    presetColors.slice(6, 12),
    presetColors.slice(12, 18),
  ];

  // 触发器尺寸
  const triggerSizeClass = triggerSize === 'sm' ? 'w-2 h-2' : 'w-6 h-6';

  return (
    <>
      {/* 触发器 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) {
            setIsOpen(true);
          }
        }}
        disabled={disabled}
        className={`
          ${triggerSizeClass} rounded-full flex-shrink-0 cursor-pointer
          hover:ring-2 hover:ring-offset-1 hover:ring-[#D4D4D8]
          transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${triggerClassName}
        `}
        style={{ backgroundColor: value }}
        aria-label="Choose color"
      />

      {/* 弹出面板 */}
      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              zIndex: 9999,
              width: '180px',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
            className="p-3 bg-white rounded-[10px] border border-[#E5E5E5] shadow-[0_6px_16px_rgba(0,0,0,0.07)]"
          >
            {/* 预览区域 */}
            <div className="flex items-center gap-2.5 mb-3" style={{ width: '156px' }}>
              {/* 预览方块 */}
              <div
                className="w-6 h-6 rounded-[6px] flex-shrink-0"
                style={{ backgroundColor: value }}
              />

              {/* HEX 输入 */}
              <div
                className="h-6 px-2 flex items-center gap-1 bg-[#FAFAFA] rounded-[6px] border border-[#E5E5E5]"
                style={{ width: '80px' }}
              >
                <span className="text-[12px] font-medium text-[#A1A1AA] font-inter">#</span>
                <input
                  type="text"
                  value={inputValue}
                  onChange={handleHexInput}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  maxLength={6}
                  className="w-full bg-transparent text-[12px] font-medium text-[#18181B] outline-none uppercase font-inter"
                />
              </div>
            </div>

            {/* 分隔线 */}
            <div className="h-px bg-[#F4F4F5] mb-3" />

            {/* 颜色网格 */}
            <div className="flex flex-col gap-1.5">
              {colorRows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex justify-between">
                  {row.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation(); // 阻止事件冒泡到父级
                        onChange(color);
                        setInputValue(color.replace('#', ''));
                      }}
                      className="relative w-[18px] h-[18px] rounded-full cursor-pointer transition-transform hover:scale-110"
                      style={{ backgroundColor: color }}
                      aria-label={`Select ${color}`}
                    >
                      {value.toUpperCase() === color.toUpperCase() && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-[3px] bg-white" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default ColorPicker;
