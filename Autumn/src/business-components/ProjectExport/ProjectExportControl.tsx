import { useState } from 'react';
import { defaultProjectExportOptions } from '../../adapters/projects/mapProjectExport';
import type {
  ProjectExportFormat,
  ProjectExportFrameRate,
  ProjectExportOptions,
  ProjectExportResolution,
  ProjectExportTask,
} from '../../types/project';
import {
  getProjectExportFormatLabel,
  getProjectExportFrameRateLabel,
  getProjectExportResolutionLabel,
  getProjectExportStatusLabel,
  getProjectExportSummary,
} from '../../utils/projectExportDisplay';

export interface ProjectExportControlProps {
  task: ProjectExportTask | null;
  isCreating: boolean;
  error?: string | null;
  canExport: boolean;
  onStartExport: (options?: Partial<ProjectExportOptions>) => void;
}

const exportFormats: ProjectExportFormat[] = ['mp4', 'gif', 'mov'];
const exportResolutions: ProjectExportResolution[] = ['720p', '1080p', '4k'];
const exportFrameRates: ProjectExportFrameRate[] = [24, 30, 60];

export function ProjectExportControl({
  task,
  isCreating,
  error,
  canExport,
  onStartExport,
}: ProjectExportControlProps) {
  const [options, setOptions] = useState<ProjectExportOptions>(defaultProjectExportOptions);
  const isWorking = isCreating || task?.status === 'pending' || task?.status === 'running';
  const statusLabel = isCreating ? '创建中' : getProjectExportStatusLabel(task?.status);
  const progress = task?.progress ?? 0;
  const displayOptions = task?.options ?? options;
  const canStartExport = canExport && !isWorking;

  function updateOption<Key extends keyof ProjectExportOptions>(
    key: Key,
    value: ProjectExportOptions[Key],
  ) {
    setOptions((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <details className="project-export-control">
      <summary className="export-button" title="导出项目">
        {statusLabel}
      </summary>

      <div className="project-export-menu">
        <div className="project-export-menu__summary">
          <strong>{task ? getProjectExportSummary(task) : getProjectExportSummary({
            id: 'draft-export',
            projectId: 'draft-project',
            status: 'pending',
            progress: 0,
            options,
            createdAt: '',
            updatedAt: '',
          })}</strong>
          <span>
            字幕{' '}
            {displayOptions.includeSubtitles ? '开启' : '关闭'}{' '}
            · 画质{' '}
            {displayOptions.compressQuality ? '压缩' : '原画'}
          </span>
        </div>

        {task ? (
          <div className="project-export-progress" aria-label="导出进度">
            <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        ) : null}

        {task ? (
          <div className="project-export-task">
            <span>{getProjectExportStatusLabel(task.status)}</span>
            <strong>{task.progress}%</strong>
          </div>
        ) : null}

        {error || task?.error ? <p className="project-export-error">{error ?? task?.error}</p> : null}

        <div className="project-export-options">
          <div className="project-export-field">
            <span>格式</span>
            <div className="project-export-segmented">
              {exportFormats.map((format) => (
                <button
                  aria-pressed={options.format === format}
                  className={options.format === format ? 'project-export-segment project-export-segment--active' : 'project-export-segment'}
                  disabled={isWorking}
                  key={format}
                  onClick={() => updateOption('format', format)}
                  type="button"
                >
                  {getProjectExportFormatLabel(format)}
                </button>
              ))}
            </div>
          </div>

          <div className="project-export-field">
            <span>分辨率</span>
            <div className="project-export-segmented">
              {exportResolutions.map((resolution) => (
                <button
                  aria-pressed={options.resolution === resolution}
                  className={options.resolution === resolution ? 'project-export-segment project-export-segment--active' : 'project-export-segment'}
                  disabled={isWorking}
                  key={resolution}
                  onClick={() => updateOption('resolution', resolution)}
                  type="button"
                >
                  {getProjectExportResolutionLabel(resolution)}
                </button>
              ))}
            </div>
          </div>

          <div className="project-export-field">
            <span>帧率</span>
            <div className="project-export-segmented">
              {exportFrameRates.map((frameRate) => (
                <button
                  aria-pressed={options.frameRate === frameRate}
                  className={options.frameRate === frameRate ? 'project-export-segment project-export-segment--active' : 'project-export-segment'}
                  disabled={isWorking}
                  key={frameRate}
                  onClick={() => updateOption('frameRate', frameRate)}
                  type="button"
                >
                  {getProjectExportFrameRateLabel(frameRate)}
                </button>
              ))}
            </div>
          </div>

          <div className="project-export-toggles">
            <label>
              <input
                checked={options.includeSubtitles}
                disabled={isWorking}
                onChange={(event) => updateOption('includeSubtitles', event.currentTarget.checked)}
                type="checkbox"
              />
              <span>字幕</span>
            </label>
            <label>
              <input
                checked={options.compressQuality}
                disabled={isWorking}
                onChange={(event) => updateOption('compressQuality', event.currentTarget.checked)}
                type="checkbox"
              />
              <span>压缩</span>
            </label>
          </div>
        </div>

        {task?.status === 'completed' && task.downloadUrl ? (
          <a className="project-export-download" href={task.downloadUrl}>
            下载成片
          </a>
        ) : (
          <button
            className="project-export-submit"
            disabled={!canStartExport}
            onClick={() => onStartExport(options)}
            type="button"
          >
            {isWorking ? statusLabel : '开始导出'}
          </button>
        )}
      </div>
    </details>
  );
}
