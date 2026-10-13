import { Entity, PrimaryColumn } from 'typeorm';

// Уже обработанные события вебхука. eventId — первичный ключ, поэтому дубль не вставится.
@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryColumn()
  eventId: string;
}
