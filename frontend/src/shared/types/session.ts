import type { CharacterSummary } from './character';
import type { ScenarioRef } from './scenario';

export type SessionStatus = 'lobby' | 'in_progress' | 'paused' | 'ended';
export type ProgressMode = 'round' | 'free';

export interface SessionSettings {
  maxPlayers: number;
  isPublic: boolean;
  hasPassword: boolean;
  mode: ProgressMode;
  roundTimeLimitSec: number;
}

export interface SessionSummary {
  id: string;
  scenario: ScenarioRef;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  isPublic: boolean;
  status: SessionStatus;
  mode: ProgressMode;
  createdAt: string;
}

export interface LobbyPlayer {
  userId: string;
  nickname: string;
  isHost: boolean;
  ready: boolean;
  online: boolean;
  character: CharacterSummary | null;
}

/** Socket lobby:update payload */
export interface LobbyUpdate {
  hostId: string;
  inviteCode: string;
  settings: SessionSettings;
  players: LobbyPlayer[];
}

export interface SessionDetail extends LobbyUpdate {
  id: string;
  scenario: ScenarioRef;
  status: SessionStatus;
  createdAt: string;
}

export interface MySessionItem extends SessionSummary {
  myCharacterName: string | null;
  updatedAt: string;
  endingTitle: string | null;
}

export interface InviteLookup {
  sessionId: string;
  scenarioTitle: string;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  status: SessionStatus;
}
