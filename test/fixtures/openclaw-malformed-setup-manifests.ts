// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export function malformedOpenClawSetupManifests() {
  const validManifest = {
    id: "fixture",
    agent: "openclaw",
    description: "Fixture manifest",
    match: { modelIds: ["test-model"] },
    effects: { openclawCompat: {} },
  };
  return [
    {
      name: "non-object root",
      manifest: null,
      message: "manifest must be a JSON object",
    },
    {
      name: "missing id",
      manifest: { ...validManifest, id: "" },
      message: "field 'id' must be a non-empty string",
    },
    {
      name: "missing description",
      manifest: { ...validManifest, description: "" },
      message: "field 'description' must be a non-empty string",
    },
    {
      name: "non-object match",
      manifest: { ...validManifest, match: null },
      message: "field 'match' must be an object",
    },
    {
      name: "unknown match key",
      manifest: { ...validManifest, match: { modelIds: ["test-model"], family: "kimi" } },
      message: "unknown match keys: family",
    },
    {
      name: "empty modelIds",
      manifest: { ...validManifest, match: { modelIds: [] } },
      message: "match.modelIds must be a non-empty string array",
    },
    {
      name: "empty providerKey",
      manifest: { ...validManifest, match: { providerKey: "" } },
      message: "match.providerKey must be a non-empty string",
    },
    {
      name: "missing effects",
      manifest: { ...validManifest, effects: null },
      message: "field 'effects' must be a non-empty object",
    },
    {
      name: "non-object openclawCompat",
      manifest: { ...validManifest, effects: { openclawCompat: false } },
      message: "effects.openclawCompat must be an object",
    },
    {
      name: "non-object openclawTools",
      manifest: { ...validManifest, effects: { openclawTools: false } },
      message: "effects.openclawTools must be an object",
    },
    {
      name: "unknown openclawTools key",
      manifest: { ...validManifest, effects: { openclawTools: { webSearch: true } } },
      message: "unknown effects.openclawTools keys: webSearch",
    },
    {
      name: "non-array openclawPlugins",
      manifest: { ...validManifest, effects: { openclawPlugins: {} } },
      message: "effects.openclawPlugins must be an array",
    },
    {
      name: "non-object openclaw plugin",
      manifest: { ...validManifest, effects: { openclawPlugins: ["plugin"] } },
      message: "effects.openclawPlugins[0] must be an object",
    },
    {
      name: "missing openclaw plugin id",
      manifest: {
        ...validManifest,
        effects: {
          openclawPlugins: [
            {
              id: "",
              path: "openclaw-plugins/fixture",
              loadPath: "/usr/local/share/nemoclaw/openclaw-plugins/fixture",
            },
          ],
        },
      },
      message: "effects.openclawPlugins[0].id must be a non-empty string",
    },
    {
      name: "absolute openclaw plugin source path",
      manifest: {
        ...validManifest,
        effects: {
          openclawPlugins: [
            {
              id: "fixture-plugin",
              path: "/tmp/plugin",
              loadPath: "/usr/local/share/nemoclaw/openclaw-plugins/fixture",
            },
          ],
        },
      },
      message: "must be relative to nemoclaw-blueprint",
    },
    {
      name: "parent-relative openclaw plugin source path",
      manifest: {
        ...validManifest,
        effects: {
          openclawPlugins: [
            {
              id: "fixture-plugin",
              path: "../plugin",
              loadPath: "/usr/local/share/nemoclaw/openclaw-plugins/fixture",
            },
          ],
        },
      },
      message: "must be relative to nemoclaw-blueprint",
    },
  ];
}
