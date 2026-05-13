import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Plug, FileText, ScrollText } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import { SkillListItem } from '../components/skills/SkillListItem';
import { SkillDetailPanel } from '../components/skills/SkillDetailPanel';
import { McpListItem } from '../components/mcps/McpListItem';
import { McpDetailPanel } from '../components/mcps/McpDetailPanel';
import { ClaudeMdCard } from '../components/claude-md/ClaudeMdCard';
import { ClaudeMdDetailPanel } from '../components/claude-md/ClaudeMdDetailPanel';
import { RuleCard } from '../components/rules/RuleCard';
import { RuleDetailPanel } from '../components/rules/RuleDetailPanel';
import { FilteredEmptyState } from '../components/common/FilteredEmptyState';
import Button from '../components/common/Button';
import { useAppStore } from '../stores/appStore';
import { useSkillsStore } from '../stores/skillsStore';
import { useMcpsStore } from '../stores/mcpsStore';
import { useClaudeMdStore } from '../stores/claudeMdStore';
import { useRulesStore } from '../stores/rulesStore';
import { collectDescendantIds } from '@/utils/categoryTree';
import type { Skill } from '../types';

// ============================================================================
// CategoryPage Component
// ============================================================================
// Independent aggregation page showing all Skills and MCPs under a Category

