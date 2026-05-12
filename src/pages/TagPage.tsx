import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Plug, FileText } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useSkillsStore } from '@/stores/skillsStore';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useClaudeMdStore } from '@/stores/claudeMdStore';
import PageHeader from '@/components/layout/PageHeader';
import { SkillListItem } from '@/components/skills/SkillListItem';
import { SkillDetailPanel } from '@/components/skills/SkillDetailPanel';
import { McpListItem } from '@/components/mcps/McpListItem';
import { McpDetailPanel } from '@/components/mcps/McpDetailPanel';
import { ClaudeMdCard } from '@/components/claude-md/ClaudeMdCard';
import { ClaudeMdDetailPanel } from '@/components/claude-md/ClaudeMdDetailPanel';
import { FilteredEmptyState } from '@/components/common/FilteredEmptyState';
import Button from '@/components/common/Button';
import type { Skill } from '@/types';

// ============================================================================
// TagPage Component
// ============================================================================
// Displays all Skills and MCPs that have a specific tag.
// Route: /tag/:tagId

export function TagPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const [search, setSearch] = useState('');

  // Selected item state for detail panels - track ID only
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const [selectedClaudeMdId, setSelectedClaudeMdId] = useState<string | null>(null);

  // Get data from stores
  const { tags } = useAppStore();
  const {
    skills,
    deleteSkill,
    autoClassify: autoClassifySkills,
    isClassifying: isSkillsClassifying,
  } = useSkillsStore();
  const {
    mcpServers,
    deleteMcp,
    autoClassify: autoClassifyMcps,
    isClassifying: isMcpsClassifying,
  } = useMcpsStore();
  const {
    files: claudeMdFiles,
    deleteFile: deleteClaudeMd,
    autoClassify: autoClassifyClaudeMd,
    isAutoClassifying: isClaudeMdClassifying,
  } = useClaudeMdStore();
  // Same OR'd state as CategoryPage so the spinner reflects all three
  // type-scoped runs.
  const isClassifying = isSkillsClassifying || isMcpsClassifying || isClaudeMdClassifying;

  // Find the current tag
  const tag = tags.find((t) => t.id === tagId);
  // Get tag name for filtering (skill.tags stores tag names, not ids)
  const tagName = tag?.name;

  // Get selected skill/mcp/claudeMd objects
  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) || null,
    [skills, selectedSkillId],
  );
  const selectedMcp = useMemo(
    () => mcpServers.find((m) => m.id === selectedMcpId) || null,
    [mcpServers, selectedMcpId],
  );
  const selectedClaudeMd = useMemo(
    () => claudeMdFiles.find((f) => f.id === selectedClaudeMdId) || null,
    [claudeMdFiles, selectedClaudeMdId],
  );

  // Filter skills and MCPs that have this tag (using tag name, not id)
  // For claudeMd, filter by tagIds (uses tag ID, not name)
  const filteredSkills = skills.filter((s) => tagName && s.tags.includes(tagName));
  const filteredMcps = mcpServers.filter((m) => tagName && m.tags.includes(tagName));
  const filteredClaudeMd = claudeMdFiles.filter((f) => tagId && f.tagIds?.includes(tagId));

  // Apply search filter
  const searchLower = search.toLowerCase();
  const displayedSkills = search
    ? filteredSkills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(searchLower) ||
          skill.description.toLowerCase().includes(searchLower),
      )
    : filteredSkills;

  const displayedMcps = search
    ? filteredMcps.filter(
        (mcp) =>
          mcp.name.toLowerCase().includes(searchLower) ||
          mcp.description.toLowerCase().includes(searchLower),
      )
    : filteredMcps;

  const displayedClaudeMd = search
    ? filteredClaudeMd.filter(
        (file) =>
          file.name.toLowerCase().includes(searchLower) ||
          file.description.toLowerCase().includes(searchLower),
      )
    : filteredClaudeMd;

  // Handlers
  const handleSkillClick = (skill: Skill) => {
    setSelectedSkillId(skill.id);
    setSelectedMcpId(null);
    setSelectedClaudeMdId(null);
  };

  const handleSkillDelete = (skillId: string) => {
    deleteSkill(skillId);
    if (selectedSkillId === skillId) {
      setSelectedSkillId(null);
    }
  };

  const handleMcpClick = (mcpId: string) => {
    setSelectedMcpId(mcpId);
    setSelectedSkillId(null);
    setSelectedClaudeMdId(null);
  };

  const handleMcpDelete = (mcpId: string) => {
    deleteMcp(mcpId);
    if (selectedMcpId === mcpId) {
      setSelectedMcpId(null);
    }
  };

  const handleClaudeMdClick = (fileId: string) => {
    setSelectedClaudeMdId(fileId);
    setSelectedSkillId(null);
    setSelectedMcpId(null);
  };

  const handleClaudeMdDelete = (fileId: string) => {
    deleteClaudeMd(fileId);
    if (selectedClaudeMdId === fileId) {
      setSelectedClaudeMdId(null);
    }
  };

  const handleAutoClassify = async () => {
    // Same parallel pattern as CategoryPage — classify all three item types
    // restricted to the current tag.
    if (!tagId) return;
    const scope = { tagId };
    await Promise.all([
      autoClassifySkills(scope),
      autoClassifyMcps(scope),
      autoClassifyClaudeMd(scope),
    ]);
  };

  const handleCloseSkillPanel = () => {
    setSelectedSkillId(null);
  };

  const handleCloseMcpPanel = () => {
    setSelectedMcpId(null);
  };

  const handleCloseClaudeMdPanel = () => {
    setSelectedClaudeMdId(null);
  };

  // Check if any panel is open for layout adjustment
  const isPanelOpen = !!selectedSkillId || !!selectedMcpId || !!selectedClaudeMdId;

  // Empty state - no items with this tag at all
  if (filteredSkills.length === 0 && filteredMcps.length === 0 && filteredClaudeMd.length === 0) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        <PageHeader
          title={tag?.name || 'Unknown Tag'}
          searchValue=""
          onSearchChange={() => {}}
          searchPlaceholder="Search..."
        />
        <div className="flex-1">
          <FilteredEmptyState type="tag" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        title={tag?.name || 'Unknown Tag'}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search..."
        actions={
          <Button
            variant="secondary"
            size="small"
            icon={isClassifying ? <span className="ai-spinner" /> : <Sparkles />}
            onClick={handleAutoClassify}
            disabled={isClassifying}
            className={`w-[132px] ${isClassifying ? 'ai-classifying' : ''}`}
          >
            {isClassifying ? (
              <span className="ai-classifying-text">Classifying...</span>
            ) : (
              'Auto Classify'
            )}
          </Button>
        }
      />

      {/* Content - with shrink animation matching SkillsPage */}
      <div
        className={`
          flex-1 overflow-y-auto px-7 py-6
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isPanelOpen ? 'mr-[800px]' : ''}
        `}
      >
        <div className="flex flex-col gap-8">
          {/* Skills Section */}
          {displayedSkills.length > 0 && (
            <section className="flex flex-col gap-3">
              {/* Section Header */}
              <div className="flex items-center gap-2 pb-2">
                <Sparkles size={14} className="text-[#71717A]" />
                <span className="text-xs font-semibold text-[#71717A]">
                  Skills ({displayedSkills.length})
                </span>
              </div>
              {/* Skills List */}
              <div className="flex flex-col gap-3">
                {displayedSkills.map((skill) => (
                  <SkillListItem
                    key={skill.id}
                    skill={skill}
                    compact={isPanelOpen}
                    selected={selectedSkillId === skill.id}
                    onClick={() => handleSkillClick(skill)}
                    onDelete={() => handleSkillDelete(skill.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* MCP Servers Section */}
          {displayedMcps.length > 0 && (
            <section className="flex flex-col gap-3">
              {/* Section Header */}
              <div className="flex items-center gap-2 pb-2">
                <Plug size={14} className="text-[#71717A]" />
                <span className="text-xs font-semibold text-[#71717A]">
                  MCP Servers ({displayedMcps.length})
                </span>
              </div>
              {/* MCP List */}
              <div className="flex flex-col gap-3">
                {displayedMcps.map((mcp) => (
                  <McpListItem
                    key={mcp.id}
                    mcp={mcp}
                    compact={isPanelOpen}
                    selected={selectedMcpId === mcp.id}
                    onClick={handleMcpClick}
                    onDelete={() => handleMcpDelete(mcp.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* CLAUDE.md Section */}
          {displayedClaudeMd.length > 0 && (
            <section className="flex flex-col gap-3">
              {/* Section Header */}
              <div className="flex items-center gap-2 pb-2">
                <FileText size={14} className="text-[#71717A]" />
                <span className="text-xs font-semibold text-[#71717A]">
                  CLAUDE.md Files ({displayedClaudeMd.length})
                </span>
              </div>
              {/* CLAUDE.md List */}
              <div className="flex flex-col gap-3">
                {displayedClaudeMd.map((file) => (
                  <ClaudeMdCard
                    key={file.id}
                    file={file}
                    compact={isPanelOpen}
                    onClick={() => handleClaudeMdClick(file.id)}
                    onDelete={() => handleClaudeMdDelete(file.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty search results */}
          {displayedSkills.length === 0 &&
            displayedMcps.length === 0 &&
            displayedClaudeMd.length === 0 &&
            search && (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-sm text-[#71717A]">No results found for "{search}"</p>
              </div>
            )}
        </div>
      </div>

      {/* Skill Detail Panel - Always render, control visibility with isOpen */}
      <SkillDetailPanel
        skill={selectedSkill}
        isOpen={!!selectedSkillId}
        onClose={handleCloseSkillPanel}
      />

      {/* MCP Detail Panel - Always render, control visibility with isOpen */}
      <McpDetailPanel mcp={selectedMcp} isOpen={!!selectedMcpId} onClose={handleCloseMcpPanel} />

      {/* CLAUDE.md Detail Panel - Always render, control visibility with isOpen */}
      <ClaudeMdDetailPanel
        file={selectedClaudeMd}
        isOpen={!!selectedClaudeMdId}
        onClose={handleCloseClaudeMdPanel}
      />
    </div>
  );
}

export default TagPage;
