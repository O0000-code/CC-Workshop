import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface DropdownOption {
  value: string;
  label: string;
  color?: string; // 用于分类的点颜色
  count?: number; // 用于显示计数
  /**
   * Visual indent depth (`0 = root`, `1 = child`). Each level adds
   * `INDENT_STEP_PX = 16px` of left padding inside the option row,
   * mirroring the sidebar hierarchy spec (D9 / D10, see
   * `02_design_spec.md` V2 §6.5 + `03_tech_plan.md` V2 §5.9).
   * Root options (depth 0 or undefined) render with no extra padding.
   */
  indent?: number;
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  multiple?: boolean;
  searchable?: boolean;
  className?: string;
  triggerClassName?: string;
  compact?: boolean; // 使用 32px 高度
  disabled?: boolean;
}

// ============================================================================
// Dropdown Component
// ============================================================================

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  multiple = false,
  searchable = false,
  className = '',
  triggerClassName = '',
  compact = false,
  disabled = false,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 计算下拉框位置
  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = Math.max(rect.width, multiple ? 220 : 200); // 最小宽度

      // 检查是否会超出窗口右边界
      let left = rect.left;
      const windowWidth = window.innerWidth;
      const rightOverflow = left + dropdownWidth - windowWidth;
      if (rightOverflow > 0) {
        // 调整位置，使下拉框不超出右边界，留 8px 边距
        left = Math.max(8, windowWidth - dropdownWidth - 8);
      }

      setDropdownPosition({
        top: rect.bottom + 4, // 4px gap
        left: left,
        width: dropdownWidth,
      });
    }
  };

  // 打开下拉框时更新位置
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      // 聚焦搜索框
      if (searchable && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }
  }, [isOpen, searchable]);

  // 窗口滚动或调整大小时更新位置
  useEffect(() => {
    if (isOpen) {
      const handleUpdate = () => updatePosition();
      window.addEventListener('scroll', handleUpdate, true);
      window.addEventListener('resize', handleUpdate);
      return () => {
        window.removeEventListener('scroll', handleUpdate, true);
        window.removeEventListener('resize', handleUpdate);
      };
    }
  }, [isOpen]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
        triggerRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  // 过滤选项
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [options, searchQuery]);

  // 获取显示文本
  const getDisplayText = () => {
    if (multiple) {
      const selectedValues = value as string[];
      if (selectedValues.length === 0) return null;
      if (selectedValues.length === 1) {
        const option = options.find((o) => o.value === selectedValues[0]);
        return option?.label;
      }
      return `${selectedValues.length} selected`;
    } else {
      const selectedValue = value as string;
      const option = options.find((o) => o.value === selectedValue);
      return option?.label;
    }
  };

  // 检查选项是否选中
  const isSelected = (optionValue: string) => {
    if (multiple) {
      return (value as string[]).includes(optionValue);
    }
    return value === optionValue;
  };

  // 处理选项点击
  const handleOptionClick = (optionValue: string) => {
    if (multiple) {
      const currentValues = value as string[];
      const newValues = currentValues.includes(optionValue)
        ? currentValues.filter((v) => v !== optionValue)
        : [...currentValues, optionValue];
      onChange(newValues);
    } else {
      onChange(optionValue);
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const displayText = getDisplayText();
  const hasColorDot = options.some((o) => o.color);

  // Trigger 按钮
  const triggerButton = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => !disabled && setIsOpen(!isOpen)}
      disabled={disabled}
      className={`
        flex items-center justify-between w-full
        ${compact ? 'h-8' : 'h-10'}
        px-3
        bg-white
        border border-[#E5E5E5] rounded-md
        text-left
        transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#D4D4D8] cursor-pointer'}
        ${isOpen ? 'border-[#18181B]' : ''}
        ${triggerClassName}
      `}
    >
      <span
        className={`
        truncate flex-1
        ${displayText ? 'text-[13px] text-[#18181B]' : 'text-[12px] text-[#A1A1AA]'}
      `}
      >
        {displayText || placeholder}
      </span>
      <ChevronDown
        className={`
          w-3.5 h-3.5 text-[#71717A] ml-2 flex-shrink-0
          transition-transform duration-200
          ${isOpen ? 'rotate-180' : ''}
        `}
      />
    </button>
  );

  // 下拉列表内容
  const dropdownContent =
    isOpen &&
    createPortal(
      <div
        ref={dropdownRef}
        style={{
          position: 'fixed',
          top: dropdownPosition.top,
          left: dropdownPosition.left,
          width: dropdownPosition.width,
          zIndex: 9999,
        }}
        className="bg-white border border-[#E5E5E5] rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.0625)]"
      >
        {/* 搜索框 */}
        {searchable && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E5E5E5]">
            <Search className="w-3.5 h-3.5 text-[#A1A1AA] flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tags..."
              className="flex-1 text-[13px] text-[#18181B] placeholder:text-[#A1A1AA] outline-none bg-transparent"
            />
          </div>
        )}

        {/* 选项列表 */}
        <div className="p-1 max-h-[300px] overflow-y-auto">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-[#A1A1AA] text-center">No options found</div>
          ) : (
            filteredOptions.map((option) => (
              <DropdownItem
                key={option.value}
                option={option}
                selected={isSelected(option.value)}
                multiple={multiple}
                hasColorDot={hasColorDot}
                onClick={() => handleOptionClick(option.value)}
              />
            ))
          )}
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={`relative ${className}`}>
      {triggerButton}
      {dropdownContent}
    </div>
  );
}

