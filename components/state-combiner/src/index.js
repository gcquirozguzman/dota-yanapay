export function combineState(gsiState, visionState) {
  if (!gsiState) return null;
  return {
    ...gsiState,
    ...(visionState && { vision: visionState }),
  };
}
