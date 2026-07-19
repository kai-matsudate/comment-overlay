function resolvePort(value, fallback) {
  const port = Number(value)

  return Number.isInteger(port) && port > 0 && port <= 65535
    ? port
    : fallback
}

module.exports = resolvePort
