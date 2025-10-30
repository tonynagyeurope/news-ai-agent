// frontend/lib/types.ts
import { AllowedAction } from '@shared/types.js'

export interface ValidateInterestInput { raw: string; locale?: 'en'|'de'|'hu'|'ar'; }
export interface ValidateInterestOutput { valid: boolean; topic: string; reason?: string; }

export interface SiteItem { title: string; url: string; source: 'search'|'mock'; }
export interface FindSitesInput { topic: string; limit?: number; }
export interface FindSitesOutput { sites: SiteItem[]; }

export interface ClassifyActionInput { userIntent: string; }
export interface ClassifyActionOutput { action: AllowedAction; confidence: number; }

export interface ExecuteActionInput { action: AllowedAction; siteUrl: string; }
export interface ExecuteActionOutput {
  action: AllowedAction;
  siteUrl: string;
  result: Record<string, unknown>;
  audit: { latencyMs: number; fetchedBytes: number; truncated: boolean; };
  s3Key?: string;
}
