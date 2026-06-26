import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasPreview } from '../../business-components/CanvasPreview/CanvasPreview';
import { ChatPanel } from '../../business-components/ChatPanel/ChatPanel';
import { DocumentPanel } from '../../business-components/DocumentPanel/DocumentPanel';
import { MediaPanel } from '../../business-components/MediaPanel/MediaPanel';
import { StoryboardPanel } from '../../business-components/Storyboard/StoryboardPanel';
import { TimelinePanel } from '../../business-components/Timeline/TimelinePanel';
import { TopBar } from '../../business-components/TopBar/TopBar';
import { EmptyState } from '../../components/EmptyState';
import { createProjectSnapshotPayload } from '../../adapters/projects/mapProjectSnapshot';
import {
  createUploadPlaceholderAssets,
  uploadConfiguredAssets,
} from '../../services/assets/assetRepository';
import {
  revokeAssetsObjectUrls,
  revokeReplacedAssetObjectUrls,
} from '../../services/assets/objectUrlLifecycle';
import { createAssetsFromGenerationTask } from '../../services/generation/createAssetsFromGenerationTask';
import { createConfiguredGenerationTask } from '../../services/generation/generationTaskRepository';
import { runConfiguredLlmChatTask } from '../../services/generation/llmChatRepository';
import { createStoryboardRegenerationTaskInput } from '../../services/generation/createStoryboardRegenerationTaskInput';
import { syncShotToTimeline } from '../../services/orchestration/syncShotToTimeline';
import { runConfiguredTextAgentTask } from '../../services/workbench/textAgentRepository';
import { useProjectExportTask } from '../../services/projects/useProjectExportTask';
import { useProjectAutosave } from '../../services/projects/useProjectAutosave';
import { useProjectSnapshotRestore } from '../../services/projects/useProjectSnapshotRestore';
import { useAgentPackageStore } from '../../store/agentPackageStore';
import { useGenerationTaskStore } from '../../store/generationTaskStore';
import { useModelConfigStore } from '../../store/modelConfigStore';
import { useParamStore } from '../../store/paramStore';
import { useSkillLibraryStore } from '../../store/skillLibraryStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { CreateGenerationTaskRequestDto } from '../../api/generation/generationTaskDto';
import type { CreateTextAgentRunRequestDto } from '../../api/workbench/textAgentDto';
import type { AuthDialogMode } from '../../business-components/Auth/AuthDialog';
import type { DocumentItem, StoryboardElement, TimelineTrack, WorkspacePanel } from '../../types/pipeline';
import type { ProjectSnapshot, ProjectSnapshotPayload } from '../../types/project';
import type { AuthSession, UserProfile } from '../../types/user';
import { classNames } from '../../utils/classNames';
import { getGenerationTaskErrorMessage } from '../../utils/generationTaskDisplay';

interface EditorPageProps {
  authSession?: AuthSession;
  isAuthenticated?: boolean;
  projectId?: string;
  projectTitle?: string;
  projectSnapshot?: ProjectSnapshot;
  userProfile?: UserProfile | null;
  onBackToHome?: () => void;
  onOpenAuth?: (mode?: AuthDialogMode) => void;
}

const emptyStoryboardElement: StoryboardElement = {
  id: 'empty-preview',
  name: '',
  type: 'shot',
  description: '',
  status: 'pending',
  assets: [],
};

function getNextNewProjectPanels(
  currentPanels: WorkspacePanel[],
  panel: WorkspacePanel,
): WorkspacePanel[] {
  if (currentPanels.includes(panel)) {
    return currentPanels.filter((item) => item !== panel);
  }

  if (panel === 'document') {
    return ['document'];
  }

  if (panel === 'storyboard') {
    return currentPanels.includes('media') ? ['storyboard', 'media'] : ['storyboard'];
  }

  if (panel === 'media') {
    if (currentPanels.includes('storyboard')) {
      return ['storyboard', 'media'];
    }

    if (currentPanels.includes('timeline')) {
      return ['media', 'timeline'];
    }

    return ['media'];
  }

  if (panel === 'timeline') {
    return currentPanels.includes('media') ? ['media', 'timeline'] : ['timeline'];
  }

  return [panel];
}

