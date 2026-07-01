export interface Notifier {
  sendMessage(text: string): Promise<void>;
  sendPhoto(photoBuffer: Buffer, caption: string): Promise<void>;
}
