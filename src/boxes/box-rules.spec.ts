import { validateBoxRules } from './box-rules';

describe('validateBoxRules', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const at = (minutesFromNow: number) =>
    new Date(now.getTime() + minutesFromNow * 60_000);

  const valid = {
    originalPrice: 60000,
    price: 30000,
    pickupStart: at(60),
    pickupEnd: at(120),
  };

  it('корректный бокс — без ошибок', () => {
    expect(validateBoxRules(valid, now)).toEqual({});
  });

  describe('цена', () => {
    it('ровно 50% от исходной — можно', () => {
      expect(validateBoxRules({ ...valid, price: 30000 }, now)).toEqual({});
    });

    it('больше 50% — ошибка в поле price', () => {
      const errors = validateBoxRules({ ...valid, price: 30001 }, now);
      expect(errors).toHaveProperty('price');
    });

    it('нечётная исходная цена: 50% от 999 = 499,5 → 499 можно, 500 нельзя', () => {
      expect(
        validateBoxRules({ ...valid, originalPrice: 999, price: 499 }, now),
      ).toEqual({});
      expect(
        validateBoxRules({ ...valid, originalPrice: 999, price: 500 }, now),
      ).toHaveProperty('price');
    });
  });

  describe('окно выдачи', () => {
    it('начало в прошлом или прямо сейчас — ошибка в pickupStart', () => {
      expect(
        validateBoxRules(
          { ...valid, pickupStart: at(0), pickupEnd: at(60) },
          now,
        ),
      ).toHaveProperty('pickupStart');
      expect(
        validateBoxRules(
          { ...valid, pickupStart: at(-5), pickupEnd: at(60) },
          now,
        ),
      ).toHaveProperty('pickupStart');
    });

    it('ровно 30 минут и ровно 3 часа — можно', () => {
      expect(
        validateBoxRules(
          { ...valid, pickupStart: at(10), pickupEnd: at(40) },
          now,
        ),
      ).toEqual({});
      expect(
        validateBoxRules(
          { ...valid, pickupStart: at(10), pickupEnd: at(190) },
          now,
        ),
      ).toEqual({});
    });

    it('короче 30 минут — ошибка в pickupEnd', () => {
      expect(
        validateBoxRules(
          { ...valid, pickupStart: at(10), pickupEnd: at(39) },
          now,
        ),
      ).toHaveProperty('pickupEnd');
    });

    it('длиннее 3 часов — ошибка в pickupEnd', () => {
      expect(
        validateBoxRules(
          { ...valid, pickupStart: at(10), pickupEnd: at(191) },
          now,
        ),
      ).toHaveProperty('pickupEnd');
    });

    it('конец раньше начала — ошибка в pickupEnd', () => {
      expect(
        validateBoxRules(
          { ...valid, pickupStart: at(60), pickupEnd: at(30) },
          now,
        ),
      ).toHaveProperty('pickupEnd');
    });
  });

  it('возвращает все ошибки сразу', () => {
    const errors = validateBoxRules(
      { originalPrice: 100, price: 90, pickupStart: at(-1), pickupEnd: at(5) },
      now,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'pickupEnd',
      'pickupStart',
      'price',
    ]);
  });
});
