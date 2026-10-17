import type { CaseStatus, ReqKey, ReqStatus } from './types';

export const REQ_LABEL: Record<ReqKey, string> = {
  inc: 'Income',
  id: 'Identity',
  res: 'Residency',
  hh: 'Household members',
  shl: 'Shelter costs',
};

/** The document the prototype shows for each requirement. Invented, not a list of accepted proofs. */
export const REQ_DOC: Record<ReqKey, string> = {
  inc: 'Pay statement',
  id: 'Photo ID',
  res: 'Utility bill',
  hh: 'Household members form',
  shl: 'Lease',
};

// PLACEHOLDER: plain-language descriptions of what a household might send. Not real program rules.
export const REQ_ASK: Record<ReqKey, string> = {
  inc: 'Recent proof of earnings, such as pay statements from the last 30 days.',
  id: 'A photo ID for the head of household.',
  res: 'A recent bill or letter showing the home address.',
  hh: 'A signed household members form listing everyone who lives in the home.',
  shl: 'A lease, rent receipt or mortgage statement showing housing costs.',
};

export const REQ_STATUS_LABEL: Record<ReqStatus, string> = {
  v: 'Verified',
  r: 'Received, needs review',
  a: 'Requested, awaiting household',
  m: 'Missing, not requested',
};

export const STATUS_LABEL: Record<CaseStatus, string> = {
  review: 'Ready to review',
  missing: 'Documents missing',
  waiting: 'Waiting on household',
  verified: 'All verified',
  ready: 'Ready for decision',
  decided: 'Decided',
};

export const REQUEST_CHANNELS = ['Mailed letter', 'Portal message', 'Phone call (logged)'] as const;
export const RECEIVE_CHANNELS = ['Mail', 'Portal upload', 'In person', 'Fax'] as const;

// PLACEHOLDER: rejection reasons are invented for the prototype.
export const REJECT_REASONS = [
  'Hard to read or incomplete',
  'Wrong document for this requirement',
  'Out of date',
  'Details do not match the case record',
  'Other',
] as const;
