import type { Portal } from '@autojobs/shared/portals';
import { glints } from './glints';
import { jobstreet } from './jobstreet';
import { linkedin } from './linkedin';
import type { PortalAdapter } from './types';

export const ADAPTERS: Record<Portal, PortalAdapter> = { jobstreet, glints, linkedin };
export type { ApplySpec, Loader, PortalAdapter, ScrapedListing } from './types';