export function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [search, setSearch] = useState('');

  // Selected item state for detail panels - track ID only
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const [selectedClaudeMdId, setSelectedClaudeMdId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  // Get data from stores
  const { categories } = useAppStore();
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
  const {
    rules,
    deleteRule,
    autoClassify: autoClassifyRules,
    isAutoClassifying: isRulesClassifying,
  } = useRulesStore();
  // Button reflects ANY active classification run across all four types so
  // the user does not see the spinner stop while other runs are still in flight.
  const isClassifying =
    isSkillsClassifying || isMcpsClassifying || isClaudeMdClassifying || isRulesClassifying;

  // Find current category
  const category = categories.find((c) => c.id === categoryId);
  // Get category name for header display (skill.category stores name, not id)
  const categoryName = category?.name;

  // D7=A aggregated view: parent categories show self + all descendants;
  // child categories show only self (max depth=2 → typically just self).
  // collectDescendantIds is depth-agnostic and includes the root id itself.
  const visibleIds = useMemo(
    () => (categoryId ? collectDescendantIds(categoryId, categories) : new Set<string>()),
    [categoryId, categories],
  );

  // Backward-compat name set: pre-D1 migration, Skills/MCPs reference
  // categories by name (`s.category`). After T1e migrates `category_id`
  // metadata, the id path takes precedence; this name set is the fallback
  // for entries the migration has not yet reached (or that arrived through
  // legacy import paths).
  const visibleNames = useMemo(
    () => new Set(categories.filter((c) => visibleIds.has(c.id)).map((c) => c.name)),
    [categories, visibleIds],
  );

  // Get selected skill/mcp/claudeMd/rule objects
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
  const selectedRule = useMemo(
    () => rules.find((r) => r.id === selectedRuleId) || null,
    [rules, selectedRuleId],
  );

  // Filter skills, mcps, claudeMd, and rules by category (dual-read where
  // applicable), then by search.
  const filteredData = useMemo(() => {
    // Dual-read: prefer canonical `categoryId` (post-T1e migration); fall back
    // to legacy `category` name match for pre-migration entries. CLAUDE.md and
    // Rules already use id-only references (no legacy name field).
    const categorySkills = skills.filter((s) =>
      s.categoryId ? visibleIds.has(s.categoryId) : visibleNames.has(s.category),
    );
    const categoryMcps = mcpServers.filter((m) =>
      m.categoryId ? visibleIds.has(m.categoryId) : visibleNames.has(m.category),
    );
    const categoryClaudeMd = claudeMdFiles.filter(
      (f) => f.categoryId !== undefined && visibleIds.has(f.categoryId),
    );
    const categoryRules = rules.filter(
      (r) => r.categoryId !== undefined && visibleIds.has(r.categoryId),
    );

    // Then filter by search if search is active
    if (!search) {
      return {
        skills: categorySkills,
        mcps: categoryMcps,
        claudeMd: categoryClaudeMd,
        rules: categoryRules,
      };
    }

    const searchLower = search.toLowerCase();
    return {
      skills: categorySkills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(searchLower) ||
          skill.description.toLowerCase().includes(searchLower),
      ),
      mcps: categoryMcps.filter(
        (mcp) =>
          mcp.name.toLowerCase().includes(searchLower) ||
          mcp.description.toLowerCase().includes(searchLower),
      ),
      claudeMd: categoryClaudeMd.filter(
        (file) =>
          file.name.toLowerCase().includes(searchLower) ||
          file.description.toLowerCase().includes(searchLower),
      ),
      rules: categoryRules.filter(
        (rule) =>
          rule.name.toLowerCase().includes(searchLower) ||
          rule.description.toLowerCase().includes(searchLower),
      ),
    };
  }, [skills, mcpServers, claudeMdFiles, rules, visibleIds, visibleNames, search]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleSkillClick = (skill: Skill) => {
    setSelectedSkillId(skill.id);
    setSelectedMcpId(null);
    setSelectedClaudeMdId(null);
    setSelectedRuleId(null);
  };

  const handleMcpClick = (mcpId: string) => {
    setSelectedMcpId(mcpId);
    setSelectedSkillId(null);
    setSelectedClaudeMdId(null);
    setSelectedRuleId(null);
  };

  const handleClaudeMdClick = (fileId: string) => {
    setSelectedClaudeMdId(fileId);
    setSelectedSkillId(null);
    setSelectedMcpId(null);
    setSelectedRuleId(null);
  };

  const handleRuleClick = (ruleId: string) => {
    setSelectedRuleId(ruleId);
    setSelectedSkillId(null);
    setSelectedMcpId(null);
    setSelectedClaudeMdId(null);
  };

  const handleSkillDelete = (skillId: string) => {
    deleteSkill(skillId);
    if (selectedSkillId === skillId) {
      setSelectedSkillId(null);
    }
  };

  const handleMcpDelete = (mcpId: string) => {
    deleteMcp(mcpId);
    if (selectedMcpId === mcpId) {
      setSelectedMcpId(null);
    }
  };

  const handleClaudeMdDelete = (fileId: string) => {
    deleteClaudeMd(fileId);
    if (selectedClaudeMdId === fileId) {
      setSelectedClaudeMdId(null);
    }
  };

  const handleRuleDelete = (ruleId: string) => {
    deleteRule(ruleId);
    if (selectedRuleId === ruleId) {
      setSelectedRuleId(null);
    }
  };

  const handleAutoClassify = async () => {
    // Classify all four item types within the current category scope.
    // `visibleIds` already includes descendants (collectDescendantIds), so
    // each store filters its items by the same hierarchical match. Run them
    // in parallel — the backend serialises behind the Claude CLI subprocess
    // anyway, but the spinner duration stays close to max() rather than sum().
    const scope = { categoryIds: visibleIds };
    await Promise.all([
      autoClassifySkills(scope),
      autoClassifyMcps(scope),
      autoClassifyClaudeMd(scope),
      autoClassifyRules(scope),
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

  const handleCloseRulePanel = () => {
    setSelectedRuleId(null);
  };

  const isEmpty =
    filteredData.skills.length === 0 &&
    filteredData.mcps.length === 0 &&
    filteredData.claudeMd.length === 0 &&
    filteredData.rules.length === 0;
  const displayCategoryName = categoryName || 'Unknown Category';

  // Check if any panel is open for layout adjustment
  const isPanelOpen =
    !!selectedSkillId || !!selectedMcpId || !!selectedClaudeMdId || !!selectedRuleId;

  // Empty state
  if (isEmpty && !search) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        <PageHeader
          title={displayCategoryName}
          searchValue={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Search..."
          actions={
            <Button
              variant="secondary"
              size="small"
              icon={isClassifying ? <span className="ai-spinner" /> : <Sparkles />}
              onClick={handleAutoClassify}
              disabled={isClassifying || isEmpty}
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
        <div className="flex-1">
          <FilteredEmptyState type="category" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        title={displayCategoryName}
        searchValue={search}
        onSearchChange={handleSearchChange}
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
        {isEmpty ? (
          // Search returned no results
          <FilteredEmptyState type="category" />
        ) : (
          <div className="flex flex-col gap-8">
            {/* Skills Section */}
            {filteredData.skills.length > 0 && (
              <section className="flex flex-col gap-3">
                {/* Section Header */}
                <div className="flex items-center gap-2 pb-2">
                  <Sparkles size={14} className="text-[#71717A]" />
                  <span className="text-xs font-semibold text-[#71717A]">
                    Skills ({filteredData.skills.length})
                  </span>
                </div>
                {/* Skill Items */}
                <div className="flex flex-col gap-3">
                  {filteredData.skills.map((skill) => (
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

            {/* MCP Section */}
            {filteredData.mcps.length > 0 && (
              <section className="flex flex-col gap-3">
                {/* Section Header */}
                <div className="flex items-center gap-2 pb-2">
                  <Plug size={14} className="text-[#71717A]" />
                  <span className="text-xs font-semibold text-[#71717A]">
                    MCP Servers ({filteredData.mcps.length})
                  </span>
                </div>
                {/* MCP Items */}
                <div className="flex flex-col gap-3">
                  {filteredData.mcps.map((mcp) => (
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
            {filteredData.claudeMd.length > 0 && (
              <section className="flex flex-col gap-3">
                {/* Section Header */}
                <div className="flex items-center gap-2 pb-2">
                  <FileText size={14} className="text-[#71717A]" />
                  <span className="text-xs font-semibold text-[#71717A]">
                    CLAUDE.md Files ({filteredData.claudeMd.length})
                  </span>
                </div>
                {/* CLAUDE.md Items */}
                <div className="flex flex-col gap-3">
                  {filteredData.claudeMd.map((file) => (
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

            {/* Rules Section */}
            {filteredData.rules.length > 0 && (
              <section className="flex flex-col gap-3">
                {/* Section Header */}
                <div className="flex items-center gap-2 pb-2">
                  <ScrollText size={14} className="text-[#71717A]" />
                  <span className="text-xs font-semibold text-[#71717A]">
                    Rules ({filteredData.rules.length})
                  </span>
                </div>
                {/* Rule Items */}
                <div className="flex flex-col gap-3">
                  {filteredData.rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      compact={isPanelOpen}
                      onClick={() => handleRuleClick(rule.id)}
                      onDelete={() => handleRuleDelete(rule.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
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

      {/* Rule Detail Panel - Always render, control visibility with isOpen */}
      <RuleDetailPanel
        rule={selectedRule}
        isOpen={!!selectedRuleId}
        onClose={handleCloseRulePanel}
      />
    </div>
  );
}

export default CategoryPage;
