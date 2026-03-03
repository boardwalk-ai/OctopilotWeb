// Shared TypeScript types and interfaces

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface CreditBalance {
  documentCredits: number;
  aiCredits: number;
}

export enum SubscriptionPlan {
  Free = "free",
  Basic = "basic",
  Pro = "pro",
}
