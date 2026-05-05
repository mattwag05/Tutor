/**
 * Minimal StageStore structural types and a local scene-create API used by
 * the generation pipeline in web/. The full Stage API toolkit (stage-api.ts)
 * stays in services/openmaic/ until Phase B.4 retires that service.
 *
 * TODO(B.4): delete this file and import the real types from the merged tree.
 */

import type {
  Stage,
  Scene,
  SceneContent,
  SceneType,
  StageMode,
} from '@/lib/types/stage';

export interface StageStore {
  getState: () => {
    stage: Stage | null;
    scenes: Scene[];
    currentSceneId: string | null;
    mode: StageMode;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setState: (partial: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (listener: (state: any, prevState: any) => void) => () => void;
}

export interface CreateSceneParams {
  type: SceneType;
  title: string;
  content?: Partial<SceneContent>;
  order?: number;
  actions?: Scene['actions'];
}

export interface APIResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SceneAPI {
  scene: {
    create(params: CreateSceneParams): APIResult<string>;
  };
}

let _sceneCounter = 0;
function generateSceneId(): string {
  return `scene-${Date.now()}-${++_sceneCounter}`;
}

export function createLocalStageAPI(store: StageStore): SceneAPI {
  return {
    scene: {
      create(params: CreateSceneParams): APIResult<string> {
        try {
          const state = store.getState();
          if (!state.stage) {
            return { success: false, error: 'No stage set — cannot create scene without a stage' };
          }
          const sceneId = generateSceneId();
          const order = params.order ?? state.scenes.length;
          const newScene: Scene = {
            id: sceneId,
            stageId: state.stage.id,
            type: params.type,
            title: params.title,
            order,
            content: params.content as SceneContent,
            actions: params.actions,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          const newScenes = [...state.scenes, newScene].sort((a, b) => a.order - b.order);
          store.setState({ scenes: newScenes });
          return { success: true, data: sceneId };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    },
  };
}
