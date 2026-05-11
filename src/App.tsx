import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import SkillsPage from './pages/SkillsPage';
import McpServersPage from './pages/McpServersPage';
import ClaudeMdPage from './pages/ClaudeMdPage';
import ScenesPage from './pages/ScenesPage';
import ProjectsPage from './pages/ProjectsPage';
import SettingsPage from './pages/SettingsPage';
import CategoryPage from './pages/CategoryPage';
import TagPage from './pages/TagPage';
import SkillMarketplacePage from './pages/SkillMarketplacePage';
import McpMarketplacePage from './pages/McpMarketplacePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          {/* Default landing — Skill Marketplace (discovery surface,
              entry point of the V2 closed loop). */}
          <Route index element={<Navigate to="/marketplace-skills" replace />} />
          {/* Marketplace routes — declared before Skills/MCP to mirror the
              Sidebar's visual ordering (Marketplace above Navigation). */}
          <Route path="marketplace-skills" element={<SkillMarketplacePage />} />
          <Route path="marketplace-mcps" element={<McpMarketplacePage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="mcp-servers" element={<McpServersPage />} />
          <Route path="claude-md" element={<ClaudeMdPage />} />
          <Route path="scenes" element={<ScenesPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="category/:categoryId" element={<CategoryPage />} />
          <Route path="tag/:tagId" element={<TagPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
