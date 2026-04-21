export function getDefaultOpenCodeTraitValue(
  options: Array<{ isDefault?: boolean; value: string }> | undefined,
) {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    options.find((option) => option.isDefault)?.value ??
    options[0]?.value ??
    null
  );
}

export function resolveOpenCodeTraitSelectionValue(
  options: Array<{ isDefault?: boolean; value: string }> | undefined,
  currentValue: string | null,
  preferredValue: string | null,
) {
  if (!options || options.length === 0) {
    return null;
  }

  if (currentValue && options.some((option) => option.value === currentValue)) {
    return currentValue;
  }

  if (
    preferredValue &&
    options.some((option) => option.value === preferredValue)
  ) {
    return preferredValue;
  }

  return getDefaultOpenCodeTraitValue(options);
}
