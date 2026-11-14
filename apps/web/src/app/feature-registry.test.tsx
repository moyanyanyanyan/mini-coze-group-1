import { describe, expect, it } from 'vitest';
import {
  getWorkspaceFeature,
  landingModules,
  workspaceFeatures,
  workspaceNavigation,
} from './feature-registry';

describe('feature registry', () => {
  it('uses unique ids and routes', () => {
    const ids = workspaceFeatures.map((feature) => feature.id);
    const routes = workspaceFeatures.map((feature) => feature.route);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('derives navigation and landing entries from the registry', () => {
    expect(workspaceNavigation).toEqual(
      workspaceFeatures.filter((feature) => feature.showInNavigation),
    );
    expect(landingModules).toEqual(
      workspaceFeatures.filter((feature) => feature.showInLanding),
    );
  });

  it('returns undefined for an unknown workspace route', () => {
    expect(getWorkspaceFeature('/workspace/not-found')).toBeUndefined();
  });

  it('resolves nested publish routes to the publish module', () => {
    expect(getWorkspaceFeature('/workspace/publish/docs')?.id).toBe('publish-sdk');
  });

  it('preserves workflow list and detail routes without matching similar prefixes', () => {
    expect(getWorkspaceFeature('/workspace')?.id).toBe('workspace');
    expect(getWorkspaceFeature('/workspace/workflows')?.id).toBe('workflow');
    expect(getWorkspaceFeature('/workspace/workflows/workflow-1')?.id).toBe('workflow');
    expect(getWorkspaceFeature('/workspace/workflows-invalid')).toBeUndefined();
  });

  it('registers operations in navigation and supports nested detail routes', () => {
    expect(getWorkspaceFeature('/workspace/operations/agents/agent-1/conversations/c-1')?.id).toBe('operations');
    expect(getWorkspaceFeature('/workspace/operations/knowledge/kb-1/documents/task-1')?.id).toBe('operations');
    expect(getWorkspaceFeature('/workspace/operations-invalid')).toBeUndefined();
    expect(workspaceNavigation.some(feature => feature.id === 'operations')).toBe(true);
    expect(landingModules.some(feature => feature.id === 'operations')).toBe(false);
  });
});
