import React, { useMemo, useState } from 'react';
import { Plus, Folder } from 'lucide-react';
import { PageHeader, SlidePanel } from '../components/layout';
import {
  Button,
  EmptyState,
  IconPicker,
  ViewOptionsMenu,
  type ViewOption,
} from '../components/common';
import { NewProjectItem, ProjectConfigPanel, ProjectCard } from '../components/projects';
import { useProjectsStore } from '../stores/projectsStore';
import { useScenesStore } from '../stores/scenesStore';
import { useSortPreferencesStore } from '../stores/sortPreferencesStore';
import { safeInvoke } from '@/utils/tauri';
import type { Project, Scene } from '../types';

// ============================================================================
// Sort options (no Group — Projects have no category/tags fields).
// ============================================================================
// Project has no `createdAt` (it's a registry of managed paths, not a content
// entity), so the time-based option keys on `lastSynced`.
const PROJECTS_SORT_OPTIONS: ViewOption[] = [
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'recent-sync', label: 'Recently synced' },
];

function applyProjectsSort(items: Project[], sortBy: string): Project[] {
  const sorted = [...items];
  switch (sortBy) {
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'recent-sync':
      sorted.sort((a, b) => {
        const ax = a.lastSynced ?? '';
        const bx = b.lastSynced ?? '';
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

// ============================================================================
// ProjectsPage Component
// ============================================================================
// Layout: Unified layout with SlidePanel for detail view
// - Empty state: PageHeader + Centered Empty State
// - List state: PageHeader + Project Cards with optional SlidePanel
// Design reference: design-spec-projects.md

/**
 * ProjectsPage displays the projects management interface.
 *
 * States and Layouts:
 * - Empty (projects.length === 0 && !isCreating): Two-column, empty state centered
 * - List/Detail (projects.length > 0 || isCreating): Project cards with SlidePanel for detail
 */
export function ProjectsPage() {
  const {
    projects,
    selectedProjectId,
    isCreating,
    filter,
    newProject,
    syncStepResults,
    syncResultsProjectId,
    setFilter,
    selectProject,
    startCreating,
    cancelCreating,
    updateNewProject,
    createProject,
    updateProject,
    deleteProject,
    syncProject,
    clearProjectConfig,
    clearSyncResults,
    selectProjectFolder,
  } = useProjectsStore();

  // Round 2 fix R2-3: derive the partial-sync banner from the most
  // recent run's step results. A banner appears whenever any step
  // failed; an all-success run sets `syncStepResults` back to null in
  // the store, so we never display "Sync succeeded" — the user already
  // sees lastSynced in the ProjectCard.
  const failedSteps = useMemo(() => syncStepResults?.filter((s) => !s.ok) ?? [], [syncStepResults]);
  const showSyncBanner = failedSteps.length > 0;
  const syncBannerProject = useMemo(
    () => projects.find((p) => p.id === syncResultsProjectId) ?? null,
    [projects, syncResultsProjectId],
  );

  // "Clear & Retry" action for the banner — invokes the existing
  // clearProjectConfig (deletes managed symlinks / files) then dismisses
  // the banner. We deliberately do NOT auto-retry sync afterward: the
  // user should see a clean state and decide whether to re-sync.
  const handleClearAndRetry = async () => {
    if (!syncBannerProject) return;
    try {
      await clearProjectConfig(syncBannerProject.id);
      clearSyncResults();
    } catch {
      // clearProjectConfig writes to `error` on failure — leave the
      // banner up so the user can see both issues at once.
    }
  };

  // Get scenes from scenesStore
  const scenes = useScenesStore((state) => state.scenes);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    projectId: string | null;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, projectId: null, triggerRef: null });

  // Handle icon click
  const handleIconClick = (projectId: string, ref: React.RefObject<HTMLDivElement>) => {
    setIconPickerState({ isOpen: true, projectId, triggerRef: ref });
  };

  // Handle icon change
  const handleIconChange = (iconName: string) => {
    if (iconPickerState.projectId) {
      updateProject(iconPickerState.projectId, { icon: iconName });
    }
    setIconPickerState({ isOpen: false, projectId: null, triggerRef: null });
  };

  // Handle icon picker close
  const handleIconPickerClose = () => {
    setIconPickerState({ isOpen: false, projectId: null, triggerRef: null });
  };

  // Handle scene change - clear old config, update scene, then sync new config
  const handleSceneChange = async (projectId: string, newSceneId: string) => {
    // Skip if scene hasn't changed
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.sceneId === newSceneId) return;

    try {
      // 1. Clear existing configuration
      await clearProjectConfig(projectId);

      // 2. Update project with new scene
      await updateProject(projectId, { sceneId: newSceneId });

      // 3. Sync new configuration
      await syncProject(projectId);
    } catch (error) {
      console.error('Failed to change scene:', error);
    }
  };

  // Handle delete project
  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
  };

  // Handle close detail panel
  const handleCloseDetail = () => {
    if (isCreating) {
      cancelCreating();
    } else {
      selectProject(null);
    }
  };

  const sortBy = useSortPreferencesStore((s) => s.sort.projects);
  const setSortFor = useSortPreferencesStore((s) => s.setSortFor);

  // Filter projects based on search, then apply user-chosen sort.
  const filteredProjects = useMemo(() => {
    const base = !filter.search
      ? projects
      : (() => {
          const query = filter.search.toLowerCase();
          return projects.filter(
            (p) => p.name.toLowerCase().includes(query) || p.path.toLowerCase().includes(query),
          );
        })();
    return applyProjectsSort(base, sortBy);
  }, [projects, filter.search, sortBy]);

  // Status text — "{N} projects · {M} synced".
  const statusText = useMemo(() => {
    const count = filteredProjects.length;
    const syncedCount = filteredProjects.filter((p) => !!p.lastSynced).length;
    const projectsLabel = `${count} ${count === 1 ? 'project' : 'projects'}`;
    if (count === 0) return projectsLabel;
    return `${projectsLabel} · ${syncedCount} synced`;
  }, [filteredProjects]);

  // Get selected project
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  // Get scene for selected project
  const selectedScene = useMemo(
    (): Scene | undefined => scenes.find((s) => s.id === selectedProject?.sceneId),
    [selectedProject, scenes],
  );

  // Check if detail panel should be open
  const isDetailOpen = !!selectedProjectId || isCreating;

  // ============================================================================
  // State 1: Empty State Page
  // ============================================================================
  // Condition: No projects and not in creating mode
  // Layout: PageHeader + Centered Empty State

  if (projects.length === 0 && !isCreating) {
    return (
      <>
        {/* Header with "New Project" button */}
        <PageHeader
          title="Projects"
          actions={
            <Button variant="primary" size="small" icon={<Plus />} onClick={startCreating}>
              New Project
            </Button>
          }
        />

        {/* Empty State Content - Centered */}
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-5">
            {/* Folder Icon */}
            <Folder className="h-8 w-8 text-[#D4D4D8]" strokeWidth={1.5} />
            {/* Text Group */}
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-sm font-medium tracking-[-0.2px] text-[#A1A1AA]">
                No projects
              </span>
              <span className="text-[13px] text-[#D4D4D8] text-center">
                Add a project folder to get started
              </span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ============================================================================
  // State 2 & 3: List State with Optional SlidePanel
  // ============================================================================
  // Condition: Has projects or in creating mode
  // Layout: PageHeader + Project Cards + SlidePanel (when detail is open)

  // Detail Header content
  const detailHeader = isCreating ? (
    <h2 className="text-[16px] font-semibold text-[#18181B]">New Project Configuration</h2>
  ) : selectedProject ? (
    <h2 className="text-[16px] font-semibold text-[#18181B]">Project Configuration</h2>
  ) : null;

  // Detail Header right content
  const detailHeaderRight = isCreating ? (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="small" onClick={cancelCreating}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="small"
        onClick={createProject}
        disabled={!newProject.name || !newProject.path}
      >
        Create Project
      </Button>
    </div>
  ) : selectedProject ? (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="small"
        icon={<Folder className="h-3.5 w-3.5" />}
        onClick={() => {
          // Open folder in system file manager
          safeInvoke('reveal_in_finder', { path: selectedProject.path });
        }}
      >
        Open Folder
      </Button>
    </div>
  ) : null;

  // Detail Content
  const detailContent = isCreating ? (
    <ProjectConfigPanel
      project={null}
      scenes={scenes}
      isEditing
      formData={newProject}
      onFormChange={updateNewProject}
      onSave={createProject}
      onCancel={cancelCreating}
      onBrowse={selectProjectFolder}
    />
  ) : selectedProject ? (
    <ProjectConfigPanel
      project={selectedProject}
      scene={selectedScene}
      scenes={scenes}
      onOpenFolder={() => console.log('Open folder:', selectedProject.path)}
      onChangeScene={(sceneId) => handleSceneChange(selectedProject.id, sceneId)}
      onSync={() => syncProject(selectedProject.id)}
      onClearConfig={() => clearProjectConfig(selectedProject.id)}
      onIconClick={(ref) => handleIconClick(selectedProject.id, ref)}
    />
  ) : null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header with Search and New Project button */}
      <PageHeader
        title="Projects"
        searchValue={filter.search}
        onSearchChange={(value) => setFilter({ search: value })}
        searchPlaceholder="Search projects..."
        actions={
          <Button variant="primary" size="small" icon={<Plus />} onClick={startCreating}>
            New Project
          </Button>
        }
      />

      {/* Main Content Area - with shrink animation */}
      <div
        className={`
          flex-1 overflow-y-auto px-7 py-6
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isDetailOpen ? 'mr-[800px]' : ''}
        `}
      >
        {/* Round 2 fix R2-3 banner: when the most recent syncProject run
            had a partial failure, list per-step outcomes so the user can
            see exactly which step blew up and which side-effects already
            landed on disk. Color tokens follow design-language
            `--color-error*` (same as MainLayout global error banner).
            "Clear & Retry" runs `clearProjectConfig` to put the project
            back into a known-clean state; "Dismiss" just hides the
            banner. */}
        {showSyncBanner && (
          <div
            role="alert"
            className="mb-4 rounded-md border px-4 py-3"
            style={{
              backgroundColor: 'var(--color-error-bg)',
              borderColor: 'var(--color-error)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-[13px] font-semibold" style={{ color: 'var(--color-error)' }}>
                  Sync did not complete
                  {syncBannerProject ? ` for "${syncBannerProject.name}"` : ''}
                </p>
                <ul
                  className="mt-2 flex flex-col gap-1 text-[12px]"
                  style={{ color: 'var(--color-error)' }}
                >
                  {syncStepResults?.map((s, idx) => (
                    <li key={`${s.step}-${idx}`} className="flex items-start gap-2">
                      <span className="mt-[2px] inline-block w-4 shrink-0 font-medium">
                        {s.ok ? '✓' : '✗'}
                      </span>
                      <span>
                        <span className="font-medium">{s.step}</span>
                        {!s.ok && s.error ? ` — ${s.error}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px]" style={{ color: 'var(--color-error)' }}>
                  The project may be in a half-synced state. Use "Clear &amp; Retry" to remove CC
                  Workshop-managed files and start over.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {syncBannerProject && (
                  <button
                    onClick={handleClearAndRetry}
                    className="rounded border px-2.5 py-1 text-[12px] font-medium hover:opacity-80"
                    style={{
                      color: 'var(--color-error)',
                      borderColor: 'var(--color-error)',
                    }}
                  >
                    Clear &amp; Retry
                  </button>
                )}
                <button
                  onClick={clearSyncResults}
                  className="text-[12px] font-medium hover:opacity-80"
                  style={{ color: 'var(--color-error)' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status line — count + context | View Options (Sort only; no Group).
            Hidden while the user is in the "create new project" flow so the
            inline NewProjectItem stays visually anchored. */}
        {!isCreating && filteredProjects.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#A1A1AA]">{statusText}</span>
            <ViewOptionsMenu
              sections={[
                {
                  id: 'sort',
                  label: 'SORT BY',
                  options: PROJECTS_SORT_OPTIONS,
                  value: sortBy,
                  onChange: (v) => setSortFor('projects', v),
                },
              ]}
            />
          </div>
        )}

        {/* Project Cards */}
        <div className="flex flex-col gap-3">
          {/* New Project Item (when creating) */}
          {isCreating && (
            <NewProjectItem
              name={newProject.name || 'New Project'}
              path={newProject.path || 'Click to configure path...'}
            />
          )}

          {/* Existing Project Cards */}
          {filteredProjects.length > 0 ? (
            filteredProjects.map((project) => {
              const scene = scenes.find((s) => s.id === project.sceneId);
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  scene={scene}
                  compact={isDetailOpen}
                  selected={selectedProjectId === project.id && !isCreating}
                  onClick={() => selectProject(project.id)}
                  onDelete={() => handleDeleteProject(project.id)}
                />
              );
            })
          ) : !isCreating ? (
            // No results from search
            <div className="flex h-full items-center justify-center py-20">
              <EmptyState
                icon={<Folder className="h-8 w-8" strokeWidth={1.5} />}
                title="No matching projects"
                description="Try adjusting your search query"
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Slide Panel for Detail View */}
      <SlidePanel
        isOpen={isDetailOpen}
        onClose={handleCloseDetail}
        width={800}
        header={detailHeader}
        headerRight={detailHeaderRight}
      >
        {detailContent}
      </SlidePanel>

      {/* Icon Picker */}
      {iconPickerState.triggerRef && (
        <IconPicker
          value={projects.find((p) => p.id === iconPickerState.projectId)?.icon || 'folder'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}
    </div>
  );
}

export default ProjectsPage;
