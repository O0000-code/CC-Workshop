import React, { useMemo, useState } from 'react';
import { safeInvoke } from '@/utils/tauri';
import type { Scene } from '@/types';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Layers,
  Pencil,
  Folder,
  AlertTriangle,
  Code,
  Server,
  BarChart,
  Cloud,
  FileText,
  BookOpen,
  Smartphone,
  Database,
  Globe,
  Zap,
  FileCode,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { IconPicker, ViewOptionsMenu, type ViewOption } from '@/components/common';
import { SceneListItem } from '@/components/scenes/SceneListItem';
import { CreateSceneModal } from '@/components/scenes/CreateSceneModal';
import { useScenesStore } from '@/stores/scenesStore';
import { useSkillsStore } from '@/stores/skillsStore';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useSortPreferencesStore } from '@/stores/sortPreferencesStore';

// ============================================================================
// Sort options (no Group — Scenes have no category/tags fields).
// ============================================================================
const SCENES_SORT_OPTIONS: ViewOption[] = [
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'recent', label: 'Recently created' },
  { value: 'used', label: 'Recently used' },
];

function applyScenesSort(items: Scene[], sortBy: string): Scene[] {
  const sorted = [...items];
  switch (sortBy) {
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'recent':
      sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      break;
    case 'used':
      sorted.sort((a, b) => {
        const ax = a.lastUsed ?? '';
        const bx = b.lastUsed ?? '';
        if (ax && !bx) return -1;
        if (!ax && bx) return 1;
        return bx.localeCompare(ax);
      });
      break;
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}
import { useProjectsStore } from '@/stores/projectsStore';
import type { Skill, McpServer } from '@/types';

// ============================================================================
// Types & Constants
// ============================================================================

const sceneIconMap: Record<string, React.FC<{ className?: string }>> = {
  layers: Layers,
  code: Code,
  server: Server,
  'bar-chart': BarChart,
  cloud: Cloud,
  'file-text': FileText,
  'book-open': BookOpen,
  smartphone: Smartphone,
};

const skillIconMap: Record<string, React.FC<{ className?: string }>> = {
  Development: Code,
  Design: Zap,
  Research: Globe,
  Productivity: FileCode,
  default: Sparkles,
};

const mcpIconMap: Record<string, React.FC<{ className?: string }>> = {
  Development: Code,
  Research: Globe,
  default: Database,
};

const getSceneIcon = (iconName: string) => sceneIconMap[iconName] || Layers;
const getSkillIcon = (category: string) => skillIconMap[category] || skillIconMap.default;
const getMcpIcon = (category: string) => mcpIconMap[category] || mcpIconMap.default;

// Format date
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ============================================================================
// Item Components
// ============================================================================

interface IncludedItemProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  isLast: boolean;
}

const IncludedItem: React.FC<IncludedItemProps> = ({ icon, name, description, isLast }) => (
  <div
    className={`flex items-center gap-3 px-3.5 py-3 ${!isLast ? 'border-b border-[#E5E5E5]' : ''}`}
  >
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]">
      {icon}
    </div>
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[13px] font-medium text-[#18181B]">{name}</span>
      <span className="truncate text-[11px] font-normal text-[#71717A]">{description}</span>
    </div>
  </div>
);

interface ProjectChipProps {
  name: string;
  onClick?: () => void;
}