// ============================================================================
// DropdownItem Component
// ============================================================================

interface DropdownItemProps {
  option: DropdownOption;
  selected: boolean;
  multiple: boolean;
  hasColorDot: boolean;
  onClick: () => void;
}

function DropdownItem({ option, selected, multiple, hasColorDot, onClick }: DropdownItemProps) {
  const isUncategorized = option.label.toLowerCase() === 'uncategorized';
  // 16px per level (D9 / D10 — see DropdownOption.indent docstring).
  // Inline padding-left so the indent applies *inside* the rounded hover/
  // selected backplate, matching the sidebar's row indent visual.
  const indentPx = (option.indent ?? 0) * 16;

  return (
    <button
      type="button"
      onClick={onClick}
      style={indentPx > 0 ? { paddingLeft: 12 + indentPx } : undefined}
      className={`
        w-full flex items-center justify-between
        ${indentPx > 0 ? 'pr-3 py-2' : 'px-3 py-2'} rounded
        text-left
        transition-colors
        ${selected ? 'bg-[#F4F4F5]' : 'hover:bg-[#F4F4F5]'}
      `}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* 多选 Checkbox */}
        {multiple && (
          <div
            className={`
              w-3.5 h-3.5 rounded-[3px] flex-shrink-0
              flex items-center justify-center
              transition-colors
              ${selected ? 'bg-[#18181B]' : 'border border-[#D4D4D8] bg-transparent'}
            `}
          >
            {selected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
          </div>
        )}

        {/* 分类颜色点 */}
        {hasColorDot && option.color && (
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: option.color }}
          />
        )}

        {/* 标签文本 */}
        <span
          className={`
            text-[13px] font-medium truncate
            ${isUncategorized ? 'text-[#71717A]' : 'text-[#18181B]'}
          `}
        >
          {option.label}
        </span>
      </div>

      {/* 右侧内容 */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {/* 计数 */}
        {option.count !== undefined && (
          <span className="text-[11px] font-medium text-[#A1A1AA]">{option.count}</span>
        )}

        {/* 单选 Checkmark */}
        {!multiple && selected && <Check className="w-3.5 h-3.5 text-[#18181B]" />}
      </div>
    </button>
  );
}

// ============================================================================
// Export
// ============================================================================

export default Dropdown;
