export const USER_ROLES = ['owner', 'admin', 'staff'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Profile returned by the API. The session cookie is never stored here. */
export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId: string;
  businessName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  businessName: string;
}
