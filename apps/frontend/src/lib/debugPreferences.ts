export interface DebugPreferences {
  debugMode: boolean;
  showTurnBoundaries: boolean;
  showItemTypeBadges: boolean;
  showInspectControls: boolean;
  showRawEventControls: boolean;
  showReasoningBlocks: boolean;
}

export const defaultDebugPreferences: DebugPreferences = {
  debugMode: false,
  showTurnBoundaries: false,
  showItemTypeBadges: false,
  showInspectControls: false,
  showRawEventControls: false,
  showReasoningBlocks: false,
};

export interface ResolvedDebugPreferences extends DebugPreferences {}

export const resolveDebugPreferences = (preferences: DebugPreferences): ResolvedDebugPreferences => {
  if (preferences.debugMode) {
    return preferences;
  }

  return {
    ...preferences,
    showTurnBoundaries: false,
    showItemTypeBadges: false,
    showInspectControls: false,
    showRawEventControls: false,
    showReasoningBlocks: false,
  };
};
