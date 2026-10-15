import { adoptChatImage } from '../reply-media';
import { mediaDir } from '../stages/common';
import type { Ctx } from '../types';
import { playerName } from './digest';
import { messageLink } from './file-comments';
import type { PublicStore, StoredComment } from './store';

function sourceOf(comment: StoredComment): string {
  const link = messageLink(comment.chat, comment.messageId) ?? `message ${comment.messageId} of chat ${comment.chat}`;
  return `player chat message by ${playerName(comment.author)}, ${link}`;
}

async function download(ctx: Ctx, comment: StoredComment, issue: number, fileId: string): Promise<Buffer | null> {
  try {
    return await ctx.telegram.downloadFile(fileId);
  } catch (error) {
    ctx.log('public', issue, `an image of player comment ${comment.id} did not download: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function placeChatImages(ctx: Ctx, store: PublicStore): Promise<void> {
  for (const { comment, issue } of store.imagesToPlace()) {
    store.setImagesPlaced(comment.id, issue);
    for (const [index, fileId] of comment.images.entries()) {
      const name = `chat-${comment.chat}-${comment.messageId}-${index + 1}`;
      adoptChatImage(mediaDir(ctx, issue), name, sourceOf(comment), await download(ctx, comment, issue, fileId));
    }
  }
}
