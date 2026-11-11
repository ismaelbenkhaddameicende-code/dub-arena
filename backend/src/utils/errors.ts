/** Error de dominio: lleva el codigo HTTP con el que debe responder la API. */
export class ServiceError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

export const unavailable = (message: string, code = 'AI_UNAVAILABLE') => new ServiceError(message, 503, code);
