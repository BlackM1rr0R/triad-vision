import type { Role } from '@/lib/types';

export type ChannelKind = 'PUBLIC' | 'PRIVATE' | 'DM';
export type MemberRole = 'OWNER' | 'MEMBER';

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  role?: Role;
  email?: string;
}

export interface ChannelMember extends Person {
  memberRole: MemberRole;
  joinedAt: string;
}

export interface MessagePreview {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  kind: ChannelKind;
  name: string | null;
  topic: string | null;
  caseId: string | null;
  case: { id: string; number: string } | null;
  createdById: string | null;
  archivedAt: string | null;
  createdAt: string;
  memberCount: number;
  members: ChannelMember[];
  peer: Person | null;
  isMember: boolean;
  myRole: MemberRole | null;
  muted: boolean;
  pinned: boolean;
  lastReadAt: string | null;
  unread: number;
  mentions: number;
  lastMessage: MessagePreview | null;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  driveNodeId: string | null;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
  userIds?: string[];
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string | null;
  author: Person | null;
  body: string;
  parentId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  mentions: string[];
  editedAt: string | null;
  deletedAt: string | null;
  pinnedAt: string | null;
  createdAt: string;
  attachments: Attachment[];
  reactions: Reaction[];
  canEdit: boolean;
  canDelete: boolean;
  /** present on search results */
  channel?: { id: string; kind: ChannelKind; name: string | null };
  /** client-only: optimistic send in flight / failed */
  pending?: boolean;
  failed?: boolean;
}

export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
}

export interface PendingUpload {
  /** local key while uploading; the server key once done */
  localId: string;
  id: string | null;
  filename: string;
  mimeType: string;
  size: number;
  progress: number;
  error?: string;
  driveNodeId?: string | null;
}

export interface SharedFile extends Attachment {
  messageId: string;
  createdAt: string;
  author: Person | null;
}

export interface Poll {
  id: string;
  question: string;
  multiple: boolean;
  anonymous: boolean;
  closesAt: string | null;
  closedAt: string | null;
  open?: boolean;
  options: { id: string; text: string; count: number; mine?: boolean }[];
  totalVotes?: number;
}
