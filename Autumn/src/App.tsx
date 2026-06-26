import { useLayoutEffect, useState } from 'react';
import {
  AuthDialog,
  type AuthDialogMode,
} from './business-components/Auth/AuthDialog';
import { EditorPage } from './pages/Editor/EditorPage';
import { HomePage } from './pages/Home/HomePage';
import { useAppStore } from './store/appStore';
import { useUserStore } from './store/userStore';

const designViewport = {
  width: 2560,
  height: 1440,
};

function useDesignViewportScale() {
  useLayoutEffect(() => {
    function updateScale() {
      const scale = Math.min(
        1,
        window.innerWidth / designViewport.width,
        window.innerHeight / designViewport.height,
      );
      const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

      document.documentElement.style.setProperty('--app-scale', `${safeScale}`);
      document.documentElement.style.setProperty(
        '--app-viewport-width',
        `${window.innerWidth / safeScale}px`,
      );
      document.documentElement.style.setProperty(
        '--app-viewport-height',
        `${window.innerHeight / safeScale}px`,
      );
    }

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);
}

function App() {
  useDesignViewportScale();
  const { state, createProject, openHome, openProject, projects, setTheme } = useAppStore();
  const user = useUserStore();
  const { profile, session } = user;
  const [authDialogMode, setAuthDialogMode] = useState<AuthDialogMode>('login');
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  function openAuthDialog(mode: AuthDialogMode = 'login') {
    setAuthDialogMode(mode);
    setIsAuthDialogOpen(true);
  }

  const authDialog = (
    <AuthDialog
      isAuthenticated={user.isAuthenticated}
      mode={authDialogMode}
      open={isAuthDialogOpen}
      userProfile={profile}
      onAuthenticated={user.setSession}
      onClose={() => setIsAuthDialogOpen(false)}
      onModeChange={setAuthDialogMode}
      onSignOut={() => {
        user.signOut();
        setIsAuthDialogOpen(false);
      }}
    />
  );

  if (state.view === 'home') {
    return (
      <>
        <HomePage
          isAuthenticated={user.isAuthenticated}
          projects={projects}
          theme={state.theme}
          userProfile={profile}
          onCreateProject={createProject}
          onOpenAuth={openAuthDialog}
          onOpenProject={openProject}
          onThemeChange={setTheme}
        />
        {authDialog}
      </>
    );
  }

  return (
    <>
      <EditorPage
        authSession={session}
        isAuthenticated={user.isAuthenticated}
        projectId={state.selectedProject?.id}
        projectSnapshot={state.selectedProject?.latestSnapshot}
        projectTitle={state.selectedProject?.title}
        userProfile={profile}
        onBackToHome={openHome}
        onOpenAuth={openAuthDialog}
      />
      {authDialog}
    </>
  );
}

export default App;
