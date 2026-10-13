/**
 * Бизнес-правила бокса, которые зависят от нескольких полей сразу
 * (обычные декораторы class-validator проверяют поля по отдельности).
 * Чистая функция без БД и Nest — поэтому её легко покрыть unit-тестами.
 */
export const MIN_PICKUP_WINDOW_MINUTES = 30;
export const MAX_PICKUP_WINDOW_MINUTES = 180;

export interface BoxRulesInput {
  originalPrice: number;
  price: number;
  pickupStart: Date;
  pickupEnd: Date;
}

/** Возвращает ошибки по полям; пустой объект — всё в порядке */
export function validateBoxRules(
  input: BoxRulesInput,
  now: Date = new Date(),
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  // price ≤ 50% от originalPrice. Сравниваем в целых числах (price * 2),
  // без деления — никаких дробей и ошибок округления.
  if (input.price * 2 > input.originalPrice) {
    errors.price = ['Цена со скидкой должна быть не больше 50% от исходной'];
  }

  if (input.pickupStart.getTime() <= now.getTime()) {
    errors.pickupStart = ['Начало выдачи должно быть в будущем'];
  }

  const windowMinutes =
    (input.pickupEnd.getTime() - input.pickupStart.getTime()) / 60_000;
  if (
    windowMinutes < MIN_PICKUP_WINDOW_MINUTES ||
    windowMinutes > MAX_PICKUP_WINDOW_MINUTES
  ) {
    errors.pickupEnd = ['Окно выдачи должно длиться от 30 минут до 3 часов'];
  }

  return errors;
}
