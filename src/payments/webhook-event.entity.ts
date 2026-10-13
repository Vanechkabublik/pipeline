import { Entity, PrimaryColumn } from 'typeorm';

/**
 * Обработанные события вебхука. Провайдеры доставляют вебхуки
 * «как минимум один раз», поэтому одно событие может прийти повторно.
 * eventId — первичный ключ: вторая вставка того же eventId упирается
 * в конфликт, и мы понимаем, что событие уже обработано.
 */
@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryColumn()
  eventId: string;
}
