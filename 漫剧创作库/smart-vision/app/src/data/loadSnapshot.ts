import snapshot from './project-snapshot.json';
import type { ProjectSnapshot } from '../types';

export const projectSnapshot = snapshot as ProjectSnapshot;

export const projects = projectSnapshot.projects;
export const taskColumns = projectSnapshot.taskColumns;
export const reviews = projectSnapshot.reviews;
export const artifacts = projectSnapshot.artifacts;
export const canvasStatus = projectSnapshot.canvasStatus;

export const getProjectById = (projectId: string) => projects.find((project) => project.id === projectId) ?? projects[0];
