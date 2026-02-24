/**
 * Shared UI utility functions used across pages.
 */

/** Extract initials from a full name (max 2 chars). */
export const getInitials = (name: string): string =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
