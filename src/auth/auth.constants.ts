/** Имя httpOnly cookie, в которой живёт JWT */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Время жизни токена и cookie — 24 часа */
export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** «Стоимость» bcrypt: 10 раундов — разумный баланс скорости и стойкости */
export const BCRYPT_ROUNDS = 10;

/** То, что лежит внутри JWT */
export interface JwtPayload {
  sub: string; // id пользователя
}