export function EditorPage({
  authSession,
  isAuthenticated = false,
  projectId,
  projectTitle,
  projectSnapshot,
  userProfile,
  onBackToHome,
  onOpenAuth,
}: EditorPageProps) {
  const isNewProject = !projectTitle || projectTitle === '无标题';
  const [newProjectPanels, setNewProjectPanels] = useState<WorkspacePanel[]>([]);
  const [newProjectDocuments, setNewProjectDocuments] = useState<DocumentItem[]>([]);
  const [newProjectStoryboardElements, setNewProjectStoryboardElements] = useState<StoryboardElement[]>([]);
  const [newProjectTimelineTracks, setNewProjectTimelineTracks] = useState<TimelineTrack[]>([]);
  const [newProjectSelectedElementId, setNewProjectSelectedElementId] = useState<string | null>(null);
  const [newProjectSelectedTimelineClipId, setNewProjectSelectedTimelineClipId] = useState<string | null>(null);
  const [selectedMediaAssetId, setSelectedMediaAssetId] = useState<string | null>(null);
  const agentPackages = useAgentPackageStore();
  const modelConfig = useModelConfigStore(authSession);
  const skillLibrary = useSkillLibraryStore(agentPackages.activePackage);
  const {
    state,
    dispatch,
    chatMessages,
    documents,
    assets,
    storyboardElements,
    selectedElement,
    timelineTracks,
  } = useWorkspaceStore();
  const latestAssetsRef = useRef(assets);
  const deletedUploadAssetIdsRef = useRef(new Set<string>());
  const activeAssets = useMemo(() => (isNewProject ? [] : assets), [assets, isNewProject]);
  const generationTasks = useGenerationTaskStore(activeAssets, {
    authSession,
    enabled: Boolean(projectId) && !isNewProject,
  });
  const paramStore = useParamStore();
  const restoreProjectSnapshot = useCallback(
    (payload: ProjectSnapshotPayload) => {
      dispatch({ type: 'hydrateProjectSnapshot', payload });
    },
    [dispatch],
  );
  const projectRestore = useProjectSnapshotRestore({
    projectId,
    enabled: Boolean(projectId) && !isNewProject,
    initialSnapshot: projectSnapshot,
    onRestore: restoreProjectSnapshot,
  });
  const effectiveProjectTitle =
    projectRestore.restoredSnapshot ? state.projectTitle : projectTitle ?? state.projectTitle;
  const snapshotPayload = useMemo(
    () =>
      createProjectSnapshotPayload({
        projectTitle: effectiveProjectTitle,
        stage: state.stage,
        chatFlowState: state.chatFlowState,
        workspaceState: state.workspaceState,
        storyboardElements: isNewProject ? [] : storyboardElements,
        timelineTracks: isNewProject ? [] : timelineTracks,
        assets: activeAssets,
        documents: isNewProject ? [] : documents,
        creditBalance: state.creditBalance,
      }),
    [
      activeAssets,
      documents,
      effectiveProjectTitle,
      isNewProject,
      state.chatFlowState,
      state.creditBalance,
      state.stage,
      state.workspaceState,
      storyboardElements,
      timelineTracks,
    ],
  );

  const projectSave = useProjectAutosave({
    projectId,
    payload: snapshotPayload,
    enabled: Boolean(projectId) && !isNewProject,
  });
  const projectExport = useProjectExportTask({
    projectId,
    enabled: Boolean(projectId) && !isNewProject,
  });

  const openPanels = isNewProject ? newProjectPanels : state.openPanels;
  const visibleStoryboardElements = isNewProject ? newProjectStoryboardElements : storyboardElements;
  const visibleTimelineTracks = isNewProject ? newProjectTimelineTracks : timelineTracks;
  const visibleSelectedElementId =
    isNewProject
      ? newProjectSelectedElementId ?? newProjectStoryboardElements[0]?.id ?? state.selectedElementId
      : state.selectedElementId;
  const visibleSelectedTimelineClipId = isNewProject
    ? newProjectSelectedTimelineClipId
    : state.selectedTimelineClipId;
  const visibleSelectedElement = isNewProject
    ? newProjectStoryboardElements.find((element) => element.id === visibleSelectedElementId)
      ?? emptyStoryboardElement
    : selectedElement;
  const showDocument = openPanels.includes('document');
  const showTimeline = openPanels.includes('timeline') || (!isNewProject && state.workspaceState === 'timelinePreview');
  const showStoryboard = openPanels.includes('storyboard') && !showDocument;
  const showMedia = openPanels.includes('media') && !showDocument;
  const showBlankStart = isNewProject && openPanels.length === 0;
  const showStoryboardOnly = isNewProject && showStoryboard && !showMedia && !showTimeline;
  const showMediaOnly = isNewProject && showMedia && !showStoryboard && !showTimeline;
  const showTimelineOnly = isNewProject && showTimeline && !showStoryboard && !showMedia;
  const showStoryboardMedia = isNewProject && showStoryboard && showMedia && !showTimeline;
  const showMediaTimeline = isNewProject && showMedia && showTimeline && !showStoryboard;
  const mediaAssets = !isNewProject && state.workspaceState === 'storyboardOverview' ? [] : assets;
  const selectedMediaAsset = useMemo(
    () => (isNewProject ? undefined : assets.find((asset) => asset.id === selectedMediaAssetId)),
    [assets, isNewProject, selectedMediaAssetId],
  );

  const layoutClassName = useMemo(
    () =>
      classNames(
        'editor-layout',
        showBlankStart && 'editor-layout--blank',
        showStoryboardOnly && 'editor-layout--wide-left',
        showMediaOnly && 'editor-layout--media-only',
        showTimelineOnly && 'editor-layout--timeline-only',
        showStoryboardMedia && 'editor-layout--storyboard-media',
        showMediaTimeline && 'editor-layout--media-timeline',
        showDocument && 'editor-layout--document',
      ),
    [
      showBlankStart,
      showDocument,
      showMediaOnly,
      showMediaTimeline,
      showStoryboardMedia,
      showStoryboardOnly,
      showTimelineOnly,
    ],
  );

  function handleTogglePanel(panel: WorkspacePanel) {
    if (!isNewProject) {
      dispatch({ type: 'togglePanel', panel });
      return;
    }

    setNewProjectPanels((current) => {
      return getNextNewProjectPanels(current, panel);
    });
  }

  const handleSelectMediaAsset = useCallback((assetId: string) => {
    setSelectedMediaAssetId(assetId);
  }, []);

  const handleNewProjectSkillDocumentGenerated = useCallback((document: DocumentItem) => {
    setNewProjectDocuments((current) => [
      document,
      ...current.map((item) => ({
        ...item,
        active: false,
      })),
    ]);
    setNewProjectPanels(['document']);
  }, []);

  const handleSkillDocumentGenerated = useCallback((document: DocumentItem) => {
    if (isNewProject) {
      handleNewProjectSkillDocumentGenerated(document);
      return;
    }

    dispatch({ type: 'upsertDocument', document });
  }, [dispatch, handleNewProjectSkillDocumentGenerated, isNewProject]);

  const handleSelectDocument = useCallback((documentId: string) => {
    if (isNewProject) {
      setNewProjectDocuments((current) =>
        current.map((document) => ({
          ...document,
          active: document.id === documentId,
        })),
      );
      setNewProjectPanels(['document']);
      return;
    }

    dispatch({ type: 'selectDocument', documentId });
  }, [dispatch, isNewProject]);

  const handleStoryboardElementsGenerated = useCallback((elements: StoryboardElement[]) => {
    if (!elements.length) {
      return;
    }

    if (isNewProject) {
      const timelineTracks = syncShotToTimeline(elements, []);
      const selectedElement = elements.find((element) => element.type === 'shot') ?? elements[0]!;
      const selectedClipId =
        timelineTracks
          .flatMap((track) => track.clips)
          .find((clip) => clip.sourceElementId === selectedElement.id)?.id ?? null;

      setNewProjectStoryboardElements(elements);
      setNewProjectTimelineTracks(timelineTracks);
      setNewProjectSelectedElementId(selectedElement.id);
      setNewProjectSelectedTimelineClipId(selectedClipId);
      setNewProjectPanels(selectedClipId ? ['storyboard', 'timeline'] : ['storyboard']);
      return;
    }

    dispatch({ type: 'replaceStoryboardElements', elements });
  }, [dispatch, isNewProject]);

  const updateNewProjectStoryboardElements = useCallback((
    updateElements: (currentElements: StoryboardElement[]) => StoryboardElement[],
  ) => {
    setNewProjectStoryboardElements((currentElements) => {
      const nextElements = updateElements(currentElements);

      setNewProjectTimelineTracks((currentTracks) => syncShotToTimeline(nextElements, currentTracks));
      return nextElements;
    });
  }, []);

  useEffect(() => {
    latestAssetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    return () => {
      revokeAssetsObjectUrls(latestAssetsRef.current);
    };
  }, []);

  const handleUploadMediaFiles = useCallback((files: File[]) => {
    const timestamp = Date.now();
    const placeholderAssets = createUploadPlaceholderAssets(files, timestamp);
    const placeholderAssetsById = new Map(placeholderAssets.map((asset) => [asset.id, asset]));
    const placeholderAssetIds = placeholderAssets.map((asset) => asset.id);

    placeholderAssetIds.forEach((assetId) => deletedUploadAssetIdsRef.current.delete(assetId));

    dispatch({ type: 'upsertAssets', assets: placeholderAssets });
    setSelectedMediaAssetId(placeholderAssets[0]?.id ?? null);

    void uploadConfiguredAssets(files, {
      authSession,
      projectId,
      timestamp,
      onProgress: ({ assetId, progress, status }) => {
        const placeholderAsset = placeholderAssetsById.get(assetId);

        if (!placeholderAsset || deletedUploadAssetIdsRef.current.has(assetId)) {
          return;
        }

        dispatch({
          type: 'upsertAssets',
          assets: [{ ...placeholderAsset, progress, status }],
        });
      },
    })
      .then((uploadedAssets) => {
        const activeUploadedAssets = uploadedAssets.filter(
          (asset) => !deletedUploadAssetIdsRef.current.has(asset.id),
        );
        const removedUploadedAssets = uploadedAssets.filter(
          (asset) => deletedUploadAssetIdsRef.current.has(asset.id),
        );

        revokeReplacedAssetObjectUrls(placeholderAssets, activeUploadedAssets);
        revokeAssetsObjectUrls(removedUploadedAssets);

        if (!activeUploadedAssets.length) {
          return;
        }

        dispatch({ type: 'upsertAssets', assets: activeUploadedAssets });
        setSelectedMediaAssetId((currentAssetId) => currentAssetId ?? activeUploadedAssets[0]?.id ?? null);
      })
      .catch(() => {
        const activePlaceholderAssets = placeholderAssets.filter(
          (asset) => !deletedUploadAssetIdsRef.current.has(asset.id),
        );

        if (!activePlaceholderAssets.length) {
          return;
        }

        dispatch({
          type: 'upsertAssets',
          assets: activePlaceholderAssets.map((asset) => ({
            ...asset,
            progress: 0,
            status: 'failed',
          })),
        });
      });
  }, [authSession, dispatch, projectId]);

  const handleToggleMediaFavorite = useCallback((assetId: string) => {
    dispatch({ type: 'toggleAssetFavorite', assetId });
  }, [dispatch]);

  const handleDeleteMediaAsset = useCallback((assetId: string) => {
    deletedUploadAssetIdsRef.current.add(assetId);
    revokeAssetsObjectUrls(latestAssetsRef.current.filter((asset) => asset.id === assetId));
    dispatch({ type: 'deleteAsset', assetId });
    setSelectedMediaAssetId((currentAssetId) => (currentAssetId === assetId ? null : currentAssetId));
  }, [dispatch]);

  const handleDeleteMediaAssets = useCallback((assetIds: string[]) => {
    assetIds.forEach((assetId) => deletedUploadAssetIdsRef.current.add(assetId));
    revokeAssetsObjectUrls(latestAssetsRef.current.filter((asset) => assetIds.includes(asset.id)));
    dispatch({ type: 'deleteAssets', assetIds });
    setSelectedMediaAssetId((currentAssetId) =>
      currentAssetId && assetIds.includes(currentAssetId) ? null : currentAssetId,
    );
  }, [dispatch]);

  const handleBindStoryboardParams = useCallback((elementId: string) => {
    dispatch({
      type: 'bindGenerationParamsToElement',
      elementId,
      params: paramStore.state,
    });
  }, [dispatch, paramStore.state]);

  const handleAddStoryboardShot = useCallback(() => {
    dispatch({
      type: 'addStoryboardShot',
      timestamp: Date.now(),
      params: paramStore.state,
    });
  }, [dispatch, paramStore.state]);

  const handleUpdateStoryboardElement = useCallback(
    (elementId: string, patch: { name: string; description: string }) => {
      dispatch({
        type: 'updateStoryboardElement',
        elementId,
        name: patch.name,
        description: patch.description,
      });
    },
    [dispatch],
  );

  const handleDuplicateStoryboardElement = useCallback((elementId: string) => {
    dispatch({
      type: 'duplicateStoryboardElement',
      elementId,
      timestamp: Date.now(),
    });
  }, [dispatch]);

  const handleDeleteStoryboardElement = useCallback((elementId: string) => {
    dispatch({ type: 'deleteStoryboardElement', elementId });
  }, [dispatch]);

  const handleReorderStoryboardElement = useCallback((elementId: string, toIndex: number) => {
    dispatch({
      type: 'reorderStoryboardElement',
      elementId,
      toIndex,
    });
  }, [dispatch]);

  const handleSelectStoryboardElement = useCallback((elementId: string) => {
    if (isNewProject) {
      const clipId =
        newProjectTimelineTracks
          .flatMap((track) => track.clips)
          .find((clip) => clip.sourceElementId === elementId)?.id ?? null;

      setNewProjectSelectedElementId(elementId);
      setNewProjectSelectedTimelineClipId(clipId);
      return;
    }

    dispatch({ type: 'selectElement', elementId });
  }, [dispatch, isNewProject, newProjectTimelineTracks]);

  const handleSelectTimelineClip = useCallback((clipId: string) => {
    if (isNewProject) {
      const clip = newProjectTimelineTracks
        .flatMap((track) => track.clips)
        .find((item) => item.id === clipId);

      setNewProjectSelectedTimelineClipId(clipId);
      setNewProjectSelectedElementId((currentElementId) => clip?.sourceElementId ?? currentElementId);
      return;
    }

    dispatch({ type: 'selectTimelineClip', clipId });
  }, [dispatch, isNewProject, newProjectTimelineTracks]);

  const runStoryboardElementGeneration = useCallback((element: StoryboardElement, timestamp = Date.now()) => {
    const regenerationParams = element.generationParams ?? paramStore.state;

    if (isNewProject) {
      updateNewProjectStoryboardElements((currentElements) =>
        currentElements.map((item) =>
          item.id === element.id
            ? {
                ...item,
                errorMessage: undefined,
                generationParams: regenerationParams,
                progress: 0,
                status: 'running',
              }
            : item,
        ),
      );
    } else {
      dispatch({
        type: 'markStoryboardElementRegenerating',
        elementId: element.id,
        params: regenerationParams,
      });
    }

    void createConfiguredGenerationTask(
      createStoryboardRegenerationTaskInput({
        element,
        modelOptions: modelConfig.models,
        params: regenerationParams,
        timestamp,
      }),
      { authSession },
    )
      .then((task) => {
        generationTasks.upsertTask(task);
        const targetElementId = task.sourceElementId ?? element.id;

        if (task.status === 'failed') {
          if (isNewProject) {
            updateNewProjectStoryboardElements((currentElements) =>
              currentElements.map((item) =>
                item.id === targetElementId
                  ? {
                      ...item,
                      errorMessage: getGenerationTaskErrorMessage(task),
                      progress: task.progress,
                      status: 'failed',
                    }
                  : item,
              ),
            );
          } else {
            dispatch({
              type: 'markStoryboardElementFailed',
              elementId: targetElementId,
              errorMessage: getGenerationTaskErrorMessage(task),
            });
          }
          return;
        }

        const generatedAssets = createAssetsFromGenerationTask(task);

        if (isNewProject) {
          updateNewProjectStoryboardElements((currentElements) =>
            currentElements.map((item) =>
              item.id === targetElementId
                ? {
                    ...item,
                    assets: generatedAssets.length > 0 ? generatedAssets : item.assets,
                    errorMessage: undefined,
                    progress: task.progress,
                    status: task.status,
                  }
                : item,
            ),
          );
          return;
        }

        dispatch({
          type: 'upsertGeneratedAssets',
          assets: generatedAssets,
          sourceElementId: targetElementId,
        });
      })
      .catch((error: unknown) => {
        if (isNewProject) {
          updateNewProjectStoryboardElements((currentElements) =>
            currentElements.map((item) =>
              item.id === element.id
                ? {
                    ...item,
                    errorMessage: getGenerationTaskErrorMessage(error),
                    status: 'failed',
                  }
                : item,
            ),
          );
          return;
        }

        dispatch({
          type: 'markStoryboardElementFailed',
          elementId: element.id,
          errorMessage: getGenerationTaskErrorMessage(error),
        });
      });
  }, [
    authSession,
    dispatch,
    generationTasks,
    isNewProject,
    modelConfig.models,
    paramStore.state,
    updateNewProjectStoryboardElements,
  ]);

  const handleRegenerateStoryboardElement = useCallback((elementId: string) => {
    const sourceElements = isNewProject ? newProjectStoryboardElements : storyboardElements;
    const element = sourceElements.find((item) => item.id === elementId);

    if (!element) {
      return;
    }

    runStoryboardElementGeneration(element);
  }, [
    isNewProject,
    newProjectStoryboardElements,
    runStoryboardElementGeneration,
    storyboardElements,
  ]);

  const handleGenerateAllStoryboardShots = useCallback(() => {
    const sourceElements = isNewProject ? newProjectStoryboardElements : storyboardElements;
    const shotElements = sourceElements.filter(
      (element) => element.type === 'shot' && element.status !== 'running',
    );
    const timestamp = Date.now();

    shotElements.forEach((element, index) => {
      runStoryboardElementGeneration(element, timestamp + index);
    });
  }, [
    isNewProject,
    newProjectStoryboardElements,
    runStoryboardElementGeneration,
    storyboardElements,
  ]);

  const handleSubmitGenerationTask = useCallback(
    async (input: CreateGenerationTaskRequestDto) => {
      const task = await createConfiguredGenerationTask(input, { authSession });
      generationTasks.upsertTask(task);
      dispatch({
        type: 'upsertGeneratedAssets',
        assets: createAssetsFromGenerationTask(task),
        sourceElementId: task.sourceElementId ?? state.selectedElementId,
      });
      return task;
    },
    [authSession, dispatch, generationTasks, state.selectedElementId],
  );

  const handleRunLlmChatTask = useCallback(
    async (input: CreateGenerationTaskRequestDto) => {
      const task = await runConfiguredLlmChatTask(input, { authSession });
      generationTasks.upsertTask(task);
      return task;
    },
    [authSession, generationTasks],
  );

  const handleRunCreativePipelineTask = useCallback(
    async (input: CreateTextAgentRunRequestDto) => {
      const task = await runConfiguredTextAgentTask(input, { authSession });
      generationTasks.upsertTask(task);
      return task;
    },
    [authSession, generationTasks],
  );

  useEffect(() => {
    if (isNewProject) {
      return undefined;
    }

    const activeTasks = generationTasks.tasks
      .filter((task) => ['pending', 'running'].includes(task.status))
      .filter((task) => !task.sourceAssetId)
      .slice(0, 4);

    if (!activeTasks.length) {
      return undefined;
    }

    const refreshTasks = () => {
      activeTasks.forEach((task) => {
        void generationTasks.refreshTask(task.id).then((updatedTask) => {
          if (!updatedTask) {
            return;
          }

          if (updatedTask.status === 'failed') {
            if (updatedTask.sourceElementId) {
              dispatch({
                type: 'markStoryboardElementFailed',
                elementId: updatedTask.sourceElementId,
                errorMessage: getGenerationTaskErrorMessage(updatedTask),
              });
            }

            return;
          }

          dispatch({
            type: 'upsertGeneratedAssets',
            assets: createAssetsFromGenerationTask(updatedTask),
            sourceElementId: updatedTask.sourceElementId ?? state.selectedElementId,
          });
        });
      });
    };

    const timer = window.setInterval(refreshTasks, 6000);
    return () => window.clearInterval(timer);
  }, [dispatch, generationTasks, isNewProject, state.selectedElementId]);

  useEffect(() => {
    if (!selectedMediaAssetId || assets.some((asset) => asset.id === selectedMediaAssetId)) {
      return;
    }

    setSelectedMediaAssetId(null);
  }, [assets, selectedMediaAssetId]);

  return (
    <div className="app" data-theme={state.theme}>
      <TopBar
        openPanels={openPanels}
        projectTitle={effectiveProjectTitle}
        stage={state.stage}
        theme={state.theme}
        creditBalance={state.creditBalance}
        isAuthenticated={isAuthenticated}
        userProfile={userProfile}
        activeAgentPackage={agentPackages.activePackage}
        agentPackages={agentPackages.state.packages}
        backendImportCandidate={agentPackages.backendImportCandidate}
        agentPackageImportError={agentPackages.state.importError}
        isImportingLocalAgentPackage={agentPackages.isImportingLocal}
        skills={skillLibrary.skills}
        enabledSkillIds={skillLibrary.enabledSkillIds}
        backendSkillImportCandidate={skillLibrary.backendImportCandidate}
        skillImportError={skillLibrary.state.importError}
        isImportingLocalSkill={skillLibrary.isImportingLocal}
        projectSave={{
          status: projectSave.status,
          lastSavedAt: projectSave.lastSavedAt,
          error: projectSave.error,
          snapshots: projectSave.snapshots,
          isLoadingSnapshots: projectSave.isLoadingSnapshots,
          canSave: Boolean(projectId) && !isNewProject,
          onManualSave: projectSave.saveNow,
        }}
        projectExport={{
          task: projectExport.task,
          isCreating: projectExport.isCreating,
          error: projectExport.error,
          canExport: Boolean(projectId) && !isNewProject,
          onStartExport: projectExport.startExport,
        }}
        onBackToHome={onBackToHome}
        onImportBackendAgentPackage={agentPackages.importBackendPackage}
        onImportLocalAgentPackage={agentPackages.importLocalPackage}
        onSwitchAgentPackage={agentPackages.switchPackage}
        onImportBackendSkill={skillLibrary.importBackendSkill}
        onImportLocalSkill={skillLibrary.importLocalSkill}
        onToggleSkill={skillLibrary.toggleSkill}
        onThemeChange={(theme) => dispatch({ type: 'setTheme', theme })}
        onTogglePanel={handleTogglePanel}
        onOpenAuth={onOpenAuth}
      />

      <main className={layoutClassName}>
        {showBlankStart ? (
          <section className="workspace-start-card">
            <EmptyState
              icon="Create"
              title="开始!"
              description="请在右侧聊天框中输入您的创作需求，开始创作吧!"
            />
          </section>
        ) : null}

        {!showBlankStart && showStoryboardOnly ? (
          <section className="wide-workspace">
            <StoryboardPanel
              currentGenerationParams={paramStore.state}
              elements={visibleStoryboardElements}
              selectedElementId={visibleSelectedElementId}
              onAddShot={handleAddStoryboardShot}
              onBindCurrentParams={handleBindStoryboardParams}
              onDeleteElement={handleDeleteStoryboardElement}
              onDuplicateElement={handleDuplicateStoryboardElement}
              onGenerateAllShots={handleGenerateAllStoryboardShots}
              onRegenerateElement={handleRegenerateStoryboardElement}
              onReorderElement={handleReorderStoryboardElement}
              onSelectElement={handleSelectStoryboardElement}
              onUpdateElement={handleUpdateStoryboardElement}
            />
          </section>
        ) : null}

        {!showBlankStart && showDocument ? (
          <section className="wide-workspace">
            <DocumentPanel
              documents={isNewProject ? newProjectDocuments : documents}
              onSelectDocument={handleSelectDocument}
            />
          </section>
        ) : null}

        {!showBlankStart && showTimelineOnly ? (
          <section className="timeline-workspace">
            <div className="timeline-black-preview">
              <div className="timeline-black-preview__screen" />
              <div className="timeline-black-preview__controls">
                <span>00:00</span>
                <button type="button" aria-label="播放">▶</button>
                <span>00:00</span>
                <span className="timeline-black-preview__icons">音量  适配  全屏</span>
              </div>
            </div>
            <TimelinePanel
              tracks={visibleTimelineTracks}
              selectedClipId={visibleSelectedTimelineClipId}
              onSelectClip={handleSelectTimelineClip}
            />
          </section>
        ) : null}

        {!showBlankStart && showMediaTimeline ? (
          <section className="media-timeline-workspace">
            <div className="media-timeline-workspace__media">
              <MediaPanel
                assets={isNewProject ? [] : mediaAssets}
                storyboardElements={visibleStoryboardElements}
                selectedAssetId={selectedMediaAssetId}
                onDeleteAsset={handleDeleteMediaAsset}
                onDeleteAssets={handleDeleteMediaAssets}
                onSelectAsset={handleSelectMediaAsset}
                onToggleFavorite={handleToggleMediaFavorite}
                onUploadFiles={handleUploadMediaFiles}
              />
            </div>
            <div className="media-timeline-workspace__preview">
              <CanvasPreview
                assets={isNewProject ? [] : assets}
                emptyPreview={isNewProject && visibleStoryboardElements.length === 0}
                selectedAsset={selectedMediaAsset}
                selectedElement={visibleSelectedElement}
                workspaceState={isNewProject ? 'skillCompleted' : state.workspaceState}
              />
            </div>
            <div className="media-timeline-workspace__timeline">
              <TimelinePanel
                tracks={visibleTimelineTracks}
                selectedClipId={visibleSelectedTimelineClipId}
                onSelectClip={handleSelectTimelineClip}
              />
            </div>
          </section>
        ) : null}

        {!showBlankStart && !showStoryboardOnly && !showDocument && !showTimelineOnly && !showMediaTimeline ? (
          <>
            <aside className="left-column">
              {showStoryboard ? (
                <StoryboardPanel
                  currentGenerationParams={paramStore.state}
                  elements={visibleStoryboardElements}
                  selectedElementId={visibleSelectedElementId}
                  onAddShot={isNewProject ? undefined : handleAddStoryboardShot}
                  onBindCurrentParams={handleBindStoryboardParams}
                  onDeleteElement={handleDeleteStoryboardElement}
                  onDuplicateElement={handleDuplicateStoryboardElement}
                  onGenerateAllShots={handleGenerateAllStoryboardShots}
                  onRegenerateElement={handleRegenerateStoryboardElement}
                  onReorderElement={handleReorderStoryboardElement}
                  onSelectElement={handleSelectStoryboardElement}
                  onUpdateElement={isNewProject ? undefined : handleUpdateStoryboardElement}
                />
              ) : null}
              {showMediaOnly ? (
                <MediaPanel
                  assets={isNewProject ? [] : mediaAssets}
                  storyboardElements={visibleStoryboardElements}
                  selectedAssetId={selectedMediaAssetId}
                  onDeleteAsset={handleDeleteMediaAsset}
                  onDeleteAssets={handleDeleteMediaAssets}
                  onSelectAsset={handleSelectMediaAsset}
                  onToggleFavorite={handleToggleMediaFavorite}
                  onUploadFiles={handleUploadMediaFiles}
                />
              ) : null}
            </aside>

            <section className="center-column">
              <CanvasPreview
                assets={isNewProject ? [] : assets}
                emptyPreview={isNewProject && visibleStoryboardElements.length === 0}
                selectedAsset={selectedMediaAsset}
                selectedElement={visibleSelectedElement}
                workspaceState={isNewProject ? 'skillCompleted' : state.workspaceState}
              />
              {showMedia && !showMediaOnly && !showTimeline ? (
                <MediaPanel
                  assets={isNewProject ? [] : mediaAssets}
                  storyboardElements={visibleStoryboardElements}
                  selectedAssetId={selectedMediaAssetId}
                  onDeleteAsset={handleDeleteMediaAsset}
                  onDeleteAssets={handleDeleteMediaAssets}
                  onSelectAsset={handleSelectMediaAsset}
                  onToggleFavorite={handleToggleMediaFavorite}
                  onUploadFiles={handleUploadMediaFiles}
                />
              ) : null}
              {showTimeline ? (
                <TimelinePanel
                  tracks={visibleTimelineTracks}
                  selectedClipId={visibleSelectedTimelineClipId}
                  onSelectClip={handleSelectTimelineClip}
                />
              ) : null}
            </section>
          </>
        ) : null}

        <aside className="right-column">
          <ChatPanel
            activeAgentPackage={agentPackages.activePackage}
            agentPackages={agentPackages.state.packages}
            assets={isNewProject ? [] : assets}
            enabledSkillIds={skillLibrary.enabledSkillIds}
            enabledSkills={skillLibrary.enabledSkills}
            generationTasks={isNewProject ? [] : generationTasks.tasks}
            messages={isNewProject ? [] : chatMessages}
            modelError={modelConfig.error}
            modelOptions={modelConfig.models}
            onPrimaryAction={() => dispatch({ type: 'advanceStage' })}
            onRefreshGenerationTask={generationTasks.refreshTask}
            onRunCreativePipelineTask={handleRunCreativePipelineTask}
            onRunLlmChatTask={handleRunLlmChatTask}
            onSkillDocumentGenerated={handleSkillDocumentGenerated}
            onStoryboardElementsGenerated={handleStoryboardElementsGenerated}
            onSubmitGenerationTask={handleSubmitGenerationTask}
            onSwitchAgentPackage={agentPackages.switchPackage}
            onToggleSkill={skillLibrary.toggleSkill}
            paramStore={paramStore}
            skills={skillLibrary.skills}
          />
        </aside>
      </main>

    </div>
  );
}
