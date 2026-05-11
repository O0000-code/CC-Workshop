import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, LucideIcon } from 'lucide-react';
import {
  // 原有图标（按字母顺序）
  BarChart,
  BookOpen,
  Box,
  Cloud,
  Code,
  Compass,
  Cpu,
  Database,
  File,
  Folder,
  GitBranch,
  Globe,
  Layers,
  LayoutGrid,
  Monitor,
  Palette,
  PenTool,
  Plug,
  Server,
  Settings,
  Smartphone,
  Sparkles,
  Terminal,
  Zap,
  // 新增图标（按字母顺序）
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AtSign,
  Award,
  Battery,
  Bell,
  BellOff,
  Bluetooth,
  Bookmark,
  Bot,
  Briefcase,
  Bug,
  Building,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleDot,
  Clipboard,
  ClipboardCheck,
  ClipboardCopy,
  Clock,
  CloudRain,
  Coffee,
  Columns,
  Command,
  Copy,
  CreditCard,
  Download,
  Droplet,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck,
  FileCode,
  FileJson,
  FilePlus,
  Files,
  FileText,
  Filter,
  Flag,
  Flame,
  FolderOpen,
  FolderPlus,
  Forward,
  Gamepad2,
  Gift,
  GitCommit,
  Grid3X3,
  Hash,
  Headphones,
  Heart,
  HelpCircle,
  Hexagon,
  History,
  Home,
  Image,
  Inbox,
  Info,
  Key,
  Landmark,
  LayoutList,
  Lightbulb,
  Link,
  Link2,
  List,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Maximize2,
  Menu,
  MessageCircle,
  MessageSquare,
  Mic,
  Minimize2,
  Minus,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Move,
  Music,
  Navigation,
  Package,
  PanelLeft,
  PanelRight,
  Paperclip,
  Pause,
  Pencil,
  Phone,
  Pin,
  Plane,
  Play,
  Plus,
  Power,
  Printer,
  Puzzle,
  QrCode,
  Radio,
  RefreshCw,
  Repeat,
  Reply,
  Rocket,
  RotateCcw,
  RotateCw,
  Rss,
  Save,
  Scan,
  Send,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Shuffle,
  Sidebar,
  SkipBack,
  SkipForward,
  Sliders,
  SplitSquareHorizontal,
  Square,
  Star,
  Sun,
  Tag,
  Target,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Triangle,
  Trophy,
  Unlock,
  Upload,
  User,
  UserPlus,
  Users,
  Video,
  Volume2,
  Wand2,
  Wifi,
  Wind,
  Wrench,
  X,
  XCircle,
  // Brand icons (lucide v0.500 carries these; mirrors the marketplace
  // upstream catalogue's most common origins so list rows visually
  // distinguish e.g. a GitHub-sourced skill from a Figma-sourced one).
  Github,
  Gitlab,
  Slack,
  Figma,
  Youtube,
  Chrome,
  Twitter,
  Linkedin,
  Codepen,
  // Workflow / activity icons (used by topic + domain keyword stages
  // in `src/utils/marketplaceIcon.ts`).
  Workflow,
  Megaphone,
  Coins,
  Table,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface IconPickerProps {
  /** 当前选中的图标名称 */
  value: string;
  /** 图标变更回调 */
  onChange: (iconName: string) => void;
  /** 触发元素引用，用于定位弹出层 */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 禁用状态 */
  disabled?: boolean;
}

interface IconOption {
  name: string;
  icon: LucideIcon;
}

// ============================================================================
// Constants
// ============================================================================

const PRESET_ICONS: IconOption[] = [
  // 原有图标（24 个）- 保持原有顺序
  { name: 'globe', icon: Globe },
  { name: 'code', icon: Code },
  { name: 'database', icon: Database },
  { name: 'server', icon: Server },
  { name: 'folder', icon: Folder },
  { name: 'file', icon: File },
  { name: 'smartphone', icon: Smartphone },
  { name: 'monitor', icon: Monitor },
  { name: 'terminal', icon: Terminal },
  { name: 'palette', icon: Palette },
  { name: 'book-open', icon: BookOpen },
  { name: 'pen-tool', icon: PenTool },
  { name: 'bar-chart', icon: BarChart },
  { name: 'sparkles', icon: Sparkles },
  { name: 'zap', icon: Zap },
  { name: 'plug', icon: Plug },
  { name: 'cpu', icon: Cpu },
  { name: 'cloud', icon: Cloud },
  { name: 'git-branch', icon: GitBranch },
  { name: 'settings', icon: Settings },
  { name: 'layers', icon: Layers },
  { name: 'box', icon: Box },
  { name: 'layout-grid', icon: LayoutGrid },
  { name: 'compass', icon: Compass },
  // 通用操作类（新增）
  { name: 'search', icon: Search },
  { name: 'plus', icon: Plus },
  { name: 'minus', icon: Minus },
  { name: 'x', icon: X },
  { name: 'check', icon: Check },
  { name: 'edit', icon: Edit },
  { name: 'pencil', icon: Pencil },
  { name: 'trash-2', icon: Trash2 },
  { name: 'copy', icon: Copy },
  { name: 'save', icon: Save },
  { name: 'download', icon: Download },
  { name: 'upload', icon: Upload },
  { name: 'refresh-cw', icon: RefreshCw },
  { name: 'more-horizontal', icon: MoreHorizontal },
  { name: 'more-vertical', icon: MoreVertical },
  // 导航类（新增）
  { name: 'home', icon: Home },
  { name: 'arrow-left', icon: ArrowLeft },
  { name: 'arrow-right', icon: ArrowRight },
  { name: 'arrow-up', icon: ArrowUp },
  { name: 'arrow-down', icon: ArrowDown },
  { name: 'chevron-left', icon: ChevronLeft },
  { name: 'chevron-right', icon: ChevronRight },
  { name: 'chevron-up', icon: ChevronUp },
  { name: 'chevron-down', icon: ChevronDown },
  { name: 'external-link', icon: ExternalLink },
  { name: 'menu', icon: Menu },
  // 状态/通知类（新增）
  { name: 'check-circle', icon: CheckCircle },
  { name: 'alert-circle', icon: AlertCircle },
  { name: 'x-circle', icon: XCircle },
  { name: 'info', icon: Info },
  { name: 'alert-triangle', icon: AlertTriangle },
  { name: 'bell', icon: Bell },
  { name: 'bell-off', icon: BellOff },
  { name: 'loader-2', icon: Loader2 },
  { name: 'clock', icon: Clock },
  { name: 'circle-dot', icon: CircleDot },
  // 开发工具类（新增）
  { name: 'git-commit', icon: GitCommit },
  { name: 'bug', icon: Bug },
  { name: 'wrench', icon: Wrench },
  { name: 'puzzle', icon: Puzzle },
  // 文件/文档类（新增）
  { name: 'file-text', icon: FileText },
  { name: 'file-code', icon: FileCode },
  { name: 'folder-open', icon: FolderOpen },
  { name: 'folder-plus', icon: FolderPlus },
  { name: 'file-json', icon: FileJson },
  { name: 'archive', icon: Archive },
  { name: 'clipboard', icon: Clipboard },
  // 界面/布局类（新增）
  { name: 'layout-list', icon: LayoutList },
  { name: 'panel-left', icon: PanelLeft },
  { name: 'panel-right', icon: PanelRight },
  { name: 'maximize-2', icon: Maximize2 },
  { name: 'minimize-2', icon: Minimize2 },
  { name: 'split-square-horizontal', icon: SplitSquareHorizontal },
  { name: 'grid-3x3', icon: Grid3X3 },
  { name: 'columns', icon: Columns },
  // 用户/账户类（新增）
  { name: 'user', icon: User },
  { name: 'users', icon: Users },
  { name: 'user-plus', icon: UserPlus },
  { name: 'log-in', icon: LogIn },
  { name: 'log-out', icon: LogOut },
  { name: 'shield-check', icon: ShieldCheck },
  // 其他常用（新增）
  { name: 'star', icon: Star },
  { name: 'heart', icon: Heart },
  { name: 'tag', icon: Tag },
  { name: 'hash', icon: Hash },
  { name: 'link', icon: Link },
  // 媒体类（新增）
  { name: 'image', icon: Image },
  { name: 'camera', icon: Camera },
  { name: 'video', icon: Video },
  { name: 'play', icon: Play },
  { name: 'pause', icon: Pause },
  { name: 'volume-2', icon: Volume2 },
  // 通信类（新增）
  { name: 'mail', icon: Mail },
  { name: 'send', icon: Send },
  { name: 'message-circle', icon: MessageCircle },
  { name: 'phone', icon: Phone },
  // 安全类（新增）
  { name: 'lock', icon: Lock },
  { name: 'unlock', icon: Unlock },
  { name: 'key', icon: Key },
  { name: 'eye', icon: Eye },
  { name: 'eye-off', icon: EyeOff },
  // 时间类（新增）
  { name: 'calendar', icon: Calendar },
  { name: 'timer', icon: Timer },
  { name: 'history', icon: History },
  // 社交类（新增）
  { name: 'share-2', icon: Share2 },
  { name: 'thumbs-up', icon: ThumbsUp },
  { name: 'thumbs-down', icon: ThumbsDown },
  // 位置类（新增）
  { name: 'map-pin', icon: MapPin },
  { name: 'navigation', icon: Navigation },
  // 其他实用（新增）
  { name: 'bookmark', icon: Bookmark },
  { name: 'filter', icon: Filter },
  { name: 'list', icon: List },
  { name: 'sliders', icon: Sliders },
  { name: 'activity', icon: Activity },
  { name: 'trending-up', icon: TrendingUp },
  { name: 'package', icon: Package },
  { name: 'credit-card', icon: CreditCard },
  { name: 'shopping-cart', icon: ShoppingCart },
  // AI/智能类（新增）
  { name: 'bot', icon: Bot },
  { name: 'wand-2', icon: Wand2 },
  // 天气/自然类（新增）
  { name: 'sun', icon: Sun },
  { name: 'moon', icon: Moon },
  { name: 'cloud-rain', icon: CloudRain },
  { name: 'wind', icon: Wind },
  { name: 'droplet', icon: Droplet },
  // 交通/旅行类（新增）
  { name: 'plane', icon: Plane },
  { name: 'rocket', icon: Rocket },
  // 工作/商务类（新增）
  { name: 'briefcase', icon: Briefcase },
  { name: 'building', icon: Building },
  { name: 'landmark', icon: Landmark },
  // 成就/奖励类（新增）
  { name: 'award', icon: Award },
  { name: 'trophy', icon: Trophy },
  { name: 'flag', icon: Flag },
  { name: 'target', icon: Target },
  // 音乐/音频类（新增）
  { name: 'music', icon: Music },
  { name: 'headphones', icon: Headphones },
  { name: 'mic', icon: Mic },
  { name: 'radio', icon: Radio },
  // 媒体控制类（新增）
  { name: 'skip-back', icon: SkipBack },
  { name: 'skip-forward', icon: SkipForward },
  { name: 'shuffle', icon: Shuffle },
  { name: 'repeat', icon: Repeat },
  // 更多文件操作（新增）
  { name: 'file-plus', icon: FilePlus },
  { name: 'file-check', icon: FileCheck },
  { name: 'files', icon: Files },
  { name: 'paperclip', icon: Paperclip },
  // 更多剪贴板操作（新增）
  { name: 'clipboard-check', icon: ClipboardCheck },
  { name: 'clipboard-copy', icon: ClipboardCopy },
  // 通信/消息类（新增）
  { name: 'message-square', icon: MessageSquare },
  { name: 'inbox', icon: Inbox },
  { name: 'at-sign', icon: AtSign },
  { name: 'reply', icon: Reply },
  { name: 'forward', icon: Forward },
  { name: 'rss', icon: Rss },
  // 连接/网络类（新增）
  { name: 'wifi', icon: Wifi },
  { name: 'bluetooth', icon: Bluetooth },
  { name: 'link-2', icon: Link2 },
  // 设备/硬件类（新增）
  { name: 'printer', icon: Printer },
  { name: 'scan', icon: Scan },
  { name: 'qr-code', icon: QrCode },
  { name: 'battery', icon: Battery },
  { name: 'power', icon: Power },
  // 旋转/移动类（新增）
  { name: 'rotate-cw', icon: RotateCw },
  { name: 'rotate-ccw', icon: RotateCcw },
  { name: 'move', icon: Move },
  // 形状类（新增）
  { name: 'circle', icon: Circle },
  { name: 'square', icon: Square },
  { name: 'triangle', icon: Triangle },
  { name: 'hexagon', icon: Hexagon },
  // 其他实用（新增）
  { name: 'lightbulb', icon: Lightbulb },
  { name: 'flame', icon: Flame },
  { name: 'gift', icon: Gift },
  { name: 'coffee', icon: Coffee },
  { name: 'pin', icon: Pin },
  { name: 'sidebar', icon: Sidebar },
  { name: 'command', icon: Command },
  { name: 'help-circle', icon: HelpCircle },
  { name: 'trending-down', icon: TrendingDown },
  { name: 'gamepad-2', icon: Gamepad2 },
  // Brand icons (used by `marketplaceIcon` resolver for items whose
  // name / description / source matches a known brand)
  { name: 'github', icon: Github },
  { name: 'gitlab', icon: Gitlab },
  { name: 'slack', icon: Slack },
  { name: 'figma', icon: Figma },
  { name: 'youtube', icon: Youtube },
  { name: 'chrome', icon: Chrome },
  { name: 'twitter', icon: Twitter },
  { name: 'linkedin', icon: Linkedin },
  { name: 'codepen', icon: Codepen },
  // Workflow / domain icons (used by topic stage + domain keyword stage)
  { name: 'workflow', icon: Workflow },
  { name: 'megaphone', icon: Megaphone },
  { name: 'coins', icon: Coins },
  { name: 'table', icon: Table },
];

// 导出图标映射，供其他组件使用
export const ICON_MAP: Record<string, LucideIcon> = PRESET_ICONS.reduce(
  (acc, { name, icon }) => {
    acc[name] = icon;
    return acc;
  },
  {} as Record<string, LucideIcon>,
);

// 导出图标名称列表，供自动分类功能使用
export const ICON_NAMES: string[] = PRESET_ICONS.map((icon) => icon.name);

// ============================================================================
// IconPicker Component
// ============================================================================

/**
 * IconPicker Component
 *
 * 弹出式图标选择器，允许用户从预设列表中选择图标。
 *
 * Design specs:
 * - 容器宽度: 260px
 * - 圆角: 8px (--radius-lg)
 * - 背景: #FFFFFF
 * - 边框: 1px solid #E5E5E5
 * - 阴影: 0 4px 12px rgba(0,0,0,0.0625)
 * - 图标网格: 6 列，每项 36x36px
 */
export function IconPicker({
  value,
  onChange,
  triggerRef,
  isOpen,
  onClose,
  disabled = false,
}: IconPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isPositioned, setIsPositioned] = useState(false);

  const popupRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ========== Position Calculation ==========
  const updatePosition = useCallback(
    (initialCalc = false) => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const pickerWidth = 260;
      const pickerHeight = 300;

      let top = rect.bottom + 4;
      let left = rect.left;

      // 右边界检测
      if (left + pickerWidth > viewportWidth - 8) {
        left = viewportWidth - pickerWidth - 8;
      }

      // 底部边界检测 - 如果放不下，改为向上弹出
      if (top + pickerHeight > viewportHeight - 8) {
        top = rect.top - pickerHeight - 4;
      }

      // 确保不超出左边界
      if (left < 8) {
        left = 8;
      }

      setPosition({ top, left });

      // 初次计算完成后标记为已定位
      if (initialCalc) {
        setIsPositioned(true);
      }
    },
    [triggerRef],
  );

  // ========== Filtering ==========
  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) {
      return PRESET_ICONS;
    }
    const query = searchQuery.toLowerCase().trim();
    return PRESET_ICONS.filter((icon) => icon.name.toLowerCase().includes(query));
  }, [searchQuery]);

  // ========== Effects ==========

  // 打开时更新位置和重置状态
  useEffect(() => {
    if (isOpen) {
      updatePosition(true); // 初次计算位置
      setSearchQuery('');
      setFocusedIndex(-1);
      // 聚焦搜索框
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      // 关闭时重置定位状态，为下次打开做准备
      setIsPositioned(false);
    }
  }, [isOpen, updatePosition]);

  // 监听滚动和窗口大小变化
  useEffect(() => {
    if (isOpen) {
      const handleScroll = () => updatePosition();
      const handleResize = () => updatePosition();

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isOpen, updatePosition]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsidePopup = popupRef.current && !popupRef.current.contains(target);
      const isOutsideTrigger = triggerRef.current && !triggerRef.current.contains(target);

      if (isOutsidePopup && isOutsideTrigger) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose, triggerRef]);

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          onClose();
          triggerRef.current?.focus();
          break;
        case 'ArrowRight':
          event.preventDefault();
          setFocusedIndex((prev) => (prev < filteredIcons.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowLeft':
          event.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) => (prev + 6 < filteredIcons.length ? prev + 6 : prev));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) => (prev - 6 >= 0 ? prev - 6 : prev));
          break;
        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < filteredIcons.length) {
            handleIconSelect(filteredIcons[focusedIndex].name);
          }
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, focusedIndex, filteredIcons, onClose, triggerRef]);

  // ========== Handlers ==========
  const handleIconSelect = (iconName: string) => {
    onChange(iconName);
    onClose();
  };

  // ========== Render ==========
  if (!isOpen || disabled) return null;

  const popupContent = createPortal(
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 260,
        zIndex: 9999,
        opacity: isPositioned ? 1 : 0,
        pointerEvents: isPositioned ? 'auto' : 'none',
      }}
      className="bg-white border border-[#E5E5E5] rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.0625)] transition-opacity duration-75"
      role="listbox"
      aria-label="Icon picker"
    >
      {/* Search Box */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#E5E5E5]">
        <Search className="w-3.5 h-3.5 text-[#A1A1AA] flex-shrink-0" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search icons..."
          className="flex-1 text-[13px] text-[#18181B] placeholder:text-[#A1A1AA] outline-none bg-transparent"
        />
      </div>

      {/* Icon Grid */}
      <div className="p-2 max-h-[212px] overflow-y-auto icon-picker-scroll">
        {filteredIcons.length === 0 ? (
          <div className="px-3 py-4 text-[13px] text-[#A1A1AA] text-center">No icons found</div>
        ) : (
          <div className="grid grid-cols-6 gap-1">
            {filteredIcons.map((iconOption, index) => {
              const IconComponent = iconOption.icon;
              const isSelected = value === iconOption.name;
              const isFocused = focusedIndex === index;

              return (
                <button
                  key={iconOption.name}
                  type="button"
                  onClick={() => handleIconSelect(iconOption.name)}
                  className={`
                    flex items-center justify-center
                    w-9 h-9 rounded-md
                    transition-colors
                    ${isSelected ? 'bg-[#F4F4F5]' : 'hover:bg-[#F4F4F5]'}
                    ${isFocused ? 'ring-2 ring-[#18181B]/20' : ''}
                  `}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={iconOption.name}
                >
                  <IconComponent className="w-[18px] h-[18px] text-[#52525B]" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );

  return popupContent;
}

// ============================================================================
// Export
// ============================================================================

export default IconPicker;
