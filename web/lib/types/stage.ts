// Stage and Scene data types (web/ copy — Phase B.1)
import type { Slide } from './slides';
import type { Action } from './action';
import type { PBLProjectConfig } from '@/lib/pbl/types';
import type { WidgetType, WidgetConfig, TeacherAction } from './widgets';

export type SceneType = 'slide' | 'quiz' | 'interactive' | 'pbl';

export type StageMode = 'autonomous' | 'playback';

export type Whiteboard = Omit<Slide, 'theme' | 'turningMode' | 'sectionTag' | 'type'>;

export interface Stage {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  languageDirective?: string;
  style?: string;
  whiteboard?: Whiteboard[];
  agentIds?: string[];
  generatedAgentConfigs?: Array<{
    id: string;
    name: string;
    role: string;
    persona: string;
    avatar: string;
    color: string;
    priority: number;
  }>;
  interactiveMode?: boolean;
}

export interface Scene {
  id: string;
  stageId: string;
  type: SceneType;
  title: string;
  order: number;
  content: SceneContent;
  actions?: Action[];
  whiteboards?: Slide[];
  multiAgent?: {
    enabled: boolean;
    agentIds: string[];
    directorPrompt?: string;
  };
  createdAt?: number;
  updatedAt?: number;
}

export type SceneContent = SlideContent | QuizContent | InteractiveContent | PBLContent;

export interface SlideContent {
  type: 'slide';
  canvas: Slide;
}

export interface QuizContent {
  type: 'quiz';
  questions: QuizQuestion[];
}

export interface QuizOption {
  label: string;
  value: string;
}

export interface QuizQuestion {
  id: string;
  type: 'single' | 'multiple' | 'short_answer';
  question: string;
  options?: QuizOption[];
  answer?: string[];
  analysis?: string;
  commentPrompt?: string;
  hasAnswer?: boolean;
  points?: number;
}

export interface InteractiveContent {
  type: 'interactive';
  url: string;
  html?: string;
  widgetType?: WidgetType;
  widgetConfig?: WidgetConfig;
  teacherActions?: TeacherAction[];
}

export interface PBLContent {
  type: 'pbl';
  projectConfig: PBLProjectConfig;
}

export type {
  UserRequirements,
  SceneOutline,
  GenerationSession,
  GenerationProgress,
  UploadedDocument,
} from './generation';
