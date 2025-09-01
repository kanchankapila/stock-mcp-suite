type Fields = Record<string, unknown>;

function toErrorPayload(err: unknown) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === 'object') return err as object;
  return { message: String(err) };
}

function emit(level: string, msg?: string, fields?: Fields) {
  const payload: any = {
    level,
    time: new Date().toISOString(),
    ...(fields || {}),
    msg: msg || fields?.msg || '',
  };
  // Normalize embedded error if present
  if ((fields as any)?.err) {
    payload.err = toErrorPayload((fields as any).err);
  }
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(arg1?: string | Fields, arg2?: string) {
    if (typeof arg1 === 'string') return emit('info', arg1);
    emit('info', arg2, arg1 || {});
  },
  warn(arg1?: string | Fields, arg2?: string) {
    if (typeof arg1 === 'string') return emit('warn', arg1);
    emit('warn', arg2, arg1 || {});
  },
  error(arg1?: string | (Fields & { err?: unknown }), arg2?: string) {
    if (typeof arg1 === 'string') return emit('error', arg1);
    emit('error', arg2, arg1 || {});
  },
  debug(arg1?: string | Fields, arg2?: string) {
    const enabled = process.env.LOG_LEVEL === 'debug';
    if (!enabled) return;
    if (typeof arg1 === 'string') return emit('debug', arg1);
    emit('debug', arg2, arg1 || {});
  }
};

export type { Fields };