const ProjectChip: React.FC<ProjectChipProps> = ({ name, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 rounded-md border border-[#E5E5E5] px-3.5 py-2 transition-colors hover:bg-[#FAFAFA]"
  >
    <Folder className="h-3.5 w-3.5 text-[#52525B]" />
    <span className="text-xs font-medium text-[#18181B]">{name}</span>
  </button>
);

// ============================================================================
// ScenesPage Component
// ============================================================================

/**
 * ScenesPage Component
 *
 * Displays the list of scenes with search and create functionality.
 * Now includes a sliding detail panel instead of navigating to a separate page.
 *
 * Layout:
 * - PageHeader: Title "Scenes" + Search + "+ New Scene" button
 * - Content: SceneCard grid (vertical list) with optional sliding detail panel
 * - Empty state when no scenes exist
 */
export const ScenesPage: React.FC = () => {
  const navigate = useNavigate();

  // Store state
  const scenes = useScenesStore((state) => state.scenes);
  const deleteScene = useScenesStore((state) => state.deleteScene);
  const filter = useScenesStore((state) => state.filter);
  const setFilter = useScenesStore((state) => state.setFilter);
  const skills = useSkillsStore((state) => state.skills);
  const mcpServers = useMcpsStore((state) => state.mcpServers);
  const projects = useProjectsStore((state) => state.projects);

  // Local state - selected scene for detail panel
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    sceneId: string | null;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, sceneId: null, triggerRef: null });

  const sortBy = useSortPreferencesStore((s) => s.sort.scenes);
  const setSortFor = useSortPreferencesStore((s) => s.setSortFor);

  // Filter scenes based on search, then apply user-chosen sort.
  const filteredScenes = useMemo(() => {
    const base = !filter.search
      ? scenes
      : (() => {
          const query = filter.search.toLowerCase();
          return scenes.filter(
            (scene) =>
              scene.name.toLowerCase().includes(query) ||
              scene.description.toLowerCase().includes(query),
          );
        })();
    return applyScenesSort(base, sortBy);
  }, [scenes, filter.search, sortBy]);

  // Status text — "{N} scenes".
  const statusText = useMemo(() => {
    const count = filteredScenes.length;
    return `${count} ${count === 1 ? 'scene' : 'scenes'}`;
  }, [filteredScenes]);

  // Get selected scene
  const selectedScene = useMemo(
    () => scenes.find((s) => s.id === selectedSceneId) || null,
    [scenes, selectedSceneId],
  );

  // Get skills and MCPs for selected scene
  const includedSkills = useMemo((): Skill[] => {
    if (!selectedScene) return [];
    return skills.filter((s) => selectedScene.skillIds.includes(s.id));
  }, [selectedScene, skills]);

  const includedMcps = useMemo((): McpServer[] => {
    if (!selectedScene) return [];
    return mcpServers.filter((m) => selectedScene.mcpIds.includes(m.id));
  }, [selectedScene, mcpServers]);

  // Get projects using this scene
  const usingProjects = useMemo(() => {
    if (!selectedScene) return [];
    return projects.filter((p) => p.sceneId === selectedScene.id);
  }, [selectedScene, projects]);

  // Handle scene click - now sets selected state instead of navigating
  const handleSceneClick = (sceneId: string) => {
    setSelectedSceneId(sceneId);
  };

  // Handle close detail panel
  const handleCloseDetail = () => {
    setSelectedSceneId(null);
  };

  // Handle create scene - calls backend to persist
  const handleCreateScene = async (sceneData: {
    name: string;
    description: string;
    skillIds: string[];
    mcpIds: string[];
  }) => {
    try {
      // Directly call Tauri backend with snake_case parameters
      const newScene = await safeInvoke<Scene>('add_scene', {
        name: sceneData.name.trim(),
        description: sceneData.description.trim(),
        icon: 'layers',
        skillIds: sceneData.skillIds,
        mcpIds: sceneData.mcpIds,
      });
      if (newScene) {
        // Update local state with the new scene from backend
        useScenesStore.getState().setScenes([...scenes, newScene]);
        setSelectedSceneId(newScene.id);
      } else {
        console.warn('newScene is null or undefined');
      }
    } catch (error) {
      console.error('Failed to create scene:', error);
    }

    setIsCreateModalOpen(false);
  };

  // Handle update scene - calls backend to persist
  const handleUpdateScene = async (
    id: string,
    sceneData: {
      name: string;
      description: string;
      skillIds: string[];
      mcpIds: string[];
      claudeMdIds?: string[];
    },
  ) => {
    try {
      await safeInvoke('update_scene', {
        id,
        name: sceneData.name.trim(),
        description: sceneData.description.trim(),
        skillIds: sceneData.skillIds,
        mcpIds: sceneData.mcpIds,
        claudeMdIds: sceneData.claudeMdIds,
      });

      // Update local state
      useScenesStore.getState().setScenes(
        scenes.map((scene) =>
          scene.id === id
            ? {
                ...scene,
                name: sceneData.name.trim(),
                description: sceneData.description.trim(),
                skillIds: sceneData.skillIds,
                mcpIds: sceneData.mcpIds,
                claudeMdIds: sceneData.claudeMdIds,
              }
            : scene,
        ),
      );
    } catch (error) {
      console.error('Failed to update scene:', error);
    }

    setEditingScene(null);
  };

  // State for delete confirmation
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    sceneId: string | null;
    sceneName: string;
  }>({ isOpen: false, sceneId: null, sceneName: '' });

  // Handle delete from list item dropdown menu - show confirmation first
  const handleDeleteScene = (id: string) => {
    const scene = scenes.find((s) => s.id === id);
    if (!scene) return;

    // Check if any real projects are using this scene
    const projectsUsingScene = projects.filter((p) => p.sceneId === id);
    if (projectsUsingScene.length > 0) {
      window.alert(
        `Cannot delete "${scene.name}" because it is being used by ${projectsUsingScene.length} project(s).`,
      );
      return;
    }

    // Show confirmation state instead of window.confirm
    setDeleteConfirmState({ isOpen: true, sceneId: id, sceneName: scene.name });
  };

  // Actually perform the delete after confirmation
  const handleConfirmDelete = async () => {
    if (!deleteConfirmState.sceneId) return;

    const id = deleteConfirmState.sceneId;
    setDeleteConfirmState({ isOpen: false, sceneId: null, sceneName: '' });

    try {
      await deleteScene(id);
      if (selectedSceneId === id) {
        setSelectedSceneId(null);
      }
    } catch (error) {
      console.error('Failed to delete scene:', error);
      window.alert('Failed to delete scene. Please try again.');
    }
  };

  // Cancel delete
  const handleCancelDelete = () => {
    setDeleteConfirmState({ isOpen: false, sceneId: null, sceneName: '' });
  };

  // Handle icon click
  const handleIconClick = (sceneId: string, ref: React.RefObject<HTMLDivElement>) => {
    setIconPickerState({ isOpen: true, sceneId, triggerRef: ref });
  };

  // Handle icon change
  const handleIconChange = (iconName: string) => {
    if (iconPickerState.sceneId) {
      const scene = scenes.find((s) => s.id === iconPickerState.sceneId);
      if (scene) {
        const updatedScenes = scenes.map((s) =>
          s.id === iconPickerState.sceneId ? { ...s, icon: iconName } : s,
        );
        useScenesStore.getState().setScenes(updatedScenes);
      }
    }
    setIconPickerState({ isOpen: false, sceneId: null, triggerRef: null });
  };

  // Handle icon picker close
  const handleIconPickerClose = () => {
    setIconPickerState({ isOpen: false, sceneId: null, triggerRef: null });
  };

  // Get scene icon component for detail header
  const SceneIconComponent = selectedScene ? getSceneIcon(selectedScene.icon) : Layers;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Page Header */}
      <PageHeader
        title="Scenes"
        searchValue={filter.search}
        onSearchChange={(value) => setFilter({ search: value })}
        searchPlaceholder="Search scenes..."
        actions={
          <Button
            variant="primary"
            size="small"
            icon={<Plus />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            New Scene
          </Button>
        }
      />

      {/* Content - with shrink animation when panel is open */}
      <div
        className={`
          flex-1 overflow-y-auto p-6 px-7
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${selectedSceneId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Status line — count | View Options (Sort only; no Group) */}
        {filteredScenes.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#A1A1AA]">{statusText}</span>
            <ViewOptionsMenu
              sections={[
                {
                  id: 'sort',
                  label: 'SORT BY',
                  options: SCENES_SORT_OPTIONS,
                  value: sortBy,
                  onChange: (v) => setSortFor('scenes', v),
                },
              ]}
            />
          </div>
        )}

        {filteredScenes.length > 0 ? (
          /* Scene List - Unified SceneListItem with animated compact mode */
          <div className="flex flex-col gap-3">
            {filteredScenes.map((scene) => (
              <SceneListItem
                key={scene.id}
                scene={scene}
                compact={!!selectedSceneId}
                selected={scene.id === selectedSceneId}
                onClick={() => handleSceneClick(scene.id)}
                onIconClick={(ref) => handleIconClick(scene.id, ref)}
                onDelete={() => handleDeleteScene(scene.id)}
              />
            ))}
          </div>
        ) : scenes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Layers className="h-12 w-12" />}
              title="No scenes"
              description="Create a scene to bundle configurations"
              action={
                <Button
                  variant="primary"
                  size="small"
                  icon={<Plus />}
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  Create Scene
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Layers className="h-12 w-12" />}
              title="No matching scenes"
              description="Try adjusting your search query"
            />
          </div>
        )}
      </div>

      {/* Slide Panel for Detail View */}
      <SlidePanel
        isOpen={!!selectedSceneId}
        onClose={handleCloseDetail}
        width={800}
        header={
          selectedScene && (
            <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F4F4F5]">
                <SceneIconComponent className="h-[18px] w-[18px] text-[#18181B]" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 className="text-base font-semibold text-[#18181B]">{selectedScene.name}</h2>
                <p
                  className="w-full truncate text-xs font-normal text-[#71717A]"
                  title={selectedScene.description}
                >
                  {selectedScene.description}
                </p>
              </div>
            </div>
          )
        }
        headerRight={
          selectedScene && (
            <Button
              variant="secondary"
              size="small"
              icon={<Pencil />}
              onClick={() => setEditingScene(selectedScene)}
            >
              Edit
            </Button>
          )
        }
      >
        {selectedScene && (
          <div className="flex flex-col gap-7">
            {/* Info Section */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-4 gap-8">
                {/* Created */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#71717A]">Created</span>
                  <span className="text-[13px] font-medium text-[#18181B]">
                    {formatDate(selectedScene.createdAt)}
                  </span>
                </div>

                {/* Skills Count */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#71717A]">Skills Count</span>
                  <span className="text-[13px] font-medium text-[#18181B]">
                    {selectedScene.skillIds.length} skills
                  </span>
                </div>

                {/* MCPs Count */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#71717A]">MCPs Count</span>
                  <span className="text-[13px] font-medium text-[#18181B]">
                    {selectedScene.mcpIds.length} servers
                  </span>
                </div>

                {/* CLAUDE.md Count - only show if > 0 */}
                {(selectedScene.claudeMdIds?.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[#71717A]">CLAUDE.md</span>
                    <span className="text-[13px] font-medium text-[#18181B]">
                      {selectedScene.claudeMdIds?.length} docs
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Description Section */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-[#18181B]">Description</h3>
              <div className="rounded-lg border border-[#E5E5E5] p-4">
                <p className="text-xs text-[#52525B] leading-[1.6]">
                  {selectedScene.description || (
                    <span className="text-[#A1A1AA] italic">No description</span>
                  )}
                </p>
              </div>
            </div>

            {/* Included Skills Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#18181B]">Included Skills</h3>
                <Badge variant="count">{includedSkills.length}</Badge>
              </div>
              {includedSkills.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
                  {includedSkills.map((skill, index) => {
                    const SkillIcon = getSkillIcon(skill.category);
                    return (
                      <IncludedItem
                        key={skill.id}
                        icon={<SkillIcon className="h-3.5 w-3.5 text-[#52525B]" />}
                        name={skill.name}
                        description={skill.description}
                        isLast={index === includedSkills.length - 1}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-[#E5E5E5] py-6 text-center">
                  <p className="text-sm text-[#A1A1AA]">No skills included</p>
                </div>
              )}
            </div>

            {/* Included MCP Servers Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#18181B]">Included MCP Servers</h3>
                <Badge variant="count">{includedMcps.length}</Badge>
              </div>
              {includedMcps.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
                  {includedMcps.map((mcp, index) => {
                    const McpIcon = getMcpIcon(mcp.category);
                    return (
                      <IncludedItem
                        key={mcp.id}
                        icon={<McpIcon className="h-3.5 w-3.5 text-[#52525B]" />}
                        name={mcp.name}
                        description={mcp.description}
                        isLast={index === includedMcps.length - 1}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-[#E5E5E5] py-6 text-center">
                  <p className="text-sm text-[#A1A1AA]">No MCP servers included</p>
                </div>
              )}
            </div>

            {/* Used by Projects Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#18181B]">Used by Projects</h3>
                  {usingProjects.length > 0 && (
                    <span className="rounded bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#D97706]">
                      {usingProjects.length}
                    </span>
                  )}
                </div>
                {usingProjects.length > 0 && (
                  <span className="flex items-center gap-1.5 text-[11px] font-normal text-[#D97706]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Changes will affect these projects
                  </span>
                )}
              </div>
              {usingProjects.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {usingProjects.map((project) => (
                    <ProjectChip
                      key={project.id}
                      name={project.name}
                      onClick={() => navigate(`/projects/${project.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-[#E5E5E5] py-6 text-center">
                  <p className="text-sm text-[#A1A1AA]">No projects using this scene</p>
                </div>
              )}
            </div>
          </div>
        )}
      </SlidePanel>

      {/* Create Scene Modal */}
      <CreateSceneModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateScene={handleCreateScene}
        skills={skills}
        mcpServers={mcpServers}
      />

      {/* Edit Scene Modal */}
      <CreateSceneModal
        isOpen={!!editingScene}
        onClose={() => setEditingScene(null)}
        onCreateScene={handleCreateScene}
        onUpdateScene={handleUpdateScene}
        skills={skills}
        mcpServers={mcpServers}
        initialScene={editingScene || undefined}
      />

      {/* Icon Picker */}
      {iconPickerState.triggerRef && (
        <IconPicker
          value={scenes.find((s) => s.id === iconPickerState.sceneId)?.icon || 'layers'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}

      {/* Delete Confirmation Dialog - Design: Delete Confirm - B */}
      {deleteConfirmState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex w-[320px] flex-col gap-6 rounded-xl border border-[#E5E5E5] bg-white px-7 pt-7 pb-5 shadow-xl">
            {/* Top - Title & Description */}
            <div className="flex flex-col gap-2.5">
              <h3 className="text-[15px] font-semibold text-[#18181B]">
                Delete "{deleteConfirmState.sceneName}"?
              </h3>
              <p className="text-[13px] leading-[1.4] text-[#71717A]">
                Are you sure you want to delete "{deleteConfirmState.sceneName}"?
                <br />
                This action cannot be undone.
              </p>
            </div>
            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCancelDelete}
                className="flex h-[38px] flex-1 items-center justify-center rounded-md border border-[#E5E5E5] text-[13px] font-medium text-[#52525B] transition-colors hover:bg-[#F4F4F5]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-md bg-[#18181B] text-[13px] font-medium text-white transition-colors hover:bg-[#27272A]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenesPage;
