export function isManualVerificationChecked(
  formData: FormData,
  fieldName: string,
) {
  const value = formData.get(fieldName);
  return value === "on" || value === "true";
}

export function manualReviewState(formData: FormData, fieldName: string) {
  const manuallyVerified = isManualVerificationChecked(formData, fieldName);
  return {
    manuallyVerified,
    reviewStatus: manuallyVerified
      ? ("VERIFIED" as const)
      : ("NEEDS_REVIEW" as const),
  };
}
