export interface MessageWithUsername {
  id: number;
  roomId: number;
  userId: number;
  content: string;
  username: string;
  createdAt: Date;
}

export interface PaginatedMessages {
  data: MessageWithUsername[];
  total: number;
  page: number;
  limit: number;
}