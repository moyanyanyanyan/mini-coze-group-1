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
});
