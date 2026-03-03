// Stub de notificações — extensível para email, webhook, etc.
export async function notifyOwner({
  title,
  content,
}: {
  title: string;
  content: string;
}): Promise<boolean> {
  console.log(`[Notificação] ${title}: ${content}`);
  return true;
}
