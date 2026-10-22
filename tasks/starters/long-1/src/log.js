function write(level, msg, fields = {}) {
  const line = { level, time: new Date().toISOString(), msg }
  for (const [key, value] of Object.entries(fields)) {
    line[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value
  }
  process.stdout.write(`${JSON.stringify(line)}\n`)
}

export const log = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
}
