export type MailProvider = 'GMAIL' | 'OUTLOOK' | 'YANDEX' | 'MAILRU' | 'CUSTOM';
export type SyncStatus = 'IDLE' | 'SYNCING' | 'OK' | 'ERROR';
export type FolderRole = 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'JUNK' | 'ARCHIVE' | 'OTHER';
export type View = 'inbox' | 'unread' | 'flagged' | 'snoozed' | 'drafts' | 'sent' | 'archive' | 'junk' | 'trash' | 'all';
export const VIEWS: View[] = ['inbox', 'unread', 'flagged', 'snoozed', 'drafts', 'sent', 'archive', 'junk', 'trash', 'all'];
export const PROVIDERS: MailProvider[] = ['GMAIL', 'OUTLOOK', 'YANDEX', 'MAILRU', 'CUSTOM'];

export interface Address {
  name: string;
  address: string;
}

export interface MailAccount {
  id: string;
  email: string;
  displayName: string | null;
  provider: MailProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  signatureHtml: string | null;
  isDefault: boolean;
  syncEnabled: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface ProviderPreset {
  provider: MailProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  hint: string;
  domains: string[];
}

export interface MailFolder {
  id: string;
  accountId: string;
  path: string;
  name: string;
  role: FolderRole;
  unread: number;
  total: number;
  local: boolean;
  sortOrder: number;
}

export interface MailLabel {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  unread?: number;
}

export interface FoldersResponse {
  accounts: MailAccount[];
  folders: MailFolder[];
  labels: MailLabel[];
  views: { inbox: number; unread: number; flagged: number; snoozed: number; drafts: number };
}

export interface MailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  inline: boolean;
  contentId: string | null;
  cached: boolean;
}

export interface CaseRef {
  id: string;
  number: string;
  clientName: string;
}

export interface MessageRow {
  id: string;
  accountId: string;
  folderId: string;
  folderRole: FolderRole;
  threadKey: string | null;
  subject: string | null;
  from: Address | null;
  to: Address[];
  date: string;
  snippet: string | null;
  hasAttachments: boolean;
  size: number | null;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  isDraft: boolean;
  snoozedUntil: string | null;
  caseId: string | null;
  labels: MailLabel[];
  threadCount: number;
}

export interface MessageDetail extends MessageRow {
  messageId: string | null;
  inReplyTo: string | null;
  cc: Address[];
  bcc: Address[];
  replyTo: string | null;
  text: string | null;
  html: string | null;
  attachments: MailAttachment[];
  case: CaseRef | null;
  uid: number | null;
}

export interface ListResponse {
  items: MessageRow[];
  nextCursor: string | null;
  total?: number;
}

export interface ListParams {
  accountId?: string;
  folderId?: string;
  view?: View;
  labelId?: string;
  q?: string;
  from?: string;
  to?: string;
  hasAttachments?: boolean;
  unread?: boolean;
  threads?: boolean;
}

export type BulkAction = 'read' | 'unread' | 'flag' | 'unflag' | 'move' | 'trash' | 'archive' | 'snooze' | 'unsnooze' | 'label' | 'unlabel' | 'delete' | 'spam';
export type SnoozePreset = 'laterToday' | 'tomorrow' | 'thisWeekend' | 'nextWeek';
export const SNOOZE_PRESETS: SnoozePreset[] = ['laterToday', 'tomorrow', 'thisWeekend', 'nextWeek'];

export interface RuleConditions {
  match?: 'all' | 'any';
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
}

export interface RuleActions {
  addLabelId?: string;
  markRead?: boolean;
  flag?: boolean;
  moveToFolderId?: string;
  caseId?: string;
}

export interface MailRule {
  id: string;
  name: string;
  enabled: boolean;
  accountId: string | null;
  conditions: RuleConditions;
  actions: RuleActions;
  sortOrder: number;
  createdAt: string;
}

export interface MailTemplate {
  id: string;
  name: string;
  subject: string | null;
  html: string;
  shared: boolean;
  mine: boolean;
  canEdit: boolean;
  author: string | null;
  updatedAt: string;
}

/** What the compose window starts from. */
export interface ComposeSeed {
  key: string;
  accountId?: string;
  mode: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';
  original?: MessageDetail;
  draft?: MessageDetail;
  to?: Address[];
  subject?: string;
  html?: string;
}
