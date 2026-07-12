const parsePort = (value) => {
  const port = Number.parseInt(value ?? "3000", 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`GSI_PORT invalido: ${value}`);
  }
  return port;
};

export function loadConfig(env = process.env) {
  return {
    host: env.GSI_HOST ?? "127.0.0.1",
    port: parsePort(env.GSI_PORT),
    authToken: env.GSI_AUTH_TOKEN ?? "cambia-este-token",
    maxBodyBytes: 1024 * 1024,
  };
}
